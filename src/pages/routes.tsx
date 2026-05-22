import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type Route =
  | { page: 'dashboard' }
  | { page: 'build'; buildResultKey: string }
  | { page: 'settings' }
  | { page: 'logs' }
  | { page: 'health' }

interface NavigationContextValue {
  route: Route
  navigate: (route: Route) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' })

  const navigate = useCallback((next: Route) => {
    setRoute(next)
  }, [])

  return (
    <NavigationContext.Provider value={{ route, navigate }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigate() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigate must be used within NavigationProvider')
  return ctx.navigate
}

export function useRoute() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useRoute must be used within NavigationProvider')
  return ctx.route
}
