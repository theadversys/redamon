import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { useMediaQuery } from './useMediaQuery'

export type Theme = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'pandaexploit-theme'

function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>(THEME_STORAGE_KEY, 'system')
  const isDarkQuery = useMediaQuery('(prefers-color-scheme: dark)')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const systemTheme = isDarkQuery ? 'dark' : 'light'
  const resolvedTheme = useMemo(() => {
    if (theme === 'system') return systemTheme
    return theme
  }, [theme, systemTheme])

  // Apply theme class to document element
  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    mounted,
    isDark: resolvedTheme === 'dark',
    isLight: resolvedTheme === 'light',
  }
}
