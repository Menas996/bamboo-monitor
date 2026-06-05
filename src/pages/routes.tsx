import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

export type Page = 'dashboard' | 'build' | 'settings' | 'logs' | 'health' | 'overview'

export type Route =
  | { page: 'dashboard' }
  | { page: 'build'; buildResultKey: string }
  | { page: 'settings' }
  | { page: 'logs' }
  | { page: 'health' }
  | { page: 'overview' }

interface NavigationContextValue {
  route: Route
  navigate: (route: Route) => void
  goBack: () => void
  cameFrom: Page
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' })
  const prevPageRef = useRef<Page>('dashboard')

  const navigate = useCallback((next: Route) => {
    setRoute((current) => {
      const from = current.page === 'build' ? prevPageRef.current : current.page
      if (next.page === 'build') prevPageRef.current = from
      return next
    })
  }, [])

  const goBack = useCallback(() => {
    setRoute({ page: prevPageRef.current } as Route)
  }, [])

  return (
    <NavigationContext.Provider value={{ route, navigate, goBack, cameFrom: prevPageRef.current }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigate() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigate must be used within NavigationProvider')
  return ctx.navigate
}

export function useGoBack() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useGoBack must be used within NavigationProvider')
  return ctx.goBack
}

export function useRoute() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useRoute must be used within NavigationProvider')
  return ctx.route
}

export function useCameFrom() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useCameFrom must be used within NavigationProvider')
  return ctx.cameFrom
}
