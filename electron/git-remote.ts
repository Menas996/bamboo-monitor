import { execFile } from 'child_process'
import { promisify } from 'util'
import { logger } from './lib/logger'

const execFileAsync = promisify(execFile)

export function injectGitCredentials(
  repoUrl: string,
  username: string,
  password: string
): string {
  try {
    const u = new URL(repoUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return repoUrl
    u.username = encodeURIComponent(username)
    u.password = encodeURIComponent(password)
    return u.toString()
  } catch {
    return repoUrl
  }
}

export async function gitLsRemoteHead(
  repoUrl: string,
  branch: string,
  auth?: { username: string; password: string }
): Promise<string | null> {
  const remote = auth?.username
    ? injectGitCredentials(repoUrl, auth.username, auth.password)
    : repoUrl
  const ref = branch.startsWith('refs/') ? branch : `refs/heads/${branch}`

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-remote', remote, ref],
      { timeout: 20_000, maxBuffer: 1024 * 64 }
    )
    const line = stdout.trim().split('\n').find((l) => l.includes(ref) || l.length > 0)
    const sha = line?.split(/\s+/)[0]?.trim()
    return sha && /^[0-9a-f]{6,40}$/i.test(sha) ? sha.toLowerCase() : null
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('GIT', `ls-remote failed: ${msg}`, { branch })
    return null
  }
}

export function isGitRemoteUrl(url: string): boolean {
  const s = url.trim()
  if (!s) return false
  if (/bamboo|atlassian|configureLinkedRepositories|\/rest\/api\/|\.action\?/i.test(s)) return false
  if (/^git@[^\s]+:[^\s]+/.test(s)) return true
  if (/^https?:\/\/[^\s]+\.git(\/)?$/i.test(s)) return true
  if (/^https?:\/\/(github\.com|gitlab\.|bitbucket\.|gitee\.com|codeup\.)/i.test(s)) return true
  return false
}

const PREFERRED_VCS_BRANCHES = ['master', 'main', 'dev', 'develop', 'release'] as const

export function pickPreferredVcsBranch(branchNames: string[]): string | null {
  const set = new Set(branchNames.map((b) => b.trim()).filter(Boolean))
  for (const p of PREFERRED_VCS_BRANCHES) {
    if (set.has(p)) return p
  }
  return null
}

export function pickGitBranch(...candidates: (string | undefined | null)[]): string {
  const names: string[] = []
  const explicit: string[] = []
  for (const raw of candidates) {
    const b = (raw ?? '').trim()
    if (!b || b.includes(' ') || b.includes('://')) continue
    const normalized = b.startsWith('refs/heads/') ? b.slice('refs/heads/'.length) : b
    if (!/^[\w./\-]+$/.test(normalized) || normalized.length > 80) continue
    if (PREFERRED_VCS_BRANCHES.includes(normalized as typeof PREFERRED_VCS_BRANCHES[number])) {
      explicit.push(normalized)
    } else {
      names.push(normalized)
    }
  }
  if (explicit.length > 0) return explicit[0]
  const preferred = pickPreferredVcsBranch(names)
  if (preferred) return preferred
  if (names.length > 0) return names[0]
  return 'main'
}

export function extractGitUrlsFromJson(val: unknown): string[] {
  if (val == null) return []
  let json = ''
  try {
    json = JSON.stringify(val)
  } catch {
    return []
  }
  const found = new Set<string>()
  const patterns = [
    /git@[^"'\\\s]+/gi,
    /https?:\/\/[^"'\\\s]+\.git/gi,
    /https?:\/\/(?:github|gitlab|bitbucket|gitee|codeup)[^"'\\\s]+/gi,
  ]
  for (const re of patterns) {
    for (const m of json.match(re) ?? []) {
      const u = m.trim().replace(/[,;]+$/, '')
      if (isGitRemoteUrl(u)) found.add(u)
    }
  }
  return [...found]
}

export function findGitUrlInValue(val: unknown, depth = 0): string | null {
  if (depth > 10 || val == null) return null
  if (typeof val === 'string') {
    const s = val.trim()
    return isGitRemoteUrl(s) ? s : null
  }
  if (Array.isArray(val)) {
    for (const item of val) {
      const found = findGitUrlInValue(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof val !== 'object') return null
  const keys = ['repositoryUrl', 'cloneUrl', 'scmUrl', 'fetchUrl', 'url', 'link', 'href']
  const rec = val as Record<string, unknown>
  for (const k of keys) {
    const found = findGitUrlInValue(rec[k], depth + 1)
    if (found) return found
  }
  for (const v of Object.values(rec)) {
    const found = findGitUrlInValue(v, depth + 1)
    if (found) return found
  }
  return null
}

export function findBranchInValue(val: unknown, depth = 0): string | null {
  if (depth > 8 || val == null) return null
  if (typeof val === 'string') {
    const s = val.trim()
    if (s.startsWith('refs/heads/')) return s.slice('refs/heads/'.length)
    if (/^[\w./-]+$/.test(s) && !s.includes('://') && s.length < 120) return s
    return null
  }
  if (typeof val !== 'object') return null
  const rec = val as Record<string, unknown>
  for (const k of ['branch', 'vcsBranch', 'branchName', 'name']) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim() && !v.includes('://')) {
      const b = v.trim()
      if (b.startsWith('refs/heads/')) return b.slice('refs/heads/'.length)
      return b
    }
  }
  for (const v of Object.values(rec)) {
    const found = findBranchInValue(v, depth + 1)
    if (found) return found
  }
  return null
}

export function findRevisionHashInJson(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === 'string' && /^[0-9a-f]{40}$/i.test(val.trim())) {
    return val.trim().toLowerCase()
  }
  if (Array.isArray(val)) {
    for (const item of val) {
      const f = findRevisionHashInJson(item)
      if (f) return f
    }
    return null
  }
  if (typeof val !== 'object') return null
  const rec = val as Record<string, unknown>
  for (const k of [
    'vcsRevisionKey', 'revision', 'repositoryRevision', 'detectedRevision',
    'planRepositoryRevision', 'revisionKey', 'latestRevision',
  ]) {
    const v = rec[k]
    if (typeof v === 'string' && /^[0-9a-f]{6,40}$/i.test(v.trim())) {
      return v.trim().toLowerCase()
    }
  }
  for (const v of Object.values(rec)) {
    const f = findRevisionHashInJson(v)
    if (f) return f
  }
  return null
}
