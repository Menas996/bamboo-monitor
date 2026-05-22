import {
  BambooClient, BambooDeployResult, BambooBuildResult, pickLatestPlanBuild, buildResultToDeploy,
} from './bamboo-client'
import Store from 'electron-store'

export interface FavoritePlan {
  planKey: string
  projectKey: string
  planName: string
}

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

export function startPolling(
  client: BambooClient,
  favoritePlans: FavoritePlan[],
  intervalSec: number,
  onNewDeploys: (deploys: BambooDeployResult[]) => void
) {
  stopPolling()

  const lastSeen: Record<string, number> = store.get('lastSeen', {})
  const lastSnapshot: Record<string, PlanSnapshot> = store.get('lastSnapshot', {})
  let firstPoll = true

  async function poll() {
    if (favoritePlans.length === 0) return

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

        if (!firstPoll) {
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
