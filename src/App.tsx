import { useState, useEffect } from 'react'
import { ErrorBoundary } from './lib/error-boundary'
import { rendererLog } from './lib/renderer-logger'
import { I18nProvider, getSavedLocale } from './lib/i18n'
import { ThemeProvider, getSavedTheme } from './lib/theme'
import TitleBar from './components/TitleBar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BuildDetail from './pages/BuildDetail'
import { NavigationProvider, useRoute } from './pages/routes'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import Health from './pages/Health'
import Overview from './pages/Overview'
import Layout from './components/Layout'

declare global {
  interface Window {
    bamboo: {
      login: (server: string, username: string, password: string) => Promise<boolean>
      getProjects: () => Promise<any[]>
      getDeployments: (projectKey: string) => Promise<any[]>
      getDeploymentsPage: (projectKey: string, startIndex: number, pageSize: number) => Promise<{ deploys: any[]; hasMore: boolean }>
      enrichDeployments: (projectKey: string, buildResultKeys: string[]) => Promise<any[]>
      getBuildLog: (buildResultKey: string) => Promise<string | null>
      getFullBuildLog: (buildResultKey: string) => Promise<string | null>
      getBuildDetail: (buildResultKey: string) => Promise<any>
      getPlanDetail: (planKey: string) => Promise<any>
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
      queueBuild: (planKey: string, variables?: Record<string, string>) => Promise<{ success: boolean; buildResultKey?: string }>
      deleteBuildResult: (buildResultKey: string) => Promise<boolean>
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
    window.config.get('server').then((server) => {
      if (server) {
        setLoggedIn(true)
        rendererLog.info('AUTH', 'Auto-login from stored config')
      }
      setLoading(false)
      setReady(true)
    }).catch(() => { setLoading(false); setReady(true) })
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
              <AppShell />
            )}
          </NavigationProvider>
        </ErrorBoundary>
      </I18nProvider>
    </ThemeProvider>
  )
}

/** Inner component that reads the current route and renders the appropriate page. */
function AppShell() {
  const route = useRoute()

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
          {route.page === 'settings' && <Settings />}
          {route.page === 'logs' && <Logs />}
          {route.page === 'health' && <Health />}
          {route.page === 'overview' && <Overview />}
        </Layout>
      </div>
    </>
  )
}
