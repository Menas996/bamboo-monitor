export function asArray<T>(val: T | T[] | null | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

export function getChangeMessage(c: Record<string, unknown>): string {
  for (const key of ['message', 'comment', 'commitMessage', 'subject', 'description', 'title']) {
    const v = c[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export interface NormalizedChange {
  author?: string
  message: string
  vcsRevisionKey?: string
  repositoryName?: string
}

export function collectChanges(detail: Record<string, unknown> | null | undefined): NormalizedChange[] {
  if (!detail) return []
  const seen = new Set<string>()
  const out: NormalizedChange[] = []

  const add = (raw: Record<string, unknown>) => {
    const msg = getChangeMessage(raw)
    const rev = (raw.vcsRevisionKey as string) || ''
    const dedupe = rev || `${raw.author}-${msg}`
    if (dedupe && seen.has(dedupe)) return
    if (dedupe) seen.add(dedupe)
    if (!msg && !rev) return
    out.push({
      author: (raw.author ?? raw.userName ?? raw.committer) as string | undefined,
      message: msg || rev.slice(0, 12),
      vcsRevisionKey: rev || undefined,
      repositoryName: raw.repositoryName as string | undefined,
    })
  }

  for (const c of asArray((detail.changes as { change?: unknown })?.change)) {
    add(c as Record<string, unknown>)
  }

  for (const v of asArray((detail.vcsRevisions as { vcsRevision?: unknown })?.vcsRevision)) {
    const vr = v as Record<string, unknown>
    for (const c of asArray((vr.changes as { change?: unknown })?.change ?? vr.change)) {
      add({
        ...(c as Record<string, unknown>),
        vcsRevisionKey: (c as Record<string, unknown>).vcsRevisionKey ?? vr.vcsRevisionKey,
        repositoryName: vr.repositoryName,
      })
    }
    const vrMsg = getChangeMessage(vr) || (typeof vr.commitMessage === 'string' ? vr.commitMessage : '')
    if (vrMsg || vr.vcsRevisionKey) {
      add({
        message: vrMsg,
        vcsRevisionKey: vr.vcsRevisionKey,
        author: vr.author ?? vr.userName,
        repositoryName: vr.repositoryName,
      })
    }
  }

  return out
}

const TERMINAL_BUILD = new Set(['SUCCESSFUL', 'SUCCESS', 'FAILED', 'FAILURE', 'CANCELLED'])

export function planKeyFromBuildResultKey(buildResultKey: string): string {
  const idx = buildResultKey.lastIndexOf('-')
  if (idx <= 0) return buildResultKey
  const suffix = buildResultKey.slice(idx + 1)
  if (/^\d+$/.test(suffix)) return buildResultKey.slice(0, idx)
  return buildResultKey
}

export function resolveActiveBuildKey(
  routeKey: string,
  planKey: string,
  pick: PlanBuildSnapshot | null
): string {
  if (!pick?.buildResultKey) return routeKey
  const routeBn = buildNumberFromResultKey(routeKey, planKey)
  const pickBn = pick.buildNumber ?? buildNumberFromResultKey(pick.buildResultKey, planKey)
  if (pickBn >= routeBn) return pick.buildResultKey
  return routeKey
}

export function buildNumberFromResultKey(buildResultKey: string, planKey?: string): number {
  if (planKey && buildResultKey.startsWith(`${planKey}-`)) {
    const n = Number(buildResultKey.slice(planKey.length + 1))
    if (Number.isFinite(n)) return n
  }
  const m = buildResultKey.match(/-(\d+)$/)
  return m ? Number(m[1]) : 0
}

function normalizeLifeToken(s?: string): string {
  return (s ?? '').toUpperCase().replace(/[\s_-]+/g, '')
}

export interface PlanBuildSnapshot {
  buildResultKey: string
  buildState: string
  lifeCycleState: string
  buildNumber?: number
}

export function isTerminalBuildState(buildState?: string): boolean {
  return TERMINAL_BUILD.has(normalizeLifeToken(buildState))
}

export function isBuildRunning(detail: {
  lifeCycleState?: string
  buildState?: string
}): boolean {
  if (isTerminalBuildState(detail.buildState)) return false
  const life = normalizeLifeToken(detail.lifeCycleState)
  if (life === 'FINISHED') return false
  if (life === 'INPROGRESS' || life === 'QUEUED' || life === 'PENDING') return true
  const build = normalizeLifeToken(detail.buildState)
  if (build === 'NOTBUILT') return true
  if (!build || build === 'UNKNOWN' || build === 'INPROGRESS' || build === 'RUNNING') return true
  return !TERMINAL_BUILD.has(build)
}

export function shouldShowDeployProgress(detail: {
  lifeCycleState?: string
  buildState?: string
}): boolean {
  if (isTerminalBuildState(detail.buildState)) return false
  const life = normalizeLifeToken(detail.lifeCycleState)
  if (life === 'FINISHED') return false
  if (life === 'QUEUED' || life === 'INPROGRESS' || life === 'PENDING') return true
  return isBuildRunning(detail)
}

export function extractBuildResultKey(item: Record<string, unknown>, planKey: string): string {
  const direct = item.buildResultKey ?? item.key
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const plan = item.plan as { key?: string } | undefined
  const pk = (typeof plan?.key === 'string' && plan.key) ? plan.key : planKey
  const bnRaw = item.buildNumber
  const bn = typeof bnRaw === 'number' ? bnRaw : Number(bnRaw)
  if (pk && Number.isFinite(bn) && bn > 0) return `${pk}-${bn}`

  const href = (item.link as { href?: string } | undefined)?.href
  if (typeof href === 'string') {
    const m = href.match(/\/(?:result|browse)\/([^/?#]+)/i)
    if (m?.[1]) return decodeURIComponent(m[1])
  }
  return ''
}

export function normalizePlanResults(raw: unknown, planKey?: string): PlanBuildSnapshot[] {
  if (raw == null) return []

  let list: unknown[]
  if (Array.isArray(raw)) {
    list = raw
  } else if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const key = extractBuildResultKey(o, planKey ?? '')
    if (key) {
      list = [raw]
    } else {
      const nested = (o.results as { result?: unknown })?.result
      list = nested == null ? [] : Array.isArray(nested) ? nested : [nested]
    }
  } else {
    return []
  }

  const out: PlanBuildSnapshot[] = []
  for (const r of list) {
    if (!r || typeof r !== 'object') continue
    const item = r as Record<string, unknown>
    const pk = planKey
      ?? (typeof (item.plan as { key?: string } | undefined)?.key === 'string'
        ? (item.plan as { key: string }).key
        : '')
    const buildResultKey = extractBuildResultKey(item, pk)
    if (!buildResultKey) continue
    const bnRaw = item.buildNumber
    const buildNumber = typeof bnRaw === 'number' ? bnRaw : Number.isFinite(Number(bnRaw)) ? Number(bnRaw) : undefined
    out.push({
      buildResultKey,
      buildState: String(item.buildState ?? 'UNKNOWN'),
      lifeCycleState: String(item.lifeCycleState ?? ''),
      buildNumber,
    })
  }
  return dedupePlanSnapshots(out)
}

export function dedupePlanSnapshots(results: PlanBuildSnapshot[]): PlanBuildSnapshot[] {
  const byKey = new Map<string, PlanBuildSnapshot>()
  for (const r of results) {
    byKey.set(r.buildResultKey, r)
  }
  return [...byKey.values()].sort(
    (a, b) => (b.buildNumber ?? buildNumberFromResultKey(b.buildResultKey)) -
      (a.buildNumber ?? buildNumberFromResultKey(a.buildResultKey))
  )
}

export function pickPlanBuildResult(results: PlanBuildSnapshot[]): PlanBuildSnapshot | null {
  const sorted = dedupePlanSnapshots(results)
  return sorted.length > 0 ? sorted[0] : null
}

export function pickFallbackBuildForDelete(
  results: PlanBuildSnapshot[],
  keyToDelete: string
): PlanBuildSnapshot | null {
  const others = dedupePlanSnapshots(results).filter((r) => r.buildResultKey !== keyToDelete)
  return others[0] ?? null
}

export function dedupeDeploysByPlan<T extends {
  plan?: { key: string }
  environment: { key: string }
  deployment?: { id?: number }
  buildResultKey?: string
}>(deploys: T[]): T[] {
  const map = new Map<string, T>()
  for (const d of deploys) {
    const planKey = d.plan?.key ?? d.environment.key
    const bn = d.deployment?.id
      ?? (d.buildResultKey ? buildNumberFromResultKey(d.buildResultKey, planKey) : 0)
    const prev = map.get(planKey)
    const prevBn = prev
      ? (prev.deployment?.id ?? (prev.buildResultKey ? buildNumberFromResultKey(prev.buildResultKey, planKey) : 0))
      : -1
    if (!prev || bn >= prevBn) map.set(planKey, d)
  }
  return [...map.values()].sort((a, b) => {
    const planKey = a.plan?.key ?? a.environment.key
    const bnA = a.deployment?.id ?? buildNumberFromResultKey(a.buildResultKey ?? '', planKey)
    const bnB = b.deployment?.id ?? buildNumberFromResultKey(b.buildResultKey ?? '', planKey)
    return bnB - bnA
  })
}

export function dedupeRawPlanResults(raw: unknown, planKey: string): Record<string, unknown>[] {
  if (raw == null) return []
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : normalizePlanResults(raw, planKey)

  const byBuildNumber = new Map<number, Record<string, unknown>>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const key = extractBuildResultKey(rec, planKey)
    if (!key) continue
    const bnRaw = rec.buildNumber
    const bn = typeof bnRaw === 'number' ? bnRaw : buildNumberFromResultKey(key, planKey)
    const prev = byBuildNumber.get(bn)
    if (!prev) {
      byBuildNumber.set(bn, { ...rec, buildResultKey: key, buildNumber: bn })
      continue
    }
    const prevKey = extractBuildResultKey(prev, planKey)
    if (bn > (prev.buildNumber as number) || key > prevKey) {
      byBuildNumber.set(bn, { ...rec, buildResultKey: key, buildNumber: bn })
    }
  }
  return [...byBuildNumber.values()].sort(
    (a, b) => (b.buildNumber as number) - (a.buildNumber as number)
  )
}

export function computeDeployProgress(detail: Record<string, unknown>): {
  percent: number
  currentStage: string | null
  completedStages: number
  totalStages: number
} {
  if (
    isTerminalBuildState(detail.buildState as string)
    || normalizeLifeToken(detail.lifeCycleState as string) === 'FINISHED'
  ) {
    const stages = asArray(
      (detail.stages as { stage?: unknown })?.stage
      ?? (detail.plan as { stages?: { stage?: unknown } })?.stages?.stage
    )
    return {
      percent: 100,
      currentStage: null,
      completedStages: stages.length,
      totalStages: stages.length,
    }
  }

  const stages = asArray(
    (detail.stages as { stage?: unknown })?.stage
    ?? (detail.plan as { stages?: { stage?: unknown } })?.stages?.stage
  ) as Array<{ name?: string; state?: string; status?: string }>

  if (stages.length === 0) {
    const life = normalizeLifeToken(detail.lifeCycleState as string)
    if (life === 'QUEUED') return { percent: 8, currentStage: null, completedStages: 0, totalStages: 0 }
    if (life === 'INPROGRESS' || life === 'PENDING') return { percent: 45, currentStage: null, completedStages: 0, totalStages: 0 }
    return { percent: 100, currentStage: null, completedStages: 0, totalStages: 0 }
  }

  const terminal = new Set(['SUCCESSFUL', 'SUCCESS', 'FAILED', 'FAILURE', 'NOT_EXECUTED', 'SKIPPED', 'CANCELLED'])
  let completed = 0
  let currentStage: string | null = null
  let inProgressIndex = -1

  stages.forEach((s, i) => {
    const st = String(s.state ?? s.status ?? '').toUpperCase()
    if (st === 'INPROGRESS' || st === 'RUNNING' || st === 'PENDING') {
      currentStage = s.name ?? `Stage ${i + 1}`
      inProgressIndex = i
    } else if (terminal.has(st)) {
      completed++
    }
  })

  let percent = Math.round((completed / stages.length) * 100)
  if (inProgressIndex >= 0) {
    percent = Math.min(99, Math.round(((inProgressIndex + 0.5) / stages.length) * 100))
  } else if (normalizeLifeToken(detail.lifeCycleState as string) === 'INPROGRESS' && completed < stages.length) {
    percent = Math.max(percent, 10)
  }
  if (normalizeLifeToken(detail.lifeCycleState as string) === 'FINISHED') percent = 100

  return { percent, currentStage, completedStages: completed, totalStages: stages.length }
}
