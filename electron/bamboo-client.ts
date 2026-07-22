import { logger } from './lib/logger'
import {
  extractGitUrlsFromJson, findGitUrlInValue, findRevisionHashInJson, pickGitBranch,
  pickPreferredVcsBranch,
} from './git-remote'
import Store from 'electron-store'
import {
  isStrutsActionSuccess, isSameOriginUrl, isValidBuildResultKey, isValidPlanKey,
  sanitizeBuildVariables, validateServerUrl,
} from './lib/security'

const planRepoCache = new Store<{
  planGitRepos: Record<string, { url: string; branch: string }>
  gitRepositoryUrls: Record<string, string>
}>({
  defaults: { planGitRepos: {}, gitRepositoryUrls: {} },
})

export function getGitRepositoryUrlMapping(key: string): string | undefined {
  const map = planRepoCache.get('gitRepositoryUrls', {})
  const k = key.trim()
  return map[k] || map[k.toLowerCase()]
}

export function setGitRepositoryUrlMappings(map: Record<string, string>): void {
  planRepoCache.set('gitRepositoryUrls', map)
}

function projectKeyFromPlanKey(planKey: string): string {
  const idx = planKey.indexOf('-')
  return idx > 0 ? planKey.slice(0, idx) : planKey
}

export interface FavoritePlan {
  planKey: string
  projectKey: string
  planName: string
  repositoryUrl?: string
  repositoryBranch?: string
}

// --- Types matching your Bamboo 6.10.4 server responses ---

export interface BambooProject {
  key: string
  name: string
  description?: string
  link?: { href: string; rel: string }
}

export interface BambooPlan {
  key: string
  name: string
  shortName: string
  shortKey: string
  type: string
  enabled: boolean
  planKey?: { key: string }
  link?: { href: string; rel: string }
}

export interface BambooBuildResult {
  buildResultKey: string
  lifeCycleState?: string
  buildState?: string
  buildNumber?: number
  startTime?: number
  finishedDate?: number
  buildDuration?: number
  buildDurationInSeconds?: number
  buildReason?: string
  reason?: string
  triggerReason?: string
  changes?: { changes: { changeSet: any[] } }
  plan?: BambooPlan
  link?: { href: string; rel: string }
}

export interface BambooBuildResults {
  results: {
    size: number
    expand: string
    'start-index': number
    'max-result': number
    result: BambooBuildResult | BambooBuildResult[]
  }
}

interface BambooQueuedBuild {
  planKey: string
  buildNumber: number
  buildResultKey: string
  triggerReason?: string
}

interface BambooQueueResponse {
  queuedBuilds?: {
    queuedBuild?: BambooQueuedBuild | BambooQueuedBuild[]
  }
}

export interface QueueBuildResult {
  success: boolean
  buildResultKey?: string
  statusCode?: number
  errorMessage?: string
  /** 已有构建在跑或并发上限，非权限/配置错误 */
  benignSkip?: boolean
}

function coerceBuildResults(
  result: BambooBuildResult | BambooBuildResult[] | null | undefined
): BambooBuildResult[] {
  if (result == null) return []
  return Array.isArray(result) ? result : [result]
}

function coerceQueuedBuilds(raw: BambooQueuedBuild | BambooQueuedBuild[] | null | undefined): BambooQueuedBuild[] {
  if (raw == null) return []
  return Array.isArray(raw) ? raw : [raw]
}

function mergeBuildResultsByKey(...groups: BambooBuildResult[][]): BambooBuildResult[] {
  const byKey = new Map<string, BambooBuildResult>()
  for (const group of groups) {
    for (const b of group) {
      if (!b.buildResultKey) continue
      const prev = byKey.get(b.buildResultKey)
      const bn = b.buildNumber ?? 0
      const prevBn = prev?.buildNumber ?? 0
      if (!prev || bn >= prevBn) byKey.set(b.buildResultKey, b)
    }
  }
  return [...byKey.values()].sort((a, b) => (b.buildNumber ?? 0) - (a.buildNumber ?? 0))
}

const TERMINAL_BUILD_STATES = new Set([
  'SUCCESSFUL', 'SUCCESS', 'FAILED', 'FAILURE', 'CANCELLED', 'CANCELED',
  'NOTBUILT', 'INCOMPLETE', 'STOPPED',
])

export function pickLatestPlanBuild(results: BambooBuildResult[]): BambooBuildResult | null {
  if (results.length === 0) return null
  const sorted = [...results].sort((a, b) => (b.buildNumber ?? 0) - (a.buildNumber ?? 0))
  for (const r of sorted) {
    const life = (r.lifeCycleState ?? '').toUpperCase().replace(/[\s_-]+/g, '')
    if (life === 'FINISHED' || life === 'NOTBUILT') continue
    if (life === 'INPROGRESS' || life === 'QUEUED' || life === 'PENDING') return r
    const st = (r.buildState ?? '').toUpperCase().replace(/[\s_-]+/g, '')
    if (TERMINAL_BUILD_STATES.has(st)) continue
    if (st === 'INPROGRESS' || st === 'RUNNING') return r
  }
  return sorted[0] ?? null
}

function dedupeBuildResultsByPlan(builds: BambooBuildResult[]): BambooBuildResult[] {
  const map = new Map<string, BambooBuildResult>()
  for (const b of builds) {
    const planKey = b.plan?.key ?? ''
    if (!planKey) continue
    const bn = b.buildNumber ?? 0
    const prev = map.get(planKey)
    if (!prev || bn > (prev.buildNumber ?? 0)) map.set(planKey, b)
  }
  return [...map.values()].sort((a, b) => (b.buildNumber ?? 0) - (a.buildNumber ?? 0))
}

function parseTimestamp(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
    const d = Date.parse(v)
    if (Number.isFinite(d) && d > 0) return d
  }
  return undefined
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function coerceReasonRaw(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    for (const k of ['html', 'body', 'text', 'reason', 'name', 'description', 'summary']) {
      const v = o[k]
      if (typeof v === 'string' && v.trim()) return v
    }
  }
  return ''
}

function extractTriggerLabel(b: BambooBuildResult): string {
  const extra = b as BambooBuildResult & Record<string, unknown>
  const raw =
    coerceReasonRaw(b.buildReason) ||
    coerceReasonRaw(extra.reasonSummary) ||
    coerceReasonRaw(b.reason) ||
    coerceReasonRaw(b.triggerReason) ||
    ''
  if (!raw.trim()) return ''
  const text = stripHtml(raw)
  if (!text) return ''
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

function parseBuildStartTime(b: BambooBuildResult): number | undefined {
  const extra = b as BambooBuildResult & Record<string, unknown>
  return (
    parseTimestamp(b.startTime) ??
    parseTimestamp(extra.buildStartedTime) ??
    parseTimestamp(extra.buildDate) ??
    parseTimestamp(extra.buildStarted)
  )
}

function parseBuildFinishedTime(b: BambooBuildResult): number | undefined {
  const extra = b as BambooBuildResult & Record<string, unknown>
  return (
    parseTimestamp(b.finishedDate) ??
    parseTimestamp(extra.buildCompletedDate) ??
    parseTimestamp(extra.buildCompletedTime) ??
    parseTimestamp(extra.buildFinishedTime)
  )
}

function hasDeployMeta(b: BambooBuildResult): boolean {
  const n = normalizeBambooBuildResult(b)
  return !!(extractTriggerLabel(n) && (parseBuildStartTime(n) || parseBuildFinishedTime(n)))
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    out.push(...await Promise.all(batch.map(fn)))
  }
  return out
}

export function normalizeBambooBuildResult(b: BambooBuildResult): BambooBuildResult {
  const buildReason = b.buildReason ?? b.reason
  const reason = b.reason ?? b.buildReason
  return {
    ...b,
    buildReason,
    reason,
    startTime: parseBuildStartTime(b),
    finishedDate: parseBuildFinishedTime(b),
  }
}

export interface PlanHistoryRow {
  buildResultKey: string
  buildState?: string
  lifeCycleState?: string
  buildNumber?: number
  reason?: string
  startTime?: number
  buildDuration?: number
  buildDurationInSeconds?: number
}

export function buildResultToPlanHistoryRow(b: BambooBuildResult): PlanHistoryRow {
  const n = normalizeBambooBuildResult(b)
  const extra = n as BambooBuildResult & Record<string, unknown>
  const trigger = extractTriggerLabel(n)
  const start = parseBuildStartTime(n)
  const finish = parseBuildFinishedTime(n)
  let buildDurationInSeconds = typeof n.buildDurationInSeconds === 'number'
    ? n.buildDurationInSeconds
    : undefined
  let buildDuration = typeof n.buildDuration === 'number' ? n.buildDuration : undefined
  if (buildDurationInSeconds == null && typeof extra.buildDurationInSeconds === 'number') {
    buildDurationInSeconds = extra.buildDurationInSeconds
  }
  if (buildDuration == null && typeof extra.buildDuration === 'number') {
    buildDuration = extra.buildDuration
  }
  if (buildDurationInSeconds == null && start && finish && finish > start) {
    buildDurationInSeconds = Math.round((finish - start) / 1000)
  }
  return {
    buildResultKey: n.buildResultKey,
    buildState: n.buildState,
    lifeCycleState: n.lifeCycleState,
    buildNumber: n.buildNumber,
    reason: trigger || undefined,
    startTime: start,
    buildDuration,
    buildDurationInSeconds,
  }
}

export function buildResultToDeploy(b: BambooBuildResult, projectKey: string): BambooDeployResult {
  const normalized = normalizeBambooBuildResult(b)
  const trigger = extractTriggerLabel(normalized)
  const started = normalized.startTime
  const finished = normalized.finishedDate
  return {
    buildResultKey: normalized.buildResultKey,
    deploymentResult: {
      deploymentState: normalized.buildState ?? 'UNKNOWN',
      state: normalized.buildState ?? 'UNKNOWN',
      startedDate: started,
      finishedDate: finished,
      reason: trigger || undefined,
      initiator: trigger ? { name: trigger } : undefined,
    },
    environment: {
      key: normalized.plan?.key ?? projectKey,
      name: normalized.plan?.name ?? projectKey,
    },
    project: { key: projectKey, name: projectKey },
    plan: normalized.plan?.key
      ? { key: normalized.plan.key, name: normalized.plan.name ?? normalized.plan.key }
      : undefined,
    deployment: {
      id: normalized.buildNumber ?? 0,
      deploymentState: normalized.buildState ?? 'UNKNOWN',
    },
  }
}

// Keep old types for backward compatibility with renderer
export interface BambooDeployProject {
  key: string
  name: string
  description?: string
  environments: { key: string; name: string }[]
}

export interface BambooDeployResult {
  buildResultKey?: string
  deploymentResult: {
    deploymentState: string
    state: string
    startedDate?: number
    finishedDate?: number
    reason?: string
    initiator?: { name: string }
  } | null
  environment: { key: string; name: string }
  project: { key: string; name: string }
  plan?: { key: string; name: string }
  deployment?: { id: number; deploymentState: string }
}

const TASK_FORM_SYSTEM_KEYS = new Set([
  'atl_token', 'buildKey', 'planKey', 'taskId', 'save', 'create', 'checkBoxFields',
  'createTaskKey', 'pluginKey', 'decorator', 'confirm', 'bamboo.successReturnMode',
  'os_destination', 'submit',
])

const MULTILINE_TASK_FIELDS = new Set([
  'scriptBody', 'script', 'argument', 'environmentVariables', 'commandLine',
])

type TaskFieldMeta = {
  key: string
  type: 'text' | 'textarea' | 'select' | 'checkbox'
  options?: { value: string; label: string }[]
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function stripHtmlText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function extractTasksFromPlanDetail(planDetail: any): any[] {
  const out: any[] = []
  const pushTasks = (raw: any) => {
    if (!raw) return
    if (Array.isArray(raw)) out.push(...raw)
    else out.push(raw)
  }
  pushTasks(planDetail?.tasks?.task)
  const stageArr = planDetail?.stages?.stage
  const stages = Array.isArray(stageArr) ? stageArr : stageArr ? [stageArr] : []
  for (const stage of stages) {
    const jobsRaw = stage?.jobs?.job ?? stage?.plans?.plan
    const jobs = Array.isArray(jobsRaw) ? jobsRaw : jobsRaw ? [jobsRaw] : []
    for (const job of jobs) pushTasks(job?.tasks?.task)
  }
  return out
}

function parseTasksFromEditBuildTasksHtml(html: string): any[] {
  const tasks: any[] = []
  const seen = new Set<string>()
  const pushTask = (task: {
    id: number
    name?: string
    description?: string
    pluginKey?: string
    disabled?: boolean
    isFinalising?: boolean
  }) => {
    const id = String(task.id)
    if (seen.has(id)) return
    if (!task.name && !task.description) return
    if (task.name && /^(delete\s*task|edit\s*task|×|x)$/i.test(task.name.trim())) return
    seen.add(id)
    tasks.push({
      id: task.id,
      name: task.name,
      description: task.description || task.name,
      userDescription: task.description,
      pluginKey: task.pluginKey,
      isEnabled: task.disabled !== true,
      isFinalising: task.isFinalising === true,
    })
  }

  const itemRe = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi
  let itemMatch: RegExpExecArray | null
  while ((itemMatch = itemRe.exec(html)) !== null) {
    const attrs = itemMatch[1]
    const body = itemMatch[2]
    const id = attrs.match(/\bid=["']task-(\d+)["']/i)?.[1]
      || attrs.match(/\bdata-task-id=["'](\d+)["']/i)?.[1]
      || body.match(/editTask\.action\?[^"'>\s]*\btaskId=(\d+)/i)?.[1]
    if (!id) continue
    const titleMatch = body.match(/class=["'][^"']*item-title[^"']*["'][^>]*>([\s\S]*?)<\//i)
      || body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)
    const nameFromTitle = titleMatch ? stripHtmlText(titleMatch[1]) : ''
    const summaryMatch = body.match(
      /class=["'][^"']*(?:item-description|task-summary|task-description)[^"']*["'][^>]*>([\s\S]*?)<\//i,
    )
    const description = summaryMatch ? stripHtmlText(summaryMatch[1]) : ''
    const titleLink = body.match(
      /<a\b[^>]*href=["'][^"']*editTask\.action\?[^"']*taskId=\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    )
    const nameFromLink = titleLink ? stripHtmlText(titleLink[1]) : ''
    let name = nameFromTitle || nameFromLink
    if (name && description && name.endsWith(description)) {
      name = name.slice(0, name.length - description.length).trim()
    }
    if (!name && description) name = description
    const pluginFromClass = attrs.match(/task\.builder\.[\w.-]+/i)?.[0]
      || body.match(/task\.builder\.[\w.-]+/i)?.[0]
      || body.match(/pluginKey=([^&"']+)/i)?.[1]
    const pluginKey = pluginFromClass
      ? (pluginFromClass.includes('pluginKey=') || pluginFromClass.includes('%3A')
        ? decodeURIComponent(pluginFromClass.replace(/^pluginKey=/i, ''))
        : pluginFromClass.includes(':')
          ? pluginFromClass
          : `com.atlassian.bamboo.plugins.scripttask:${pluginFromClass}`)
      : inferPluginKeyFromTaskName(name)
    const disabled = /\bDISABLED\b/i.test(body)
      || /\btask-disabled\b/i.test(attrs + body)
      || /\bisDisabled\b/i.test(attrs)
    const isFinalising = /\bfinal\b/i.test(attrs) || /finalTasks|final-tasks/i.test(html.slice(Math.max(0, itemMatch.index - 80), itemMatch.index))
    pushTask({
      id: Number(id),
      name: name || undefined,
      description: description || name || undefined,
      pluginKey,
      disabled,
      isFinalising,
    })
  }

  if (tasks.length === 0) {
    const linkRe = /<a\b[^>]*href=["']([^"']*editTask\.action\?[^"']*taskId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
    let linkMatch: RegExpExecArray | null
    while ((linkMatch = linkRe.exec(html)) !== null) {
      const id = linkMatch[2]
      const name = decodeHtmlEntities(linkMatch[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      if (!name || /delete\s*task/i.test(name)) continue
      const after = html.slice(linkMatch.index, linkMatch.index + 600)
      const summaryMatch = after.match(
        /class=["'][^"']*(?:task-summary|task-description)[^"']*["'][^>]*>([\s\S]*?)<\//i,
      )
      const description = summaryMatch
        ? decodeHtmlEntities(summaryMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        : name
      pushTask({
        id: Number(id),
        name,
        description,
        pluginKey: inferPluginKeyFromTaskName(name),
        disabled: /\bDISABLED\b/i.test(after.slice(0, 400)),
      })
    }
  }
  return tasks
}

function inferPluginKeyFromTaskName(name: string): string | undefined {
  const lower = (name || '').toLowerCase()
  if (lower.includes('script')) return 'com.atlassian.bamboo.plugins.scripttask:task.builder.script'
  if (lower.includes('command')) return 'com.atlassian.bamboo.plugins.scripttask:task.builder.command'
  if (lower.includes('source code checkout') || lower.includes('checkout')) {
    return 'com.atlassian.bamboo.plugins.vcs:task.vcs.checkout'
  }
  if (lower === 'npm' || lower.includes('npm')) {
    return 'com.atlassian.bamboo.plugins.bamboo-npm-plugin:task.builder.npm'
  }
  return undefined
}

function parseBambooTaskEditForm(html: string): {
  fields: Record<string, string>
  checkboxes: Record<string, boolean>
  form: Record<string, string>
  fieldMeta: TaskFieldMeta[]
} | null {
  const formMatch = html.match(
    /<form[^>]*action="[^"]*updateTask\.action[^"]*"[^>]*>([\s\S]*?)<\/form>/i,
  ) || html.match(
    /<form[^>]*name="updateTask"[^>]*>([\s\S]*?)<\/form>/i,
  ) || html.match(
    /<form[^>]*id="[^"]*task[^"]*"[^>]*>([\s\S]*?)<\/form>/i,
  )
  const formHtml = formMatch?.[1] ?? html
  const form: Record<string, string> = {}
  const checkboxes: Record<string, boolean> = {}
  const fieldMetaMap = new Map<string, TaskFieldMeta>()

  const inputRe = /<input\b([^>]*)>/gi
  let inputMatch: RegExpExecArray | null
  while ((inputMatch = inputRe.exec(formHtml)) !== null) {
    const attrs = inputMatch[1]
    const name = attrs.match(/\bname=["']([^"']+)["']/i)?.[1]
    if (!name) continue
    const type = (attrs.match(/\btype=["']([^"']+)["']/i)?.[1] || 'text').toLowerCase()
    if (type === 'submit' || type === 'button' || type === 'image' || type === 'hidden') {
      if (type === 'hidden') {
        const value = attrs.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? ''
        form[name] = decodeHtmlEntities(value)
      }
      continue
    }
    if (type === 'checkbox' || type === 'radio') {
      const checked = /\bchecked\b/i.test(attrs)
      const value = attrs.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? 'true'
      checkboxes[name] = checked
      if (checked) form[name] = decodeHtmlEntities(value)
      if (type === 'checkbox' && !TASK_FORM_SYSTEM_KEYS.has(name)) {
        fieldMetaMap.set(name, { key: name, type: 'checkbox' })
      }
      continue
    }
    const value = attrs.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? ''
    form[name] = decodeHtmlEntities(value)
    if (!TASK_FORM_SYSTEM_KEYS.has(name)) {
      fieldMetaMap.set(name, { key: name, type: 'text' })
    }
  }

  const textareaRe = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi
  let textareaMatch: RegExpExecArray | null
  while ((textareaMatch = textareaRe.exec(formHtml)) !== null) {
    const name = textareaMatch[1].match(/\bname=["']([^"']+)["']/i)?.[1]
    if (!name) continue
    form[name] = decodeHtmlEntities(textareaMatch[2])
    if (!TASK_FORM_SYSTEM_KEYS.has(name)) {
      fieldMetaMap.set(name, { key: name, type: 'textarea' })
    }
  }

  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi
  let selectMatch: RegExpExecArray | null
  while ((selectMatch = selectRe.exec(formHtml)) !== null) {
    const name = selectMatch[1].match(/\bname=["']([^"']+)["']/i)?.[1]
    if (!name) continue
    const options: { value: string; label: string }[] = []
    const optionRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi
    let optionMatch: RegExpExecArray | null
    let selectedValue = ''
    while ((optionMatch = optionRe.exec(selectMatch[2])) !== null) {
      const optionAttrs = optionMatch[1]
      const value = optionAttrs.match(/\bvalue=["']([^"']*)["']/i)?.[1]
        ?? stripHtmlText(optionMatch[2])
      const label = stripHtmlText(optionMatch[2]) || value
      options.push({ value: decodeHtmlEntities(value), label })
      if (/\bselected\b/i.test(optionAttrs)) selectedValue = decodeHtmlEntities(value)
    }
    if (!selectedValue && options.length > 0) selectedValue = options[0].value
    form[name] = selectedValue
    if (!TASK_FORM_SYSTEM_KEYS.has(name)) {
      fieldMetaMap.set(name, { key: name, type: 'select', options })
    }
  }

  if (!form.atl_token) {
    const tokenMatch = html.match(/name=["']atl_token["'][^>]*value=["']([^"']+)["']/i)
      || html.match(/value=["']([^"']+)["'][^>]*name=["']atl_token["']/i)
      || html.match(/atl_token["']\s*value=["']([^"']+)["']/i)
    if (tokenMatch) form.atl_token = tokenMatch[1]
  }

  if (!form.atl_token && !form.taskId && !form.buildKey && !form.planKey) return null

  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(form)) {
    if (TASK_FORM_SYSTEM_KEYS.has(key)) continue
    fields[key] = value
    if (!fieldMetaMap.has(key)) {
      fieldMetaMap.set(key, {
        key,
        type: MULTILINE_TASK_FIELDS.has(key) || value.includes('\n') ? 'textarea' : 'text',
      })
    }
  }
  if ('taskDisabled' in checkboxes) {
    fields.taskDisabled = checkboxes.taskDisabled ? 'true' : 'false'
    fieldMetaMap.set('taskDisabled', { key: 'taskDisabled', type: 'checkbox' })
  }

  const preferredOrder = [
    'userDescription', 'selectedRepository', 'repositoryKey', 'checkoutDir',
    'checkoutDirectory', 'cleanCheckout', 'scriptLocation', 'interpreter',
    'scriptBody', 'script', 'command', 'commandLine', 'executable', 'argument',
    'environmentVariables', 'workingSubDirectory', 'taskDisabled',
  ]
  const fieldMeta = [
    ...preferredOrder.filter((key) => fieldMetaMap.has(key)).map((key) => fieldMetaMap.get(key)!),
    ...[...fieldMetaMap.values()].filter((meta) => !preferredOrder.includes(meta.key)),
  ]

  return { fields, checkboxes, form, fieldMeta }
}

export class BambooClient {
  private baseUrl: string
  private username: string
  private password: string
  private auth: string
  private cookies: Record<string, string> = {}
  private authMethod: 'basic' | 'session' | null = null
  private allowInsecureHttp: boolean

  constructor(server: string, username: string, password: string, options?: { allowInsecureHttp?: boolean }) {
    const normalized = validateServerUrl(server, options?.allowInsecureHttp ?? false)
    if (!normalized) {
      throw new Error('Invalid Bamboo server URL')
    }
    this.baseUrl = normalized
    this.username = username
    this.password = password
    this.allowInsecureHttp = options?.allowInsecureHttp ?? false
    this.auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
    logger.info('AUTH', `Client created for ${this.baseUrl}`, { username })
  }

  private parseCookies(setCookieHeaders: string[] | null): void {
    if (!setCookieHeaders) return
    for (const header of setCookieHeaders) {
      const [pair] = header.split(';')
      const [name, ...rest] = pair.split('=')
      if (name) {
        this.cookies[name.trim()] = rest.join('=').trim()
      }
    }
  }

  private getCookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  private async request<T>(path: string, options?: { method?: string }): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const method = options?.method ?? 'GET'
    const start = performance.now()

    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    if (this.authMethod === 'session') {
      const cookieHeader = this.getCookieHeader()
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader
      }
    } else {
      headers['Authorization'] = this.auth
    }

    logger.apiRequest(method, url, { authMethod: this.authMethod ?? 'unknown' })

    let res: Response
    try {
      res = await fetch(url, { method, headers })
    } catch (err: any) {
      const duration = Math.round(performance.now() - start)
      logger.apiError(method, url, err, duration)
      throw err
    }

    const duration = Math.round(performance.now() - start)

    const setCookie = res.headers.getSetCookie?.() ?? []
    this.parseCookies(setCookie)

    if (!res.ok) {
      let body = ''
      try { body = await res.text() } catch { /* ignore */ }
      logger.apiResponse(method, url, res.status, duration, {
        statusText: res.statusText,
        body: body.slice(0, 300),
      })
      throw new Error(`Bamboo API error: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    logger.apiResponse(method, url, res.status, duration, {
      keys: Object.keys(data),
    })

    return data as T
  }

  // --- Form-based session login (Bamboo 6.x Struts) ---

  async sessionLogin(): Promise<boolean> {
    logger.info('AUTH', 'Attempting form-based session login (Bamboo 6.x)')

    try {
      // Step 1: GET login page to extract CSRF token + session cookies
      const loginPageRes = await fetch(`${this.baseUrl}/userlogin!doDefault.action`, {
        redirect: 'manual',
      })

      const step1Cookies = loginPageRes.headers.getSetCookie?.() ?? []
      this.parseCookies(step1Cookies)

      const loginHtml = await loginPageRes.text()

      const tokenMatch = loginHtml.match(/atl_token"\s*value="([^"]+)"/)
      if (!tokenMatch) {
        logger.error('AUTH', 'Could not extract atl_token from login page')
        return false
      }
      const atlToken = tokenMatch[1]
      logger.info('AUTH', 'Extracted CSRF token', { atlToken: atlToken.slice(0, 8) + '...' })

      // Step 2: POST login form
      const formData = new URLSearchParams({
        os_destination: '/start.action',
        os_username: this.username,
        os_password: this.password,
        checkBoxFields: 'os_cookie',
        os_cookie: 'true',
        atl_token: atlToken,
        save: 'Log in',
      })

      const cookieHeader = this.getCookieHeader()
      const loginRes = await fetch(`${this.baseUrl}/userlogin.action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookieHeader,
        },
        body: formData.toString(),
        redirect: 'manual',
      })

      const step2Cookies = loginRes.headers.getSetCookie?.() ?? []
      this.parseCookies(step2Cookies)

      const loginReason = loginRes.headers.get('X-Seraph-LoginReason')
      logger.info('AUTH', `Login POST: ${loginRes.status}`, { loginReason })

      if (loginReason === 'AUTHENTICATED_FAILED') {
        logger.warn('AUTH', 'Credentials rejected')
        return false
      }

      // Follow redirect
      if (loginRes.status >= 300 && loginRes.status < 400) {
        const location = loginRes.headers.get('location')
        if (location) {
          const finalUrl = location.startsWith('http')
            ? location
            : `${this.baseUrl}${location.startsWith('/') ? location : `/${location}`}`
          if (!isSameOriginUrl(finalUrl, this.baseUrl)) {
            logger.warn('AUTH', 'Login redirect blocked: cross-origin', { location })
            return false
          }
          const followRes = await fetch(finalUrl, {
            headers: { Cookie: this.getCookieHeader() },
            redirect: 'manual',
          })
          const followCookies = followRes.headers.getSetCookie?.() ?? []
          this.parseCookies(followCookies)
        }
      }

      // Step 3: Verify session
      const verified = await this.verifySession()
      logger.info('AUTH', `Session verification: ${verified ? 'OK' : 'FAILED'}`)
      return verified
    } catch (err: any) {
      logger.error('AUTH', `Session login error: ${err.message}`)
      return false
    }
  }

  private async verifySession(): Promise<boolean> {
    const cookieHeader = this.getCookieHeader()
    if (!cookieHeader) return false

    try {
      const res = await fetch(`${this.baseUrl}/rest/api/latest/project`, {
        headers: {
          Cookie: cookieHeader,
          Accept: 'application/json',
        },
      })
      return res.ok
    } catch {
      return false
    }
  }

  async validateAuth(): Promise<boolean> {
    logger.info('AUTH', 'Validating credentials', { server: this.baseUrl })

    // Try Basic Auth first
    try {
      const res = await fetch(`${this.baseUrl}/rest/api/latest/project`, {
        headers: {
          Authorization: this.auth,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        this.authMethod = 'basic'
        logger.info('AUTH', 'Basic auth succeeded')
        return true
      }
    } catch (err: any) {
      logger.apiError('GET', `${this.baseUrl}/rest/api/latest/project`, err)
    }

    // Fall back to session login
    logger.info('AUTH', 'Basic auth failed, trying form-based session login')
    const sessionOk = await this.sessionLogin()
    if (sessionOk) {
      this.authMethod = 'session'
      return true
    }

    logger.error('AUTH', 'All auth methods failed')
    return false
  }

  // --- API Methods ---

  async getProjects(): Promise<BambooProject[]> {
    const data = await this.request<{ projects: { project: BambooProject[] } }>(
      '/rest/api/latest/project'
    )
    const projects = data.projects?.project ?? []
    logger.info('API', `Fetched ${projects.length} projects`)
    return projects
  }

  async getProjectDetail(key: string): Promise<any> {
    return this.request(`/rest/api/latest/project/${key}`)
  }

  async getProjectPlans(projectKey: string): Promise<BambooPlan[]> {
    const data = await this.request<{ plans: { plan: BambooPlan[]; size: number } }>(
      `/rest/api/latest/project/${projectKey}?expand=plans`
    )
    const plans = data.plans?.plan ?? []
    logger.info('API', `Fetched ${plans.length} plans for ${projectKey}`)
    return plans
  }

  async getBuildResults(projectKey: string): Promise<BambooBuildResult[]> {
    const allResults: BambooBuildResult[] = []
    let start = 0
    const pageSize = 50

    while (true) {
      const data = await this.request<BambooBuildResults>(
        `/rest/api/latest/result/${projectKey}?max-results=${pageSize}&start-index=${start}`
      )
      const results = coerceBuildResults(data.results?.result).map(normalizeBambooBuildResult)
      allResults.push(...results)

      if (results.length < pageSize) break
      start += pageSize
    }

    logger.info('API', `Fetched ${allResults.length} build results for ${projectKey}`)
    return allResults
  }

  async getQueuedBuildsForPlan(planKey: string): Promise<BambooBuildResult[]> {
    try {
      const data = await this.request<BambooQueueResponse>(
        '/rest/api/latest/queue?expand=queuedBuilds'
      )
      return coerceQueuedBuilds(data.queuedBuilds?.queuedBuild)
        .filter((q) => q.planKey === planKey)
        .map((q) => ({
          buildResultKey: q.buildResultKey,
          buildNumber: q.buildNumber,
          buildState: 'Unknown',
          lifeCycleState: 'Queued',
          plan: {
            key: q.planKey,
            name: q.planKey,
            shortName: q.planKey,
            shortKey: q.planKey,
            type: 'chain',
            enabled: true,
          },
        }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('API', `getQueuedBuildsForPlan(${planKey}): ${msg}`)
      return []
    }
  }

  async getPlanBuildResults(
    planKey: string,
    maxResults = 25,
    includeAllStates = false,
    startIndex = 0
  ): Promise<BambooBuildResult[]> {
    let path = `/rest/api/latest/result/${planKey}?max-results=${maxResults}&start-index=${startIndex}`
    if (includeAllStates) path += '&includeAllStates=true'
    const data = await this.request<BambooBuildResults>(path)
    return coerceBuildResults(data.results?.result).map(normalizeBambooBuildResult)
  }

  async getBuildResultsPage(
    projectKey: string,
    startIndex: number,
    pageSize: number
  ): Promise<{ results: BambooBuildResult[]; hasMore: boolean }> {
    const data = await this.request<BambooBuildResults>(
      `/rest/api/latest/result/${projectKey}?max-results=${pageSize + 1}&start-index=${startIndex}`
    )
    const batch = coerceBuildResults(data.results?.result).map(normalizeBambooBuildResult)
    const hasMore = batch.length > pageSize
    return { results: batch.slice(0, pageSize), hasMore }
  }

  async getDeployResultsPage(
    projectKey: string,
    startIndex: number,
    pageSize: number
  ): Promise<{ deploys: BambooDeployResult[]; hasMore: boolean }> {
    const { results, hasMore } = await this.getBuildResultsPage(projectKey, startIndex, pageSize)
    const deploys = dedupeBuildResultsByPlan(results).map((b) => buildResultToDeploy(b, projectKey))
    return { deploys, hasMore }
  }

  async enrichDeployResults(
    projectKey: string,
    buildResultKeys: string[]
  ): Promise<BambooDeployResult[]> {
    const unique = [...new Set(buildResultKeys.filter(Boolean))]
    if (unique.length === 0) return []
    return mapInBatches(unique, 4, async (key) => {
      const enriched = await this.enrichBuildResultForDeploy({ buildResultKey: key } as BambooBuildResult)
      return buildResultToDeploy(enriched, projectKey)
    })
  }

  async getPlanResultsHistoryPage(
    planKey: string,
    startIndex: number,
    pageSize: number
  ): Promise<{ rows: PlanHistoryRow[]; hasMore: boolean }> {
    const queued = startIndex === 0 ? await this.getQueuedBuildsForPlan(planKey) : []
    const fetchSize = pageSize + 1
    const batch = await this.getPlanBuildResults(planKey, fetchSize, true, startIndex)
    const hasMore = batch.length > pageSize
    const page = batch.slice(0, pageSize)
    const merged = mergeBuildResultsByKey(queued, page)
    const enriched = await mapInBatches(merged, 4, (b) => this.enrichBuildResultForDeploy(b))
    return { rows: enriched.map(buildResultToPlanHistoryRow), hasMore }
  }

  async getBuildDetail(buildResultKey: string): Promise<any> {
    return this.request(
      `/rest/api/latest/result/${buildResultKey}?expand=vcsRevisions,plan.stages,plan,changes.change,stages.stage.results,stages.stage.jobs.job.tasks,artifacts,variables,labels,jiraIssues`
    )
  }

  async getPlanDetail(planKey: string): Promise<any> {
    // Bamboo 6.x chain plans expose jobs under stages.stage.plans.plan (not jobs.job)
    const data = await this.request<any>(
      `/rest/api/latest/plan/${planKey}?expand=stages.stage.plans.plan,branches`
    )
    const stageArr = data?.stages?.stage
    const stages = Array.isArray(stageArr) ? stageArr : stageArr ? [stageArr] : []
    for (const stage of stages) {
      const plansRaw = stage?.plans?.plan
      const plans = Array.isArray(plansRaw) ? plansRaw : plansRaw ? [plansRaw] : []
      if (plans.length > 0 && !stage.jobs?.job) {
        stage.jobs = {
          size: plans.length,
          'start-index': 0,
          'max-result': plans.length,
          job: plans,
        }
      }
      const jobsRaw = stage?.jobs?.job
      const jobs = Array.isArray(jobsRaw) ? jobsRaw : jobsRaw ? [jobsRaw] : []
      await mapInBatches(jobs, 3, async (job: any) => {
        const jobKey = job?.key || job?.planKey?.key
        if (!jobKey || !isValidPlanKey(jobKey)) return job
        if (job.tasks?.task) return job
        try {
          const jobDetail = await this.request<any>(
            `/rest/api/latest/plan/${encodeURIComponent(jobKey)}?expand=stages.stage.plans.plan,stages.stage.jobs.job.tasks`
          )
          let tasksFromJob = extractTasksFromPlanDetail(jobDetail)
          if (tasksFromJob.length === 0) {
            tasksFromJob = await this.listJobTasksFromStruts(jobKey)
          }
          if (tasksFromJob.length > 0) {
            job.tasks = { size: tasksFromJob.length, task: tasksFromJob }
          }
        } catch (err: any) {
          logger.warn('API', `getPlanDetail: failed to load tasks for job ${jobKey}: ${err.message}`)
          try {
            const tasksFromStruts = await this.listJobTasksFromStruts(jobKey)
            if (tasksFromStruts.length > 0) {
              job.tasks = { size: tasksFromStruts.length, task: tasksFromStruts }
            }
          } catch (strutsErr: any) {
            logger.warn('API', `listJobTasksFromStruts failed for ${jobKey}: ${strutsErr.message}`)
          }
        }
        return job
      })
    }
    return data
  }

  async getPlanResults(planKey: string): Promise<BambooBuildResult[]> {
    const [queued, results] = await Promise.all([
      this.getQueuedBuildsForPlan(planKey),
      this.getPlanBuildResults(planKey, 25, true),
    ])
    return mergeBuildResultsByKey(queued, results)
  }

  async getPlanResultsEnriched(planKey: string): Promise<PlanHistoryRow[]> {
    const results = await this.getPlanResults(planKey)
    const enriched = await mapInBatches(results, 6, (b) => this.enrichBuildResultForDeploy(b))
    return enriched.map(buildResultToPlanHistoryRow)
  }

  async getBuildLog(buildResultKey: string): Promise<string> {
    const full = await this.getFullBuildLog(buildResultKey)
    return full ? full.slice(-2000) : ''
  }

  private logAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      ...(extra ?? {}),
      ...(this.authMethod === 'session'
        ? { Cookie: this.getCookieHeader() }
        : { Authorization: this.auth }),
    }
  }

  private async fetchResultLogText(resultKey: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/rest/api/latest/result/${resultKey}/log`, {
      headers: this.logAuthHeaders({ Accept: 'text/plain' }),
    })
    return res.ok ? await res.text() : ''
  }

  private async fetchDownloadBuildLog(jobResultKey: string): Promise<string> {
    const jobPlanKey = jobResultKey.replace(/-\d+$/, '')
    const res = await fetch(`${this.baseUrl}/download/${jobPlanKey}/build_logs/${jobResultKey}.log`, {
      headers: this.logAuthHeaders({ Accept: 'text/plain,*/*' }),
    })
    if (!res.ok) return ''
    const body = await res.text().catch(() => '')
    return body.trim() ? body : ''
  }

  private formatLogEntries(data: Record<string, unknown> | null | undefined): string {
    if (!data) return ''
    const raw = (data.logEntries as { logEntry?: unknown } | undefined)?.logEntry
    const entries = raw == null ? [] : Array.isArray(raw) ? raw : [raw]
    return entries
      .map((entry) => {
        const row = entry as { unstyledLog?: string; log?: string }
        return (row.unstyledLog ?? row.log ?? '').trimEnd()
      })
      .filter((line) => line.length > 0)
      .join('\n')
  }

  private async fetchLogEntriesText(jobResultKey: string): Promise<string> {
    try {
      const data = await this.request<Record<string, unknown>>(
        `/rest/api/latest/result/${jobResultKey}?expand=logEntries&max-results=2000`
      )
      return this.formatLogEntries(data)
    } catch {
      return ''
    }
  }

  private extractJobResultKeys(detail: Record<string, unknown> | null | undefined): string[] {
    if (!detail) return []
    const stagesRaw = (detail.stages as { stage?: unknown } | undefined)?.stage
    const stages = stagesRaw == null ? [] : Array.isArray(stagesRaw) ? stagesRaw : [stagesRaw]
    const keys: string[] = []
    for (const stage of stages) {
      const resultsRaw = (stage as { results?: { result?: unknown } })?.results?.result
      const results = resultsRaw == null ? [] : Array.isArray(resultsRaw) ? resultsRaw : [resultsRaw]
      for (const result of results) {
        const key = (result as { key?: string })?.key
        if (typeof key === 'string' && key.trim()) keys.push(key.trim())
      }
    }
    return [...new Set(keys)]
  }

  private async fetchJobLogText(jobKey: string): Promise<string> {
    const download = await this.fetchDownloadBuildLog(jobKey)
    if (download) return download
    const entries = await this.fetchLogEntriesText(jobKey)
    if (entries) return entries
    return this.fetchResultLogText(jobKey)
  }

  async getFullBuildLog(buildResultKey: string): Promise<string> {
    try {
      const direct = await this.fetchResultLogText(buildResultKey)
      if (direct) return direct

      const detail = await this.request<Record<string, unknown>>(
        `/rest/api/latest/result/${buildResultKey}?expand=stages.stage.results`
      )
      const jobKeys = this.extractJobResultKeys(detail)
      if (jobKeys.length === 0) return ''

      const parts: string[] = []
      for (const jobKey of jobKeys) {
        const text = await this.fetchJobLogText(jobKey)
        if (text) parts.push(`===== ${jobKey} =====\n${text}`)
      }
      return parts.join('\n\n')
    } catch {
      return ''
    }
  }

  extractErrorFromLog(log: string): string | null {
    const errorPatterns = [
      /ERROR[:\s]+(.+)/i,
      /FAILURE[:\s]+(.+)/i,
      /FAILED[:\s]+(.+)/i,
      /Exception[:\s]+(.+)/i,
      /BUILD FAILURE/,
      /Build failed/i,
      /exit code [1-9]/i,
    ]
    for (const pattern of errorPatterns) {
      const match = log.match(pattern)
      if (match) {
        const msg = match[0].trim()
        return msg.length > 200 ? msg.slice(0, 200) + '...' : msg
      }
    }
    // Return last non-empty line as fallback
    const lines = log.split('\n').filter((l) => l.trim())
    if (lines.length > 0) {
      const last = lines[lines.length - 1].trim()
      return last.length > 200 ? last.slice(0, 200) + '...' : last
    }
    return null
  }

  async getAllBuildResults(): Promise<BambooBuildResult[]> {
    const data = await this.request<BambooBuildResults>(
      '/rest/api/latest/result?max-results=50'
    )
    return coerceBuildResults(data.results?.result)
  }

  async getBuildVcsRevision(buildResultKey: string): Promise<string | null> {
    try {
      const data = await this.request<Record<string, unknown>>(
        `/rest/api/latest/result/${buildResultKey}?expand=vcsRevisions`
      )
      const direct = data.vcsRevisionKey
      if (typeof direct === 'string' && direct.trim()) return direct.trim()

      const vrs = data.vcsRevisions as { vcsRevision?: unknown } | undefined
      const list = vrs?.vcsRevision
      const revisions = list == null ? [] : Array.isArray(list) ? list : [list]
      for (const v of revisions) {
        const key = (v as Record<string, unknown>)?.vcsRevisionKey
        if (typeof key === 'string' && key.trim()) return key.trim()
      }
      return null
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('API', `getBuildVcsRevision(${buildResultKey}): ${msg}`)
      return null
    }
  }

  async getRepositoryFromBuild(
    buildResultKey: string
  ): Promise<{ url: string; branch: string } | null> {
    try {
      const data = await this.request<Record<string, unknown>>(
        `/rest/api/latest/result/${buildResultKey}?expand=vcsRevisions`
      )
      const vrs = data.vcsRevisions as { vcsRevision?: unknown } | undefined
      const list = vrs?.vcsRevision
      const revisions = list == null ? [] : Array.isArray(list) ? list : [list]
      for (const v of revisions) {
        const rec = v as Record<string, unknown>
        const url = findGitUrlInValue(rec)
        if (!url) continue
        const branch = pickGitBranch(
          rec.branch as string,
          rec.vcsBranch as string,
          (rec.repository as Record<string, unknown>)?.branch as string
        )
        return { url, branch }
      }
      const topUrl = findGitUrlInValue(data)
      if (topUrl) return { url: topUrl, branch: 'main' }
      return null
    } catch {
      return null
    }
  }

  async getPlanVcsBranches(planKey: string): Promise<string[]> {
    try {
      const data = await this.request<Record<string, unknown>>(
        `/rest/api/latest/plan/${planKey}/vcsBranches`
      )
      const container = data.branches as { branch?: unknown } | undefined
      const raw = container?.branch ?? data.vcsBranch ?? data.branch
      if (Array.isArray(raw)) {
        return raw
          .map((b) => (typeof b === 'string' ? b : (b as { name?: string })?.name))
          .filter((n): n is string => !!n && typeof n === 'string')
      }
      if (raw && typeof raw === 'object' && 'name' in (raw as object)) {
        const name = (raw as { name?: string }).name
        if (name) return [name]
      }
      const single = data.branch ?? data.name
      if (typeof single === 'string' && single) return [single]
      return []
    } catch {
      return []
    }
  }

  private cachePlanRepo(planKey: string, repo: { url: string; branch: string }): { url: string; branch: string } {
    planRepoCache.set('planGitRepos', {
      ...planRepoCache.get('planGitRepos', {}),
      [planKey]: repo,
    })
    return repo
  }

  async getVcsMetaFromLatestBuild(
    planKey: string
  ): Promise<{ repositoryName?: string; repositoryId?: number; branch?: string; revision?: string } | null> {
    try {
      const results = await this.getPlanBuildResults(planKey, 15, true)
      const sorted = [...results].sort((a, b) => (b.buildNumber ?? 0) - (a.buildNumber ?? 0))
      for (const r of sorted) {
        if (!r.buildResultKey) continue
        const data = await this.request<Record<string, unknown>>(
          `/rest/api/latest/result/${r.buildResultKey}?expand=vcsRevisions`
        )
        const vrs = data.vcsRevisions as { vcsRevision?: unknown } | undefined
        const list = vrs?.vcsRevision
        const revisions = list == null ? [] : Array.isArray(list) ? list : [list]
        const first = revisions[0] as Record<string, unknown> | undefined
        const revision = await this.getBuildVcsRevision(r.buildResultKey)
        if (first || revision) {
          return {
            repositoryName: first?.repositoryName as string | undefined,
            repositoryId: typeof first?.repositoryId === 'number' ? first.repositoryId : undefined,
            branch: pickGitBranch(
              first?.branch as string,
              first?.vcsBranch as string,
              ...(await this.getPlanVcsBranches(planKey))
            ),
            revision: revision ?? undefined,
          }
        }
      }
    } catch {
      /* ignore */
    }
    return null
  }

  async getPlanDetectedVcsRevision(planKey: string): Promise<string | null> {
    try {
      const results = await this.getPlanBuildResults(planKey, 30, true)
      const sorted = [...results].sort((a, b) => (b.buildNumber ?? 0) - (a.buildNumber ?? 0))
      const latestFinished = sorted.find((r) => {
        const life = (r.lifeCycleState ?? '').toUpperCase()
        return life === 'FINISHED'
      })
      const finishedBn = latestFinished?.buildNumber ?? 0

      for (const r of sorted) {
        const bn = r.buildNumber ?? 0
        if (bn <= finishedBn || !r.buildResultKey) continue
        const life = (r.lifeCycleState ?? '').toUpperCase()
        if (life === 'NOTBUILT') continue
        const rev = await this.getBuildVcsRevision(r.buildResultKey)
        if (rev) return rev
      }
    } catch {
      /* ignore */
    }

    const paths = [
      `/rest/api/latest/plan/${planKey}?expand=branches,planVcsBranches,vcsRevisions,repository`,
      `/rest/api/latest/plan/${planKey}`,
    ]
    for (const path of paths) {
      try {
        const data = await this.request<Record<string, unknown>>(path)
        const rev = findRevisionHashInJson(data)
        if (rev) return rev
      } catch {
        /* try next */
      }
    }
    return null
  }

  async listLinkedRepositoryDetails(): Promise<Array<{ id: string; name: string; detail: Record<string, unknown> | null }>> {
    try {
      const data = await this.request<Record<string, unknown>>('/rest/api/latest/repository?max-result=50')
      const raw = data.searchResults ?? data.repositories ?? data.repository
      const items = raw == null ? [] : Array.isArray(raw) ? raw : [raw]
      const out: Array<{ id: string; name: string; detail: Record<string, unknown> | null }> = []
      for (const item of items) {
        const rec = item as Record<string, unknown>
        const id = rec.id != null ? String(rec.id) : ''
        if (!id) continue
        const name = String(rec.name ?? '')
        const detail = await this.request<Record<string, unknown>>(
          `/rest/api/latest/repository/${id}`
        ).catch(() => null)
        out.push({ id, name, detail })
      }
      return out
    } catch {
      return []
    }
  }

  async resolvePlanRepository(
    fav: FavoritePlan,
    _auth: { username: string; password: string }
  ): Promise<{ url: string; branch: string } | null> {
    const vcsBranchList = await this.getPlanVcsBranches(fav.planKey)
    const vcsBranches = [
      pickPreferredVcsBranch(vcsBranchList) ?? '',
      ...vcsBranchList,
    ].filter(Boolean)
    const cached = planRepoCache.get('planGitRepos', {})[fav.planKey]
    if (cached?.url) {
      return {
        url: cached.url,
        branch: pickGitBranch(fav.repositoryBranch, cached.branch, ...vcsBranches),
      }
    }

    if (fav.repositoryUrl?.trim()) {
      return this.cachePlanRepo(fav.planKey, {
        url: fav.repositoryUrl.trim(),
        branch: pickGitBranch(fav.repositoryBranch, ...vcsBranches),
      })
    }

    const vcsMeta = await this.getVcsMetaFromLatestBuild(fav.planKey)
    const mappedUrl =
      (vcsMeta?.repositoryName ? getGitRepositoryUrlMapping(vcsMeta.repositoryName) : undefined)
      ?? getGitRepositoryUrlMapping(fav.planKey)
    if (mappedUrl?.trim()) {
      return this.cachePlanRepo(fav.planKey, {
        url: mappedUrl.trim(),
        branch: pickGitBranch(fav.repositoryBranch, vcsMeta?.branch, ...vcsBranches),
      })
    }

    const tryUrl = (url: string, branchHint?: string) => {
      if (!url) return null
      return this.cachePlanRepo(fav.planKey, {
        url,
        branch: pickGitBranch(fav.repositoryBranch, branchHint, ...vcsBranches),
      })
    }

    try {
      const results = await this.getPlanResults(fav.planKey)
      const sorted = [...results].sort((a, b) => (b.buildNumber ?? 0) - (a.buildNumber ?? 0))
      for (const r of sorted) {
        if (!r.buildResultKey) continue
        const fromBuild = await this.getRepositoryFromBuild(r.buildResultKey)
        if (fromBuild) return tryUrl(fromBuild.url, fromBuild.branch)
        const detail = await this.request<Record<string, unknown>>(
          `/rest/api/latest/result/${r.buildResultKey}?expand=vcsRevisions,plan,changes`
        ).catch(() => null)
        const urls = detail ? extractGitUrlsFromJson(detail) : []
        if (urls[0]) return tryUrl(urls[0])
      }
    } catch {
      /* ignore */
    }

    try {
      const plan = await this.getPlanDetail(fav.planKey)
      for (const url of extractGitUrlsFromJson(plan)) return tryUrl(url)
      const url = findGitUrlInValue(plan)
      if (url) return tryUrl(url)
    } catch {
      /* ignore */
    }

    const projectKey = fav.projectKey || projectKeyFromPlanKey(fav.planKey)
    try {
      const data = await this.request<Record<string, unknown>>(
        `/rest/api/latest/project/${projectKey}/repository/search?searchTerm=${encodeURIComponent(fav.planName)}`
      )
      for (const url of extractGitUrlsFromJson(data)) return tryUrl(url)
    } catch {
      /* ignore */
    }

    const repos = await this.listLinkedRepositoryDetails()
    const planLower = fav.planKey.toLowerCase()
    for (const { name, detail } of repos) {
      if (!detail) continue
      const nameLower = name.toLowerCase()
      const nameMatch = nameLower && (planLower.includes(nameLower) || nameLower.includes(planLower.split('-').pop() ?? ''))
      for (const url of extractGitUrlsFromJson(detail)) {
        if (nameMatch || repos.length === 1) return tryUrl(url)
      }
    }
    if (repos.length === 1 && repos[0].detail) {
      const urls = extractGitUrlsFromJson(repos[0].detail)
      if (urls[0]) return tryUrl(urls[0])
    }

    try {
      const data = await this.request<Record<string, unknown>>(
        `/rest/api/latest/repository?searchTerm=${encodeURIComponent(fav.planName)}`
      )
      for (const url of extractGitUrlsFromJson(data)) return tryUrl(url)
    } catch {
      /* ignore */
    }

    return null
  }

  // --- Build Action Methods ---

  async queueBuild(planKey: string, variables?: Record<string, string>): Promise<QueueBuildResult> {
    if (!isValidPlanKey(planKey)) {
      return { success: false, errorMessage: `Invalid plan key: ${planKey}` }
    }
    const safeVariables = sanitizeBuildVariables(variables)
    try {
      let url = `${this.baseUrl}/rest/api/latest/queue/${encodeURIComponent(planKey)}`
      const params = new URLSearchParams()
      if (safeVariables) {
        for (const [key, value] of Object.entries(safeVariables)) {
          params.append(`bamboo.variable.${key}`, value)
        }
      }
      const queryString = params.toString()
      if (queryString) url += `?${queryString}`

      const cookieHeader = this.getCookieHeader()
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...(this.authMethod === 'session' ? { Cookie: cookieHeader } : { Authorization: this.auth }),
          Accept: 'application/json',
        },
      })

      const rawBody = await res.text()
      let body: { buildResultKey?: string; key?: string; message?: string } | null = null
      try {
        body = rawBody ? JSON.parse(rawBody) as typeof body : null
      } catch {
        /* non-json */
      }

      let buildResultKey: string | undefined
      const location = res.headers.get('Location') ?? res.headers.get('location')
      if (location) {
        const m = location.match(/\/result\/([^/?#]+)/i)
        if (m?.[1]) buildResultKey = decodeURIComponent(m[1])
      }
      if (!buildResultKey && body) {
        buildResultKey = body.buildResultKey ?? body.key
      }

      const errorMessage = body?.message ?? (rawBody.trim() || undefined)
      const benignSkip = !res.ok && !!errorMessage && (
        /concurrent builds|maximum number of concurrent|already building|build is already|queue.*full/i.test(errorMessage)
      )

      logger.info('API', `queueBuild(${planKey}): ${res.status}`, { buildResultKey, benignSkip })
      return {
        success: res.ok,
        buildResultKey,
        statusCode: res.status,
        errorMessage,
        benignSkip,
      }
    } catch (err: any) {
      logger.error('API', `queueBuild failed: ${err.message}`)
      return { success: false, errorMessage: err.message }
    }
  }

  private parseBuildResultKeyForDelete(
    buildResultKey: string
  ): { planKey: string; buildNumber: number } | null {
    const idx = buildResultKey.lastIndexOf('-')
    if (idx <= 0) return null
    const suffix = buildResultKey.slice(idx + 1)
    if (!/^\d+$/.test(suffix)) return null
    const planKey = buildResultKey.slice(0, idx)
    const buildNumber = Number(suffix)
    if (!planKey || !Number.isFinite(buildNumber) || buildNumber <= 0) return null
    return { planKey, buildNumber }
  }

  async deleteBuildResult(buildResultKey: string): Promise<boolean> {
    if (!isValidBuildResultKey(buildResultKey)) {
      logger.error('API', `deleteBuildResult: invalid key ${buildResultKey}`)
      return false
    }
    const parsed = this.parseBuildResultKeyForDelete(buildResultKey)
    if (!parsed) {
      logger.error('API', `deleteBuildResult: invalid key ${buildResultKey}`)
      return false
    }

    try {
      const cookieHeader = this.getCookieHeader()
      const body = new URLSearchParams({
        buildKey: parsed.planKey,
        buildNumber: String(parsed.buildNumber),
      })
      const res = await fetch(`${this.baseUrl}/build/admin/deletePlanResults.action`, {
        method: 'POST',
        headers: {
          ...(this.authMethod === 'session' ? { Cookie: cookieHeader } : { Authorization: this.auth }),
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Atlassian-Token': 'no-check',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
        redirect: 'manual',
      })
      const ok = isStrutsActionSuccess(
        res.status,
        res.headers.get('location'),
        this.baseUrl
      )
      logger.info('API', `deleteBuildResult(${buildResultKey}): ${res.status}`, {
        planKey: parsed.planKey,
        buildNumber: parsed.buildNumber,
        ok,
      })
      return ok
    } catch (err: any) {
      logger.error('API', `deleteBuildResult failed: ${err.message}`)
      return false
    }
  }

  /**
   * 停止/中断一个部署（构建）。
   *
   * Bamboo 原生支持两种中断场景：
   *  1. 正在运行（IN_PROGRESS）—— 通过 Struts action `stopPlan.action` 下发停止信号
   *  2. 排队中（QUEUED）—— 通过 REST API `DELETE /queue/{buildResultKey}` 从队列移除
   *
   * 本方法同时尝试两种途径，覆盖 Bamboo 原生部署中断的全部能力，前端无需判断当前状态。
   * 参考 deleteBuildResult 的实现模式（form post + X-Atlassian-Token: no-check）。
   */
  async stopBuild(buildResultKey: string): Promise<{ success: boolean; errorMessage?: string }> {
    if (!isValidBuildResultKey(buildResultKey)) {
      logger.error('API', `stopBuild: invalid key ${buildResultKey}`)
      return { success: false, errorMessage: `Invalid build result key: ${buildResultKey}` }
    }
    const parsed = this.parseBuildResultKeyForDelete(buildResultKey)
    if (!parsed) {
      logger.error('API', `stopBuild: invalid key ${buildResultKey}`)
      return { success: false, errorMessage: `Invalid build result key: ${buildResultKey}` }
    }

    const { planKey, buildNumber } = parsed
    const cookieHeader = this.getCookieHeader()
    const authHeaders = this.authMethod === 'session'
      ? { Cookie: cookieHeader }
      : { Authorization: this.auth }

    // 途径 1：停止正在运行的构建（Struts action，与 Bamboo 原生 UI「Stop build」一致）
    try {
      const body = new URLSearchParams({
        planKey,
        buildNumber: String(buildNumber),
      })
      const res = await fetch(`${this.baseUrl}/build/admin/stopPlan.action`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Atlassian-Token': 'no-check',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
        redirect: 'manual',
      })
      if (isStrutsActionSuccess(res.status, res.headers.get('location'), this.baseUrl)) {
        logger.info('API', `stopBuild(${buildResultKey}): success via stopPlan.action`, {
          planKey, buildNumber, status: res.status,
        })
        return { success: true }
      }
      logger.warn('API', `stopBuild stopPlan.action returned ${res.status}`, { planKey, buildNumber })
    } catch (err: any) {
      logger.warn('API', `stopBuild stopPlan.action failed: ${err.message}`)
    }

    // 途径 2：取消排队中的构建（REST API，与 Bamboo 原生 UI「Cancel queued build」一致）
    try {
      const res = await fetch(
        `${this.baseUrl}/rest/api/latest/queue/${encodeURIComponent(buildResultKey)}`,
        {
          method: 'DELETE',
          headers: { ...authHeaders, Accept: 'application/json' },
        }
      )
      if (res.ok) {
        logger.info('API', `stopBuild(${buildResultKey}): success via DELETE queue`, {
          planKey, buildNumber, status: res.status,
        })
        return { success: true }
      }
      const text = await res.text().catch(() => '')
      logger.warn('API', `stopBuild DELETE queue returned ${res.status}`, {
        body: text.slice(0, 200),
      })
    } catch (err: any) {
      logger.warn('API', `stopBuild DELETE queue failed: ${err.message}`)
    }

    return {
      success: false,
      errorMessage: 'Unable to stop build — it may have already finished or left the queue',
    }
  }

  private strutsAuthHeaders(): Record<string, string> {
    return this.authMethod === 'session'
      ? { Cookie: this.getCookieHeader() }
      : { Authorization: this.auth }
  }

  private async ensureSessionForStruts(): Promise<void> {
    if (this.authMethod === 'session') return
    const ok = await this.sessionLogin()
    if (ok) this.authMethod = 'session'
  }

  async listJobTasksFromStruts(jobKey: string): Promise<any[]> {
    if (!isValidPlanKey(jobKey)) return []
    await this.ensureSessionForStruts()
    const url = `${this.baseUrl}/build/admin/edit/editBuildTasks.action?buildKey=${encodeURIComponent(jobKey)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...this.strutsAuthHeaders(), Accept: 'text/html' },
      redirect: 'follow',
    })
    const setCookie = res.headers.getSetCookie?.() ?? []
    this.parseCookies(setCookie)
    if (!res.ok) return []
    const html = await res.text()
    return parseTasksFromEditBuildTasksHtml(html)
  }

  async getPlanTaskConfig(jobKey: string, taskId: string): Promise<{
    ok: boolean
    editable: boolean
    pluginKey?: string
    fields: Record<string, string>
    checkboxes: Record<string, boolean>
    form: Record<string, string>
    fieldMeta: TaskFieldMeta[]
    errorMessage?: string
  }> {
    if (!isValidPlanKey(jobKey) || !/^\d+$/.test(taskId)) {
      return { ok: false, editable: false, fields: {}, checkboxes: {}, form: {}, fieldMeta: [], errorMessage: 'Invalid jobKey or taskId' }
    }
    try {
      await this.ensureSessionForStruts()
      const url = `${this.baseUrl}/build/admin/edit/editTask.action?planKey=${encodeURIComponent(jobKey)}&taskId=${encodeURIComponent(taskId)}`
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.strutsAuthHeaders(),
          Accept: 'text/html',
        },
        redirect: 'follow',
      })
      const setCookie = res.headers.getSetCookie?.() ?? []
      this.parseCookies(setCookie)
      const html = await res.text()
      if (!res.ok) {
        return {
          ok: false, editable: false, fields: {}, checkboxes: {}, form: {}, fieldMeta: [],
          errorMessage: `Failed to load task editor (${res.status})`,
        }
      }
      const parsed = parseBambooTaskEditForm(html)
      if (!parsed) {
        return {
          ok: false, editable: false, fields: {}, checkboxes: {}, form: {}, fieldMeta: [],
          errorMessage: 'Could not parse task edit form',
        }
      }
      const pluginKey = parsed.form.createTaskKey || parsed.form.pluginKey || ''
      return {
        ok: true,
        editable: true,
        pluginKey: pluginKey || undefined,
        fields: parsed.fields,
        checkboxes: parsed.checkboxes,
        form: parsed.form,
        fieldMeta: parsed.fieldMeta,
      }
    } catch (err: any) {
      logger.error('API', `getPlanTaskConfig failed: ${err.message}`, { jobKey, taskId })
      return {
        ok: false, editable: false, fields: {}, checkboxes: {}, form: {}, fieldMeta: [],
        errorMessage: err.message || 'Failed to load task config',
      }
    }
  }

  async updatePlanTask(
    jobKey: string,
    taskId: string,
    updates: Record<string, string | boolean>,
  ): Promise<{ success: boolean; errorMessage?: string }> {
    if (!isValidPlanKey(jobKey) || !/^\d+$/.test(taskId)) {
      return { success: false, errorMessage: 'Invalid jobKey or taskId' }
    }
    try {
      const current = await this.getPlanTaskConfig(jobKey, taskId)
      if (!current.ok) {
        return { success: false, errorMessage: current.errorMessage || 'Failed to load task' }
      }
      const body = new URLSearchParams()
      const form = { ...current.form }
      form.buildKey = jobKey
      form.planKey = jobKey
      form.taskId = taskId
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'taskDisabled') continue
        if (typeof value === 'boolean') {
          if (value) form[key] = 'true'
          else delete form[key]
          continue
        }
        if (TASK_FORM_SYSTEM_KEYS.has(key)) continue
        form[key] = value
      }
      const checkBoxFields = new Set(
        (form.checkBoxFields || 'taskDisabled')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      checkBoxFields.add('taskDisabled')
      for (const meta of current.fieldMeta || []) {
        if (meta.type === 'checkbox' && meta.key !== 'taskDisabled') checkBoxFields.add(meta.key)
      }
      if (updates.taskDisabled === true) form.taskDisabled = 'true'
      else delete form.taskDisabled
      form.checkBoxFields = [...checkBoxFields].join(',')
      for (const [key, value] of Object.entries(form)) {
        if (value == null) continue
        body.append(key, String(value))
      }
      if (!body.has('save')) body.append('save', 'Save')
      const res = await fetch(`${this.baseUrl}/build/admin/edit/updateTask.action`, {
        method: 'POST',
        headers: {
          ...this.strutsAuthHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Atlassian-Token': 'no-check',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
        redirect: 'manual',
      })
      const setCookie = res.headers.getSetCookie?.() ?? []
      this.parseCookies(setCookie)
      const location = res.headers.get('location')
      if (location && /login|userlogin/i.test(location)) {
        return { success: false, errorMessage: 'Authentication required' }
      }
      if (res.status === 200) {
        const text = await res.text().catch(() => '')
        const errorMatch = text.match(/class="error"[^>]*>([^<]+)/i)
          || text.match(/aui-message-error[^>]*>[\s\S]*?<p[^>]*>([^<]+)/i)
        if (errorMatch?.[1]?.trim()) {
          return { success: false, errorMessage: errorMatch[1].trim() }
        }
        if (/aui-message-error|errorBox/i.test(text) && /you have to specify|required/i.test(text)) {
          return { success: false, errorMessage: 'Bamboo rejected the task update' }
        }
        logger.info('API', `updatePlanTask(${jobKey}, ${taskId}): success`, { status: res.status })
        return { success: true }
      }
      if (isStrutsActionSuccess(res.status, location, this.baseUrl)) {
        logger.info('API', `updatePlanTask(${jobKey}, ${taskId}): success via redirect`, {
          status: res.status, location,
        })
        return { success: true }
      }
      return { success: false, errorMessage: `Save failed (${res.status})` }
    } catch (err: any) {
      logger.error('API', `updatePlanTask failed: ${err.message}`, { jobKey, taskId })
      return { success: false, errorMessage: err.message || 'Failed to save task' }
    }
  }

  getBambooUrl(path: string): string {
    return `${this.baseUrl}${path}`
  }

  getServerUrl(): string {
    return this.baseUrl
  }

  // --- Backward-compatible wrappers for renderer ---

  async getDeployProjects(): Promise<BambooDeployProject[]> {
    const projects = await this.getProjects()
    return projects.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description ?? '',
      environments: [], // Deploy API unavailable on this server
    }))
  }

  async enrichBuildResultForDeploy(b: BambooBuildResult): Promise<BambooBuildResult> {
    if (hasDeployMeta(b)) return normalizeBambooBuildResult(b)
    try {
      const detail = await this.request<BambooBuildResult & Record<string, unknown>>(
        `/rest/api/latest/result/${b.buildResultKey}`
      )
      const extra = detail as Record<string, unknown>
      return normalizeBambooBuildResult({
        ...b,
        ...detail,
        buildReason:
          detail.buildReason ??
          (typeof extra.reasonSummary === 'string' ? extra.reasonSummary : undefined) ??
          b.buildReason,
        plan: b.plan ?? detail.plan,
      } as BambooBuildResult)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('API', `enrichBuildResult(${b.buildResultKey}): ${msg}`)
      return normalizeBambooBuildResult(b)
    }
  }

  async getDeployResults(projectKey: string): Promise<BambooDeployResult[]> {
    const all: BambooBuildResult[] = []
    let start = 0
    const pageSize = 50
    while (true) {
      const { results, hasMore } = await this.getBuildResultsPage(projectKey, start, pageSize)
      all.push(...results)
      if (!hasMore) break
      start += pageSize
    }
    return dedupeBuildResultsByPlan(all).map((b) => buildResultToDeploy(b, projectKey))
  }
}
