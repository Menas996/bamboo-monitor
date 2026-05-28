import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'

export type Theme = 'dark' | 'light'

const LIGHT_THEME = {
  '--bg-page': '#ffffff',
  '--bg-panel': '#ffffff',
  '--bg-surface': '#fafafa',
  '--bg-elevated': '#f5f5f5',
  '--text-primary': '#171717',
  '--text-secondary': '#4d4d4d',
  '--text-tertiary': '#666666',
  '--text-quaternary': '#808080',
  '--accent': '#171717',
  '--accent-hover': '#000000',
  '--accent-light': '#ebebeb',
  '--success': '#16a34a',
  '--success-emerald': '#10b981',
  '--error': '#dc2626',
  '--warning': '#d97706',
  '--border-subtle': 'rgba(0, 0, 0, 0.05)',
  '--border-default': 'rgba(0, 0, 0, 0.08)',
  '--border-strong': 'rgba(0, 0, 0, 0.12)',
  '--ring-border': 'rgb(235, 235, 235) 0px 0px 0px 1px',
  '--shadow-card': 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px',
  '--shadow-subtle': 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px',
  '--focus-ring': '2px solid hsla(212, 100%, 48%, 1)',
}

const DARK_THEME = {
  '--bg-page': '#0a0a0a',
  '--bg-panel': '#0a0a0a',
  '--bg-surface': '#111111',
  '--bg-elevated': '#1a1a1a',
  '--text-primary': '#ededed',
  '--text-secondary': '#a1a1a1',
  '--text-tertiary': '#737373',
  '--text-quaternary': '#525252',
  '--accent': '#ffffff',
  '--accent-hover': '#e5e5e5',
  '--accent-light': '#262626',
  '--success': '#22c55e',
  '--success-emerald': '#10b981',
  '--error': '#ef4444',
  '--warning': '#f59e0b',
  '--border-subtle': 'rgba(255, 255, 255, 0.05)',
  '--border-default': 'rgba(255, 255, 255, 0.08)',
  '--border-strong': 'rgba(255, 255, 255, 0.12)',
  '--ring-border': 'rgba(255, 255, 255, 0.08) 0px 0px 0px 1px',
  '--shadow-card': 'rgba(255,255,255,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.2) 0px 2px 2px, rgba(255,255,255,0.03) 0px 0px 0px 1px',
  '--shadow-subtle': 'rgba(255,255,255,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.15) 0px 2px 2px',
  '--focus-ring': '2px solid hsla(212, 100%, 48%, 1)',
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
})

function applyTheme(theme: Theme) {
  const vars = theme === 'dark' ? DARK_THEME : LIGHT_THEME
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.setAttribute('data-theme', theme)
}

export function ThemeProvider({ children, initialTheme = 'dark' }: { children: ReactNode; initialTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    applyTheme(newTheme)
    try { localStorage.setItem('bamboo-theme', newTheme) } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function getSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem('bamboo-theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch {}
  return 'dark'
}
