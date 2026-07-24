const BAMBOO_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const BUILD_RESULT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*-\d+$/
const VARIABLE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/
const MAX_VARIABLE_COUNT = 32
const MAX_VARIABLE_KEY_LENGTH = 128
const MAX_VARIABLE_VALUE_LENGTH = 4096

export const CONFIG_ALLOWLIST = new Set([
  'server',
  'username',
  'pollInterval',
  'trackedProjects',
  'favoritePlans',
  'lastSeen',
  'autoDeployOnGitChange',
  'gitRepositoryUrls',
  'allowInsecureHttp',
  'menuBarQuickActions',
])

const FORBIDDEN_CONFIG_KEYS = new Set(['password', 'passwordEncrypted'])

export function isConfigKeyAllowed(key: string): boolean {
  if (FORBIDDEN_CONFIG_KEYS.has(key)) return false
  return CONFIG_ALLOWLIST.has(key)
}

export function isValidPlanKey(planKey: string): boolean {
  return typeof planKey === 'string' && planKey.length > 0 && planKey.length <= 128 && BAMBOO_KEY_PATTERN.test(planKey)
}

export function isValidBuildResultKey(buildResultKey: string): boolean {
  return typeof buildResultKey === 'string'
    && buildResultKey.length > 0
    && buildResultKey.length <= 256
    && BUILD_RESULT_KEY_PATTERN.test(buildResultKey)
}

export function isValidProjectKey(projectKey: string): boolean {
  return isValidPlanKey(projectKey)
}

export function sanitizeBuildVariables(variables?: Record<string, string>): Record<string, string> | undefined {
  if (!variables || typeof variables !== 'object') return undefined
  const out: Record<string, string> = {}
  let count = 0
  for (const [key, value] of Object.entries(variables)) {
    if (count >= MAX_VARIABLE_COUNT) break
    if (!VARIABLE_KEY_PATTERN.test(key) || key.length > MAX_VARIABLE_KEY_LENGTH) continue
    if (typeof value !== 'string' || value.length > MAX_VARIABLE_VALUE_LENGTH) continue
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) continue
    out[key] = value
    count++
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function resolveBambooUrl(baseUrl: string, relativePath: string): string | null {
  if (typeof relativePath !== 'string') return null
  const path = relativePath.trim()
  if (!path.startsWith('/') || path.includes('://') || path.includes('@') || path.includes('\\')) return null
  if (path.startsWith('//')) return null
  try {
    const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    const resolved = new URL(path, base)
    if (resolved.origin !== base.origin) return null
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    return resolved.href
  } catch {
    return null
  }
}

export function validateServerUrl(server: string, allowInsecureHttp: boolean): string | null {
  if (typeof server !== 'string') return null
  const trimmed = server.trim().replace(/\/+$/, '')
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return trimmed
    if (url.protocol === 'http:' && allowInsecureHttp) return trimmed
    return null
  } catch {
    return null
  }
}

export function isHttpServerUrl(server: string): boolean {
  try {
    return new URL(server.trim()).protocol === 'http:'
  } catch {
    return false
  }
}

export function isSameOriginUrl(targetUrl: string, baseUrl: string): boolean {
  try {
    const target = new URL(targetUrl)
    const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    return target.origin === base.origin
  } catch {
    return false
  }
}

export function isLoginRedirect(location: string, baseUrl: string): boolean {
  try {
    const resolved = location.startsWith('http') ? location : `${baseUrl.replace(/\/+$/, '')}${location.startsWith('/') ? location : `/${location}`}`
    const path = new URL(resolved).pathname.toLowerCase()
    return path.includes('login') || path.includes('userlogin')
  } catch {
    return true
  }
}

export function isStrutsActionSuccess(status: number, location: string | null, baseUrl: string): boolean {
  if (status === 200 || status === 204) return true
  if (status !== 302 || !location) return false
  if (!isSameOriginUrl(
    location.startsWith('http') ? location : `${baseUrl.replace(/\/+$/, '')}${location.startsWith('/') ? location : `/${location}`}`,
    baseUrl
  )) return false
  return !isLoginRedirect(location, baseUrl)
}

export function shouldInjectGitCredentials(repoUrl: string, bambooServerUrl: string): boolean {
  try {
    if (repoUrl.startsWith('git@')) return false
    const repo = new URL(repoUrl)
    const bamboo = new URL(bambooServerUrl.endsWith('/') ? bambooServerUrl : `${bambooServerUrl}/`)
    return repo.hostname === bamboo.hostname
  } catch {
    return false
  }
}

export function isSafeHttpUrl(href: string): boolean {
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
