import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, shell, type IpcMainInvokeEvent } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { BambooClient, BambooDeployResult, setGitRepositoryUrlMappings } from './bamboo-client'
import { startPolling, stopPolling, type FavoritePlan, type PollingOptions } from './poller'
import { setupTray } from './tray'
import { getAppIcon, setDockIcon } from './app-icon'
import { logger } from './lib/logger'
import { readStoredPassword, writeStoredPassword } from './lib/credentials'
import {
  isConfigKeyAllowed, isValidBuildResultKey, isValidPlanKey, isValidProjectKey,
  isHttpServerUrl, resolveBambooUrl, validateServerUrl,
} from './lib/security'

const store = new Store<{
  server: string
  username: string
  password: string
  pollInterval: number
  trackedProjects: string[]
  favoritePlans: FavoritePlan[]
  lastSeen: Record<string, number>
  autoDeployOnGitChange: boolean
  gitRepositoryUrls: Record<string, string>
  allowInsecureHttp: boolean
  passwordEncrypted?: string
}>()

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let bamboo: BambooClient | null = null
  const isDev = !!process.env.VITE_DEV_SERVER_URL

  function assertMainSender(event: IpcMainInvokeEvent): boolean {
    if (!mainWindow) return false
    return event.sender === mainWindow.webContents
  }

  function getStoredPassword(): string | undefined {
    return readStoredPassword(store)
  }

  function setupNavigationGuards(window: BrowserWindow) {
    const appOrigin = isDev && process.env.VITE_DEV_SERVER_URL
      ? new URL(process.env.VITE_DEV_SERVER_URL).origin
      : 'file://'

    window.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          void shell.openExternal(parsed.href)
        }
      } catch {
        /* ignore */
      }
      return { action: 'deny' }
    })

    window.webContents.on('will-navigate', (event, url) => {
      if (isDev && process.env.VITE_DEV_SERVER_URL) {
        const devOrigin = new URL(process.env.VITE_DEV_SERVER_URL).origin
        if (url.startsWith(devOrigin)) return
      }
      if (!url.startsWith(appOrigin)) {
        event.preventDefault()
      }
    })
  }

  function createWindow() {
    logger.info('SYSTEM', 'Creating main window', { dev: isDev })

    const appIcon = getAppIcon()

    mainWindow = new BrowserWindow({
      width: 1100,
      height: 720,
      minWidth: 800,
      minHeight: 600,
      icon: appIcon.isEmpty() ? undefined : appIcon,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#08090a',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      show: false,
    })

    if (isDev) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    setupNavigationGuards(mainWindow)

    mainWindow.once('ready-to-show', () => {
      logger.info('SYSTEM', 'Main window ready')
      mainWindow?.show()
    })

    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      logger.error('SYSTEM', `Window load failed: ${code} ${desc}`)
    })

    if (!isDev) {
      mainWindow.on('close', (e) => {
        if (tray) {
          e.preventDefault()
          mainWindow?.hide()
        }
      })
    }
  }

  function destroyTray() {
    if (tray) {
      tray.destroy()
      tray = null
      logger.debug('SYSTEM', 'Tray destroyed')
    }
  }

  function sendNotification(title: string, body: string, deploy: BambooDeployResult) {
    if (!Notification.isSupported()) {
      logger.warn('NOTIFY', 'Notifications not supported')
      return
    }

    const notification = new Notification({ title, body, silent: false })

    notification.on('click', () => {
      mainWindow?.show()
      mainWindow?.webContents.send('navigate-to-deploy', deploy)
    })

    notification.show()
    logger.info('NOTIFY', `Notification sent: ${title}`)
  }

  function isBuildSuccess(state?: string): boolean {
    if (!state) return false
    const s = state.toUpperCase()
    return s === 'SUCCESS' || s === 'SUCCESSFUL'
  }

  async function formatDeployNotification(
    client: BambooClient,
    d: BambooDeployResult
  ): Promise<{ title: string; body: string }> {
    const planName = d.environment?.name ?? d.project?.name ?? 'Plan'
    const state = d.deploymentResult?.state ?? 'UNKNOWN'

    if (isBuildSuccess(state)) {
      const buildNum = d.deployment?.id ? `#${d.deployment.id} ` : ''
      return {
        title: `部署成功 · ${planName}`,
        body: `${buildNum}${d.project?.name ?? ''}`.trim() || planName,
      }
    }

    let reason = (d.deploymentResult?.reason ?? '').trim()
    if (!reason && d.buildResultKey) {
      try {
        const log = await client.getFullBuildLog(d.buildResultKey)
        const extracted = client.extractErrorFromLog(log)
        if (extracted) reason = extracted
      } catch {
        /* ignore */
      }
    }
    if (!reason) reason = state

    const buildNum = d.deployment?.id ? `#${d.deployment.id} ` : ''
    return {
      title: `部署失败 · ${planName}`,
      body: `${buildNum}${reason}`.slice(0, 240),
    }
  }

  async function notifyNewDeploys(client: BambooClient, deploys: BambooDeployResult[]) {
    for (const d of deploys) {
      const { title, body } = await formatDeployNotification(client, d)
      sendNotification(title, body, d)
    }
  }

  function buildPollingOptions(): PollingOptions | undefined {
    const username = store.get('username')
    const password = getStoredPassword()
    const autoDeploy = store.get('autoDeployOnGitChange', false)
    if (!username || !password || !autoDeploy) {
      return undefined
    }
    return {
      autoDeployOnGitChange: true,
      auth: { username, password },
      onAutoDeploy: ({ fav, status, queue }) => {
        const shortRev = status.remoteRevision?.slice(0, 8) ?? ''
        const title = queue.success
          ? `自动部署 · ${fav.planName}`
          : `自动部署失败 · ${fav.planName}`
        const body = queue.success
          ? `检测到新提交 (${shortRev})，已触发 Bamboo 构建`
          : (queue.errorMessage
            ? `无法将构建加入队列：${queue.errorMessage}`
            : '无法将构建加入队列，请检查 Bamboo 计划构建权限')
        sendNotification(title, body)
        mainWindow?.webContents.send('git-auto-deploy', { fav, status, queue })
        logger.info('GIT', `Auto deploy ${queue.success ? 'ok' : 'fail'} for ${fav.planKey}`, {
          remote: status.remoteRevision,
          statusCode: queue.statusCode,
          error: queue.errorMessage,
        })
      },
    }
  }

  function resolveAllowInsecureHttp(server: string): boolean {
    const stored = store.get('allowInsecureHttp')
    if (typeof stored === 'boolean') return stored
    if (isHttpServerUrl(server)) {
      store.set('allowInsecureHttp', true)
      logger.info('AUTH', 'Migrated existing HTTP Bamboo URL: allowInsecureHttp=true')
      return true
    }
    return false
  }

  function ensureBambooClient(): BambooClient | null {
    if (bamboo) return bamboo
    const server = store.get('server')
    const username = store.get('username')
    const password = getStoredPassword()
    if (!server || !username || !password) return null
    const allowInsecureHttp = resolveAllowInsecureHttp(server)
    try {
      bamboo = new BambooClient(server, username, password, { allowInsecureHttp })
      return bamboo
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('AUTH', `Failed to create Bamboo client: ${message}`)
      bamboo = null
      return null
    }
  }

  function startMonitoring() {
    const client = ensureBambooClient()
    if (!client) return

    const interval = store.get('pollInterval', 30)
    const favorites = store.get('favoritePlans', [])

    logger.info('POLL', `Starting poller: ${favorites.length} favorite plans, ${interval}s interval`, {
      autoDeploy: store.get('autoDeployOnGitChange', false),
    })

    startPolling(client, favorites, interval, async (newDeploys) => {
      await notifyNewDeploys(client, newDeploys)
      mainWindow?.webContents.send('new-deploys', newDeploys)
    }, buildPollingOptions())
  }

  // --- IPC Handlers ---

  function registerIPC() {
    ipcMain.handle('bamboo:login', async (event, server: string, username: string, password: string) => {
      if (!assertMainSender(event)) return false
      let allowInsecureHttp = store.get('allowInsecureHttp', false)
      if (!allowInsecureHttp && isHttpServerUrl(server)) {
        allowInsecureHttp = true
        store.set('allowInsecureHttp', true)
      }
      const normalizedServer = validateServerUrl(server, allowInsecureHttp)
      if (!normalizedServer) {
        logger.warn('AUTH', 'Login rejected: invalid server URL', { server })
        return false
      }
      logger.operation('login', { server: normalizedServer, username })
      try {
        bamboo = new BambooClient(normalizedServer, username, password, { allowInsecureHttp })
        const valid = await bamboo.validateAuth()
        if (valid) {
          store.set('server', normalizedServer)
          store.set('username', username)
          writeStoredPassword(store, password)
          logger.info('AUTH', 'Login successful')
        } else {
          bamboo = null
          logger.warn('AUTH', 'Login failed — invalid credentials')
        }
        return valid
      } catch (err: any) {
        bamboo = null
        logger.error('AUTH', `Login error: ${err.message}`, { stack: err.stack })
        return false
      }
    })

    ipcMain.handle('bamboo:getProjects', async () => {
      logger.operation('fetch-projects')
      if (!bamboo) {
        logger.warn('API', 'getProjects called without client')
        return []
      }
      try {
        return await bamboo.getDeployProjects()
      } catch (err: any) {
        logger.error('API', `getProjects failed: ${err.message}`)
        return []
      }
    })

    ipcMain.handle('bamboo:getDeployments', async (event, projectKey: string) => {
      if (!assertMainSender(event) || !isValidProjectKey(projectKey)) {
        return { ok: false as const, error: 'Invalid request', deploys: [] }
      }
      logger.operation('fetch-deployments', { projectKey })
      if (!bamboo) {
        logger.warn('API', 'getDeployments called without client')
        return { ok: false as const, error: 'Not connected', deploys: [] }
      }
      try {
        const deploys = await bamboo.getDeployResults(projectKey)
        return { ok: true as const, deploys }
      } catch (err: any) {
        logger.error('API', `getDeployments failed for ${projectKey}: ${err.message}`)
        return { ok: false as const, error: err.message, deploys: [] }
      }
    })

    ipcMain.handle(
      'bamboo:getDeploymentsPage',
      async (event, projectKey: string, startIndex: number, pageSize: number) => {
        if (!assertMainSender(event) || !isValidProjectKey(projectKey)) {
          return { ok: false as const, error: 'Invalid request', deploys: [], hasMore: false }
        }
        if (!bamboo) {
          return { ok: false as const, error: 'Not connected', deploys: [], hasMore: false }
        }
        try {
          const page = await bamboo.getDeployResultsPage(projectKey, startIndex, pageSize)
          return { ok: true as const, ...page }
        } catch (err: any) {
          logger.error('API', `getDeploymentsPage failed for ${projectKey}: ${err.message}`)
          return { ok: false as const, error: err.message, deploys: [], hasMore: false }
        }
      }
    )

    ipcMain.handle(
      'bamboo:enrichDeployments',
      async (_e, projectKey: string, buildResultKeys: string[]) => {
        if (!bamboo) return []
        try {
          return await bamboo.enrichDeployResults(projectKey, buildResultKeys)
        } catch (err: any) {
          logger.error('API', `enrichDeployments failed: ${err.message}`)
          return []
        }
      }
    )

    ipcMain.handle('bamboo:getBuildLog', async (_e, buildResultKey: string) => {
      if (!bamboo) return null
      try {
        const log = await bamboo.getBuildLog(buildResultKey)
        return bamboo.extractErrorFromLog(log)
      } catch (err: any) {
        logger.error('API', `getBuildLog failed for ${buildResultKey}: ${err.message}`)
        return null
      }
    })

    ipcMain.handle('bamboo:getFullBuildLog', async (_e, buildResultKey: string) => {
      if (!bamboo) return ''
      try {
        return await bamboo.getFullBuildLog(buildResultKey)
      } catch (err: any) {
        logger.error('API', `getFullBuildLog failed for ${buildResultKey}: ${err.message}`)
        return ''
      }
    })

    ipcMain.handle('bamboo:getBuildDetail', async (_e, buildResultKey: string) => {
      if (!bamboo) return null
      try {
        return await bamboo.getBuildDetail(buildResultKey)
      } catch (err: any) {
        logger.error('API', `getBuildDetail failed for ${buildResultKey}: ${err.message}`)
        return null
      }
    })

    ipcMain.handle('bamboo:getPlanDetail', async (_e, planKey: string) => {
      if (!bamboo) return null
      try {
        return await bamboo.getPlanDetail(planKey)
      } catch (err: any) {
        logger.error('API', `getPlanDetail failed for ${planKey}: ${err.message}`)
        return null
      }
    })

    ipcMain.handle('bamboo:getPlanResults', async (_e, planKey: string) => {
      if (!bamboo) return []
      try {
        return await bamboo.getPlanResults(planKey)
      } catch (err: any) {
        logger.error('API', `getPlanResults failed for ${planKey}: ${err.message}`)
        return []
      }
    })

    ipcMain.handle('bamboo:getPlanResultsEnriched', async (_e, planKey: string) => {
      if (!bamboo) return []
      try {
        return await bamboo.getPlanResultsEnriched(planKey)
      } catch (err: any) {
        logger.error('API', `getPlanResultsEnriched failed for ${planKey}: ${err.message}`)
        return []
      }
    })

    ipcMain.handle(
      'bamboo:getPlanResultsHistoryPage',
      async (_e, planKey: string, startIndex: number, pageSize: number) => {
        if (!bamboo) return { rows: [], hasMore: false }
        try {
          return await bamboo.getPlanResultsHistoryPage(planKey, startIndex, pageSize)
        } catch (err: any) {
          logger.error('API', `getPlanResultsHistoryPage failed for ${planKey}: ${err.message}`)
          return { rows: [], hasMore: false }
        }
      }
    )

    ipcMain.handle('bamboo:getProjectPlans', async (_e, projectKey: string) => {
      if (!bamboo) return []
      try {
        return await bamboo.getProjectPlans(projectKey)
      } catch (err: any) {
        logger.error('API', `getProjectPlans failed for ${projectKey}: ${err.message}`)
        return []
      }
    })

    ipcMain.handle('bamboo:queueBuild', async (event, planKey: string, variables?: Record<string, string>) => {
      if (!assertMainSender(event) || !isValidPlanKey(planKey)) {
        return { success: false, errorMessage: 'Invalid plan key' }
      }
      if (!bamboo) return { success: false, errorMessage: 'Not connected' }
      try {
        return await bamboo.queueBuild(planKey, variables)
      } catch (err: any) {
        logger.error('API', `queueBuild failed for ${planKey}: ${err.message}`)
        return { success: false, errorMessage: err.message }
      }
    })

    ipcMain.handle('bamboo:deleteBuildResult', async (event, buildResultKey: string) => {
      if (!assertMainSender(event) || !isValidBuildResultKey(buildResultKey)) return false
      if (!bamboo) return false
      try {
        return await bamboo.deleteBuildResult(buildResultKey)
      } catch (err: any) {
        logger.error('API', `deleteBuildResult failed for ${buildResultKey}: ${err.message}`)
        return false
      }
    })

    ipcMain.handle('bamboo:stopBuild', async (event, buildResultKey: string) => {
      if (!assertMainSender(event) || !isValidBuildResultKey(buildResultKey)) {
        return { success: false, errorMessage: 'Invalid build result key' }
      }
      logger.operation('stop-build', { buildResultKey })
      if (!bamboo) return { success: false, errorMessage: 'Not connected' }
      try {
        return await bamboo.stopBuild(buildResultKey)
      } catch (err: any) {
        logger.error('API', `stopBuild failed for ${buildResultKey}: ${err.message}`)
        return { success: false, errorMessage: err.message }
      }
    })

    ipcMain.handle('bamboo:openUrl', async (event, urlPath: string) => {
      if (!assertMainSender(event) || !bamboo) return
      const resolved = resolveBambooUrl(bamboo.getServerUrl(), urlPath)
      if (!resolved) {
        logger.warn('IPC', 'openUrl blocked', { path: urlPath })
        return
      }
      await shell.openExternal(resolved)
    })

    ipcMain.handle('config:get', async (event, key: string) => {
      if (!assertMainSender(event) || !isConfigKeyAllowed(key)) return undefined
      return store.get(key as any)
    })

    ipcMain.handle('config:set', async (event, key: string, value: unknown) => {
      if (!assertMainSender(event) || !isConfigKeyAllowed(key)) {
        logger.warn('CONFIG', 'config:set blocked', { key })
        return
      }
      logger.operation('config-set', { key })
      store.set(key as any, value)
      if (key === 'gitRepositoryUrls' && value && typeof value === 'object') {
        setGitRepositoryUrlMappings(value as Record<string, string>)
      }
    })

    ipcMain.handle('poll:start', async (_e, interval: number, favoritePlans: FavoritePlan[]) => {
      logger.operation('poll-start', { interval, planCount: favoritePlans.length })
      if (!bamboo) return
      store.set('pollInterval', interval)
      store.set('favoritePlans', favoritePlans)
      startPolling(bamboo, favoritePlans, interval, async (newDeploys) => {
        await notifyNewDeploys(bamboo!, newDeploys)
        mainWindow?.webContents.send('new-deploys', newDeploys)
      }, buildPollingOptions())
    })

    ipcMain.handle('poll:stop', async () => {
      logger.operation('poll-stop')
      stopPolling()
    })

    // --- Window Controls ---

    ipcMain.handle('window:minimize', () => mainWindow?.minimize())
    ipcMain.handle('window:maximize', () => {
      if (mainWindow?.isMaximized()) mainWindow.unmaximize()
      else mainWindow?.maximize()
    })
    ipcMain.handle('window:close', () => mainWindow?.close())
    ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

    mainWindow?.on('maximize', () => {
      mainWindow?.webContents.send('window:maximized-changed', true)
    })
    mainWindow?.on('unmaximize', () => {
      mainWindow?.webContents.send('window:maximized-changed', false)
    })

    // --- Log IPC ---

    ipcMain.handle('logs:get', async (_e, filter?: { level?: string; category?: string; search?: string }) => {
      return logger.getLogs(filter as any)
    })

    ipcMain.handle('logs:export', async (_e, filter?: { level?: string; category?: string }) => {
      return logger.exportLogs(filter as any)
    })

    ipcMain.handle('logs:clear', async () => {
      logger.operation('logs-clear')
      logger.clearLogs()
      return true
    })

    ipcMain.handle('logs:list-files', async () => {
      return logger.listLogFiles()
    })

    ipcMain.handle('logs:read-file', async (_e, filename: string) => {
      return logger.readLogFile(filename)
    })

    // --- Health Check ---

    ipcMain.handle('health:check', async () => {
      const server = store.get('server') as string | undefined
      const username = store.get('username') as string | undefined
      const password = getStoredPassword()
      const baseUrl = server?.replace(/\/+$/, '') ?? ''

      const checks: Record<string, { status: string; detail?: string; latency?: number }> = {}

      // Server connectivity
      if (baseUrl) {
        const start = performance.now()
        try {
          const res = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) })
          checks.connectivity = {
            status: res.ok ? 'ok' : 'degraded',
            detail: `HTTP ${res.status}`,
            latency: Math.round(performance.now() - start),
          }
        } catch (err: any) {
          checks.connectivity = {
            status: 'error',
            detail: err.message,
            latency: Math.round(performance.now() - start),
          }
        }
      } else {
        checks.connectivity = { status: 'not-configured' }
      }

      // API auth — must use the same BambooClient as the rest of the app
      const client = bamboo ?? ensureBambooClient()
      if (client) {
        const start = performance.now()
        try {
          await client.getProjects()
          checks.api = {
            status: 'ok',
            detail: 'REST API OK',
            latency: Math.round(performance.now() - start),
          }
        } catch (err: any) {
          const msg = err.message ?? String(err)
          const authLike = /401|403|unauthorized|forbidden/i.test(msg)
          checks.api = {
            status: authLike ? 'auth-failed' : 'error',
            detail: msg.slice(0, 160),
            latency: Math.round(performance.now() - start),
          }
        }
      } else if (baseUrl && username && password) {
        checks.api = {
          status: 'error',
          detail: isHttpServerUrl(baseUrl)
            ? 'HTTP Bamboo URL blocked — enable “Allow insecure HTTP” in Settings or Login'
            : 'Bamboo client unavailable',
        }
      } else {
        checks.api = { status: 'not-configured' }
      }

      // Poller status
      checks.poller = {
        status: 'active',
        detail: `${store.get('favoritePlans', []).length} favorite plans, ${store.get('pollInterval', 30)}s interval`,
      }

      // Log stats
      const logs = logger.getLogs()
      checks.logs = {
        status: 'ok',
        detail: `${logs.length} entries in memory, ${logger.listLogFiles().length} files on disk`,
      }

      const overall = Object.values(checks).every((c) => c.status === 'ok' || c.status === 'active')
      logger.info('SYSTEM', `Health check: ${overall ? 'OK' : 'ISSUES FOUND'}`, checks)

      return { overall, checks }
    })
  }

  // --- App Lifecycle ---

  app.whenReady().then(() => {
    logger.info('SYSTEM', 'App starting', {
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    })

    setDockIcon()
    const legacyPassword = store.get('password')
    if (legacyPassword && typeof legacyPassword === 'string') {
      writeStoredPassword(store, legacyPassword)
    }
    const gitUrls = store.get('gitRepositoryUrls', {}) as Record<string, string>
    if (gitUrls && typeof gitUrls === 'object' && Object.keys(gitUrls).length > 0) {
      setGitRepositoryUrlMappings(gitUrls)
    }
    createWindow()

    if (mainWindow && !isDev) {
      tray = setupTray(mainWindow, startMonitoring)
    }

    startMonitoring()
    registerIPC()

    logger.info('SYSTEM', 'App ready')
  })

  app.on('window-all-closed', () => {
    if (isDev) {
      logger.info('SYSTEM', 'All windows closed (dev mode), quitting')
      destroyTray()
      stopPolling()
      app.quit()
      return
    }
    if (process.platform !== 'darwin') {
      logger.info('SYSTEM', 'All windows closed, quitting')
      destroyTray()
      stopPolling()
      app.quit()
    }
  })

  app.on('before-quit', () => {
    logger.info('SYSTEM', 'App quitting')
    destroyTray()
    stopPolling()
  })

  process.on('uncaughtException', (err) => {
    logger.fatal('SYSTEM', `Uncaught exception: ${err.message}`, {
      stack: err.stack,
      name: err.name,
    })
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('SYSTEM', `Unhandled rejection: ${reason}`, {
      reason: String(reason),
    })
  })
}
