import { useEffect, useState, useCallback } from 'react'

export type ThemeMode = 'dark' | 'light' | 'rainbow'

const THEMES: ThemeMode[] = ['dark', 'light', 'rainbow']
const STORAGE_KEY = 'gco:theme'

const LABELS: Record<ThemeMode, string> = {
  dark: 'Oscuro',
  light: 'Claro',
  rainbow: 'Arcoíris',
}

const ICONS: Record<ThemeMode, string> = {
  dark: '🌙',
  light: '☀️',
  rainbow: '🌈',
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
      return saved && THEMES.includes(saved) ? saved : 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const index = THEMES.indexOf(current)
      return THEMES[(index + 1) % THEMES.length]
    })
  }, [])

  return {
    theme,
    label: LABELS[theme],
    icon: ICONS[theme],
    cycleTheme,
    setTheme: setThemeState,
  }
}