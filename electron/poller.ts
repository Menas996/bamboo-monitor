import {
  BambooClient, BambooDeployResult, BambooBuildResult, pickLatestPlanBuild, buildResultToDeploy,
  type FavoritePlan,
} from './bamboo-client'
import Store from 'electron-store'
import { runGitWatchForFavorites, type PlanGitWatchResult } from './plan-git-watch'

export type { FavoritePlan }

interface PlanSnapshot {
  buildNumber: number
  buildState: string
  lifeCycleState: string
}

const store = new Store<{
  lastSeen: Record<string, number>
  lastSnapshot: Record<string, PlanSnapshot>
}>()

let pollingTimer: ReturnType<typeof setInterval> | null = null
let pollCycleInFlight = false
let gitWatchInFlight: Promise<void> | null = null

function isTerminalState(state: string): boolean {
  const s = state.toUpperCase()
  return s === 'SUCCESSFUL' || s === 'SUCCESS' || s === 'FAILED' || s === 'FAILURE' || s === 'CANCELLED' || s === 'NOT_BUILT'
}

function toDeployResult(
  r: BambooBuildResult,
  fav: FavoritePlan
): BambooDeployResult {
  const base = buildResultToDeploy(r, fav.projectKey)
  return {
    ...base,
    environment: { key: fav.planKey, name: fav.planName },
    project: { key: fav.projectKey, name: fav.planName },
    plan: { key: fav.planKey, name: fav.planName },
  }
}

export interface PollingOptions {
  autoDeployOnGitChange?: boolean
  auth?: { username: string; password: string }
  onAutoDeploy?: (payload: {
    fav: FavoritePlan
    status: PlanGitWatchResult
    queue: { success: boolean; buildResultKey?: string }
  }) => void
}

export function startPolling(
  client: BambooClient,
  favoritePlans: FavoritePlan[],
  intervalSec: number,
  onNewDeploys: (deploys: BambooDeployResult[]) => void,
  options?: PollingOptions
) {
  stopPolling()

  const lastSeen: Record<string, number> = store.get('lastSeen', {})
  const lastSnapshot: Record<string, PlanSnapshot> = store.get('lastSnapshot', {})
  let firstPoll = true

  async function poll() {
    if (favoritePlans.length === 0) return
    if (pollCycleInFlight) return
    pollCycleInFlight = true

    const wasFirstPoll = firstPoll
    const newDeploys: BambooDeployResult[] = []

    for (const fav of favoritePlans) {
      const { planKey } = fav
      try {
        const results = await client.getPlanResults(planKey)
        const latest = pickLatestPlanBuild(results)
        if (!latest) continue

        const buildId = latest.buildNumber ?? 0
        const state = latest.buildState ?? 'UNKNOWN'
        const life = latest.lifeCycleState ?? ''
        const prev = lastSnapshot[planKey]

        if (!wasFirstPoll) {
          const prevBuild = prev?.buildNumber ?? lastSeen[planKey] ?? 0
          const prevState = prev?.buildState ?? ''
          const newBuild = buildId > prevBuild
          const stateBecameTerminal =
            buildId === prevBuild &&
            !isTerminalState(prevState) &&
            isTerminalState(state)
          const newBuildTerminal =
            newBuild && isTerminalState(state) && (life === 'Finished' || life === '')

          if (stateBecameTerminal || newBuildTerminal) {
            const enriched = await client.enrichBuildResultForDeploy(latest)
            newDeploys.push(toDeployResult(enriched, fav))
          }
        }

        lastSnapshot[planKey] = { buildNumber: buildId, buildState: state, lifeCycleState: life }
        if (buildId > (lastSeen[planKey] ?? 0)) {
          lastSeen[planKey] = buildId
        }
      } catch (err) {
        console.error(`Poll error for plan ${planKey}:`, err)
      }
    }

    firstPoll = false

    if (newDeploys.length > 0) {
      store.set('lastSeen', lastSeen)
      store.set('lastSnapshot', lastSnapshot)
      onNewDeploys(newDeploys)
    } else {
      store.set('lastSnapshot', lastSnapshot)
      store.set('lastSeen', lastSeen)
    }

    const runGitWatch = !wasFirstPoll && !!options?.autoDeployOnGitChange && !!options.auth && favoritePlans.length > 0
    try {
      if (runGitWatch) {
        const run = () => runGitWatchForFavorites(client, favoritePlans, options!.auth!, (fav, status, queue) => {
          options!.onAutoDeploy?.({ fav, status, queue })
        })
        gitWatchInFlight = (gitWatchInFlight ?? Promise.resolve()).then(run).finally(() => {
          gitWatchInFlight = null
        })
        await gitWatchInFlight
      }
    } finally {
      pollCycleInFlight = false
    }
  }

  poll()
  pollingTimer = setInterval(poll, intervalSec * 1000)
}

export function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}
