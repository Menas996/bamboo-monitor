import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, shell } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { BambooClient, BambooDeployResult, setGitRepositoryUrlMappings } from './bamboo-client'
import { startPolling, stopPolling, type FavoritePlan, type PollingOptions } from './poller'
import { setupTray } from './tray'
import { getAppIcon, setDockIcon } from './app-icon'
import { logger } from './lib/logger'

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
      },
      show: false,
    })

    if (isDev) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

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
    const password = store.get('password')
    const autoDeploy = store.get('autoDeployOnGitChange', true)
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

  function startMonitoring() {
    const server = store.get('server')
    const username = store.get('username')
    const password = store.get('password')

    if (server && username && password) {
      bamboo = new BambooClient(server, username, password)
      const interval = store.get('pollInterval', 30)
      const favorites = store.get('favoritePlans', [])

      logger.info('POLL', `Starting poller: ${favorites.length} favorite plans, ${interval}s interval`, {
        autoDeploy: store.get('autoDeployOnGitChange', true),
      })

      startPolling(bamboo, favorites, interval, async (newDeploys) => {
        await notifyNewDeploys(bamboo!, newDeploys)
        mainWindow?.webContents.send('new-deploys', newDeploys)
      }, buildPollingOptions())
    }
  }

  // --- IPC Handlers ---

  function registerIPC() {
    ipcMain.handle('bamboo:login', async (_e, server: string, username: string, password: string) => {
      logger.operation('login', { server, username })
      bamboo = new BambooClient(server, username, password)
      try {
        const valid = await bamboo.validateAuth()
        if (valid) {
          store.set('server', server)
          store.set('username', username)
          store.set('password', password)
          logger.info('AUTH', 'Login successful')
        } else {
          logger.warn('AUTH', 'Login failed — invalid credentials')
        }
        return valid
      } catch (err: any) {
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

    ipcMain.handle('bamboo:getDeployments', async (_e, projectKey: string) => {
      logger.operation('fetch-deployments', { projectKey })
      if (!bamboo) {
        logger.warn('API', 'getDeployments called without client')
        return []
      }
      try {
        return await bamboo.getDeployResults(projectKey)
      } catch (err: any) {
        logger.error('API', `getDeployments failed for ${projectKey}: ${err.message}`)
        return []
      }
    })

    ipcMain.handle(
      'bamboo:getDeploymentsPage',
      async (_e, projectKey: string, startIndex: number, pageSize: number) => {
        if (!bamboo) return { deploys: [], hasMore: false }
        try {
          return await bamboo.getDeployResultsPage(projectKey, startIndex, pageSize)
        } catch (err: any) {
          logger.error('API', `getDeploymentsPage failed for ${projectKey}: ${err.message}`)
          return { deploys: [], hasMore: false }
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

    ipcMain.handle('bamboo:queueBuild', async (_e, planKey: string, variables?: Record<string, string>) => {
      if (!bamboo) return false
      try {
        return await bamboo.queueBuild(planKey, variables)
      } catch (err: any) {
        logger.error('API', `queueBuild failed for ${planKey}: ${err.message}`)
        return false
      }
    })

    ipcMain.handle('bamboo:deleteBuildResult', async (_e, buildResultKey: string) => {
      if (!bamboo) return false
      try {
        return await bamboo.deleteBuildResult(buildResultKey)
      } catch (err: any) {
        logger.error('API', `deleteBuildResult failed for ${buildResultKey}: ${err.message}`)
        return false
      }
    })

    ipcMain.handle('bamboo:openUrl', async (_e, path: string) => {
      if (!bamboo) return
      const url = bamboo.getServerUrl() + path
      await shell.openExternal(url)
    })

    ipcMain.handle('config:get', async (_e, key: string) => {
      return store.get(key as any)
    })

    ipcMain.handle('config:set', async (_e, key: string, value: unknown) => {
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
      const password = store.get('password') as string | undefined
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

      // API auth — reuse Bamboo client (normalized base URL + basic/session auth)
      if (bamboo) {
        const start = performance.now()
        try {
          await bamboo.getProjects()
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
        const start = performance.now()
        const url = `${baseUrl}/rest/api/latest/project`
        try {
          const res = await fetch(url, {
            headers: {
              Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          })
          checks.api = {
            status: res.ok ? 'ok' : (res.status === 401 || res.status === 403 ? 'auth-failed' : 'error'),
            detail: `HTTP ${res.status}`,
            latency: Math.round(performance.now() - start),
          }
        } catch (err: any) {
          checks.api = { status: 'error', detail: err.message }
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
