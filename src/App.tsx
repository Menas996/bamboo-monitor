import { useState, useEffect } from 'react'
import { ErrorBoundary } from './lib/error-boundary'
import { rendererLog } from './lib/renderer-logger'
import { I18nProvider, getSavedLocale } from './lib/i18n'
import { ThemeProvider, getSavedTheme } from './lib/theme'
import TitleBar from './components/TitleBar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BuildDetail from './pages/BuildDetail'
import { NavigationProvider, useRoute, useNavigate } from './pages/routes'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import Health from './pages/Health'
import Overview from './pages/Overview'
import Layout from './components/Layout'

declare global {
  interface Window {
    bamboo: {
      login: (server: string, username: string, password: string) => Promise<boolean>
      logout: () => Promise<boolean>
      getProjects: () => Promise<any[]>
      getDeployments: (projectKey: string) => Promise<{ ok: boolean; deploys: any[]; error?: string }>
      getDeploymentsPage: (projectKey: string, startIndex: number, pageSize: number) => Promise<
        { ok: true; deploys: any[]; hasMore: boolean } | { ok: false; error: string; deploys: any[]; hasMore: boolean }
      >
      enrichDeployments: (projectKey: string, buildResultKeys: string[]) => Promise<any[]>
      getBuildLog: (buildResultKey: string) => Promise<string | null>
      getFullBuildLog: (buildResultKey: string) => Promise<string | null>
      getBuildDetail: (buildResultKey: string) => Promise<any>
      getPlanDetail: (planKey: string) => Promise<any>
      getPlanTaskConfig: (jobKey: string, taskId: string) => Promise<{
        ok: boolean
        editable: boolean
        pluginKey?: string
        fields: Record<string, string>
        checkboxes: Record<string, boolean>
        form: Record<string, string>
        fieldMeta?: { key: string; type: 'text' | 'textarea' | 'select' | 'checkbox'; options?: { value: string; label: string }[] }[]
        errorMessage?: string
      }>
      updatePlanTask: (jobKey: string, taskId: string, updates: Record<string, string | boolean>) => Promise<{
        success: boolean
        errorMessage?: string
      }>
      getPlanResults: (planKey: string) => Promise<any>
      getPlanResultsEnriched: (planKey: string) => Promise<any>
      getPlanResultsHistoryPage: (planKey: string, startIndex: number, pageSize: number) => Promise<{ rows: any[]; hasMore: boolean }>
      getProjectPlans: (projectKey: string) => Promise<any[]>
    }
    config: {
      get: (key: string) => Promise<any>
      set: (key: string, value: unknown) => Promise<void>
    }
    poll: {
      start: (interval: number, favoritePlans: { planKey: string; projectKey: string; planName: string }[]) => Promise<void>
      stop: () => Promise<void>
    }
    logs: {
      get: (filter?: { level?: string; category?: string; search?: string }) => Promise<any[]>
      export: (filter?: { level?: string; category?: string }) => Promise<string>
      clear: () => Promise<boolean>
      listFiles: () => Promise<string[]>
      readFile: (filename: string) => Promise<string>
    }
    health: {
      check: () => Promise<any>
    }
    win: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
    }
    actions: {
      queueBuild: (planKey: string, variables?: Record<string, string>) => Promise<{ success: boolean; buildResultKey?: string; errorMessage?: string }>
      deleteBuildResult: (buildResultKey: string) => Promise<boolean>
      stopBuild: (buildResultKey: string) => Promise<{ success: boolean; errorMessage?: string }>
      openUrl: (path: string) => Promise<void>
    }
  }
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    rendererLog.info('SYSTEM', 'App initializing')
    async function init() {
      try {
        const server = await window.config.get('server')
        if (!server) return
        const health = await window.health.check()
        const apiStatus = health?.checks?.api?.status
        if (apiStatus === 'ok') {
          setLoggedIn(true)
          rendererLog.info('AUTH', 'Session validated')
        } else {
          rendererLog.warn('AUTH', 'Stored session invalid', { apiStatus })
        }
      } catch {
        rendererLog.warn('AUTH', 'Session validation failed')
      } finally {
        setLoading(false)
        setReady(true)
      }
    }
    void init()
  }, [])

  function handleError(error: Error, errorInfo: any) {
    rendererLog.fatal('SYSTEM', `React error: ${error.message}`, {
      stack: error.stack, componentStack: errorInfo?.componentStack,
    })
  }

  if (!ready) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08090a', color: '#8a8f98' }}>Loading...</div>
  }

  return (
    <ThemeProvider initialTheme={getSavedTheme()}>
      <I18nProvider initialLocale={getSavedLocale()}>
        <ErrorBoundary onError={handleError}>
          <NavigationProvider>
            {loading ? (
              <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)', color: 'var(--text-tertiary)' }}>Loading...</div>
            ) : !loggedIn ? (
              <Login onLogin={() => { setLoggedIn(true); rendererLog.info('AUTH', 'Login successful') }} />
            ) : (
              <AppShell onLogout={() => {
                setLoggedIn(false)
                rendererLog.info('AUTH', 'Logged out')
              }} />
            )}
          </NavigationProvider>
        </ErrorBoundary>
      </I18nProvider>
    </ThemeProvider>
  )
}

/** Inner component that reads the current route and renders the appropriate page. */
function AppShell({ onLogout }: { onLogout: () => void }) {
  const route = useRoute()
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (event: Event) => {
      const deploy = (event as CustomEvent).detail as { buildResultKey?: string } | undefined
      const buildResultKey = deploy?.buildResultKey
      if (buildResultKey) {
        navigate({ page: 'build', buildResultKey })
      } else {
        navigate({ page: 'dashboard' })
      }
    }
    window.addEventListener('navigate-to-deploy', handler)
    return () => window.removeEventListener('navigate-to-deploy', handler)
  }, [navigate])

  return (
    <>
      <TitleBar />
      <div style={{ paddingTop: 38, height: '100vh' }}>
        <Layout>
          {(route.page === 'dashboard' || route.page === 'build') && (
            <div style={{ display: route.page === 'dashboard' ? 'block' : 'none', height: '100%', width: '100%' }}>
              <Dashboard />
            </div>
          )}
          {route.page === 'build' && <BuildDetail buildResultKey={route.buildResultKey} />}
          {route.page === 'settings' && <Settings onLogout={onLogout} />}
          {route.page === 'logs' && <Logs />}
          {route.page === 'health' && <Health />}
          {route.page === 'overview' && <Overview />}
        </Layout>
      </div>
    </>
  )
}
