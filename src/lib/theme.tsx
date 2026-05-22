import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'

export type Theme = 'dark' | 'light'

// Light theme CSS variables
const LIGHT_THEME = {
  '--bg-page': '#f7f8f8',
  '--bg-panel': '#ffffff',
  '--bg-surface': '#f3f4f5',
  '--bg-elevated': '#e6e6e6',
  '--text-primary': '#17181a',
  '--text-secondary': '#424650',
  '--text-tertiary': '#6b7080',
  '--text-quaternary': '#9aa0ad',
  '--accent': '#5e6ad2',
  '--accent-hover': '#7170ff',
  '--accent-light': '#828fff',
  '--success': '#16a34a',
  '--success-emerald': '#10b981',
  '--error': '#dc2626',
  '--warning': '#d97706',
  '--border-subtle': 'rgba(0, 0, 0, 0.06)',
  '--border-default': 'rgba(0, 0, 0, 0.1)',
  '--border-strong': 'rgba(0, 0, 0, 0.15)',
}

// Dark theme CSS variables (Linear-style)
const DARK_THEME = {
  '--bg-page': '#08090a',
  '--bg-panel': '#0f1011',
  '--bg-surface': '#191a1b',
  '--bg-elevated': '#28282c',
  '--text-primary': '#f7f8f8',
  '--text-secondary': '#d0d6e0',
  '--text-tertiary': '#8a8f98',
  '--text-quaternary': '#62666d',
  '--accent': '#5e6ad2',
  '--accent-hover': '#7170ff',
  '--accent-light': '#828fff',
  '--success': '#27a644',
  '--success-emerald': '#10b981',
  '--error': '#ef4444',
  '--warning': '#f59e0b',
  '--border-subtle': 'rgba(255, 255, 255, 0.05)',
  '--border-default': 'rgba(255, 255, 255, 0.08)',
  '--border-strong': 'rgba(255, 255, 255, 0.12)',
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
