'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

// Subscription function for theme changes
function subscribeToTheme(callback: () => void) {
  // Listen to theme changes through next-themes
  const handleStorageChange = () => callback()
  
  // Listen for storage changes (theme switching)
  window.addEventListener('storage', handleStorageChange)
  
  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleStorageChange)
  
  return () => {
    window.removeEventListener('storage', handleStorageChange)
    mediaQuery.removeEventListener('change', handleStorageChange)
  }
}

// Client-side theme snapshot
function getThemeSnapshot(): boolean {
  if (typeof window === 'undefined') return true // SSR fallback
  
  // Check localStorage first
  const stored = localStorage.getItem('theme')
  if (stored === 'dark') return true
  if (stored === 'light') return false
  
  // Fall back to system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Server-side theme snapshot (SSR)
function getServerSnapshot(): boolean {
  return true // Default to dark mode for SSR consistency
}

/**
 * Isomorphic theme hook that eliminates hydration mismatches
 * Uses useSyncExternalStore for proper SSR/CSR theme handling
 */
export function useIsomorphicTheme() {
  const { resolvedTheme, theme } = useTheme()
  
  // Use useSyncExternalStore for proper hydration handling
  const isDarkMode = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerSnapshot
  )
  
  // Return both the sync external store result and next-themes data
  return {
    isDarkMode,
    resolvedTheme,
    theme,
    // For gradual migration - use isDarkMode instead of manual checks
    mounted: true // Always mounted with useSyncExternalStore
  }
}

/**
 * Simple hook for components that only need dark mode boolean
 * Eliminates the need for useState/useEffect patterns
 */
export function useIsDarkMode(): boolean {
  return useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerSnapshot
  )
}
