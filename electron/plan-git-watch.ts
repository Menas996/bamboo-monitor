import Store from 'electron-store'
import {
  BambooClient,
  BambooBuildResult,
  type FavoritePlan,
} from './bamboo-client'
import { gitLsRemoteHead } from './git-remote'
import { logger } from './lib/logger'

export interface PlanGitWatchResult {
  planKey: string
  hasNewCommits: boolean
  builtRevision?: string
  remoteRevision?: string
  branch?: string
  repositoryUrl?: string
  reason?: string
}

interface GitWatchStore {
  lastAutoDeployRevision: Record<string, string>
  lastRemoteRevision: Record<string, string>
}

const watchStore = new Store<GitWatchStore>({
  defaults: {
    lastAutoDeployRevision: {},
    lastRemoteRevision: {},
  },
})

function isActiveBuild(b: BambooBuildResult | null): boolean {
  if (!b) return false
  const life = (b.lifeCycleState ?? '').toUpperCase().replace(/[\s_-]+/g, '')
  const st = (b.buildState ?? '').toUpperCase()
  if (life === 'NOTBUILT' || st === 'NOT_BUILT' || st === 'NOTBUILT') return false
  if (life === 'FINISHED' && (st === 'SUCCESSFUL' || st === 'SUCCESS' || st === 'FAILED' || st === 'FAILURE')) {
    return false
  }
  if (life === 'QUEUED' || life === 'INPROGRESS' || life === 'PENDING') return true
  return st === 'INPROGRESS' || st === 'RUNNING'
}

function pickLatestFinishedBuild(results: BambooBuildResult[]): BambooBuildResult | null {
  const sorted = [...results].sort((a, b) => (b.buildNumber ?? 0) - (a.buildNumber ?? 0))
  for (const r of sorted) {
    const life = (r.lifeCycleState ?? '').toUpperCase()
    if (life === 'FINISHED' || life === '') return r
  }
  return sorted[0] ?? null
}

export async function checkPlanGitUpdates(
  client: BambooClient,
  fav: FavoritePlan,
  auth: { username: string; password: string }
): Promise<PlanGitWatchResult> {
  const { planKey } = fav
  const base: PlanGitWatchResult = { planKey, hasNewCommits: false }

  try {
    const results = await client.getPlanResults(planKey)
    const activeBuild = results.find((r) => isActiveBuild(r))
    if (activeBuild) {
      return { ...base, reason: 'build_active' }
    }

    const finished = pickLatestFinishedBuild(results)
    const builtRevision = finished?.buildResultKey
      ? await client.getBuildVcsRevision(finished.buildResultKey)
      : null
    if (!builtRevision) {
      return { ...base, reason: 'no_built_revision' }
    }

    const repo = await client.resolvePlanRepository(fav, auth)
    let remoteRevision: string | null = null

    if (repo?.url) {
      remoteRevision = await gitLsRemoteHead(repo.url, repo.branch, auth)
    }

    if (!remoteRevision) {
      remoteRevision = await client.getPlanDetectedVcsRevision(planKey)
    }

    if (!remoteRevision) {
      return {
        ...base,
        builtRevision,
        reason: repo?.url ? 'remote_unavailable' : 'no_repository_url',
      }
    }

    const prevRemote = watchStore.get('lastRemoteRevision', {})[planKey]
    watchStore.set('lastRemoteRevision', {
      ...watchStore.get('lastRemoteRevision', {}),
      [planKey]: remoteRevision,
    })

    const lastDeployed = watchStore.get('lastAutoDeployRevision', {})[planKey]
    const hasNew = remoteRevision !== builtRevision
    const alreadyTriggered = lastDeployed === remoteRevision

    return {
      planKey,
      hasNewCommits: hasNew && !alreadyTriggered,
      builtRevision,
      remoteRevision,
      branch: repo?.branch,
      repositoryUrl: repo?.url,
      reason: hasNew
        ? (alreadyTriggered ? 'already_queued_for_revision' : prevRemote !== remoteRevision ? 'new_commits' : 'ahead_of_build')
        : 'up_to_date',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('GIT', `checkPlanGitUpdates(${planKey}): ${msg}`)
    return { ...base, reason: 'error' }
  }
}

export function markAutoDeployTriggered(planKey: string, remoteRevision: string): void {
  watchStore.set('lastAutoDeployRevision', {
    ...watchStore.get('lastAutoDeployRevision', {}),
    [planKey]: remoteRevision,
  })
}

export async function runGitWatchForFavorites(
  client: BambooClient,
  favorites: FavoritePlan[],
  auth: { username: string; password: string },
  onAutoDeploy: (fav: FavoritePlan, result: PlanGitWatchResult, queue: { success: boolean; buildResultKey?: string }) => void
): Promise<void> {
  for (const fav of favorites) {
    const status = await checkPlanGitUpdates(client, fav, auth)
    if (!status.hasNewCommits || !status.remoteRevision) continue

    const results = await client.getPlanResults(fav.planKey)
    if (results.find((r) => isActiveBuild(r))) {
      markAutoDeployTriggered(fav.planKey, status.remoteRevision)
      continue
    }

    logger.info('GIT', `New commits on ${fav.planKey}, queueing build`, {
      built: status.builtRevision,
      remote: status.remoteRevision,
    })

    const queue = await client.queueBuild(fav.planKey)
    if (queue.success || queue.benignSkip) {
      markAutoDeployTriggered(fav.planKey, status.remoteRevision)
    }
    if (queue.benignSkip) continue
    onAutoDeploy(fav, status, queue)
  }
}
