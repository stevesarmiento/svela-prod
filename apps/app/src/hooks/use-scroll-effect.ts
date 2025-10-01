'use client'

import { useSyncExternalStore, useMemo } from 'react'

// Global scroll state manager
let scrollY: number | undefined = undefined
const listeners = new Set<() => void>()

// Global scroll event handler
let scrollHandler: (() => void) | null = null

// Subscribe function for scroll changes
function subscribeToScroll(callback: () => void) {
  listeners.add(callback)
  
  // Only add listener if this is the first subscription
  if (listeners.size === 1 && !scrollHandler) {
    // Initialize scrollY from current window position on first listener
    if (typeof window !== 'undefined' && scrollY === undefined) {
      scrollY = window.scrollY
    }
    
    scrollHandler = () => {
      const newScrollY = window.scrollY
      if (newScrollY !== scrollY) {
        scrollY = newScrollY
        listeners.forEach(listener => listener())
      }
    }
    window.addEventListener('scroll', scrollHandler, { passive: true })
  }
  
  return () => {
    listeners.delete(callback)
    if (listeners.size === 0) {
      if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler)
        scrollHandler = null
      }
    }
  }
}

// Get current scroll position
function getScrollSnapshot(): number {
  if (typeof window === 'undefined') return 0
  return scrollY !== undefined ? scrollY : window.scrollY
}

// Server-side scroll snapshot
function getServerSnapshot(): number {
  return 0
}

/**
 * Hook that returns current scroll position using useSyncExternalStore
 * Eliminates the need for useState/useEffect scroll handling
 */
export function useScrollY(): number {
  return useSyncExternalStore(
    subscribeToScroll,
    getScrollSnapshot,
    getServerSnapshot
  )
}

/**
 * Hook that returns whether scroll position is above a threshold
 * Common pattern for sticky headers, etc.
 */
export function useScrollThreshold(threshold: number): boolean {
  const scrollY = useScrollY()
  return scrollY > threshold
}

/**
 * Hook for scroll-based effects with custom logic
 */
export function useScrollEffect<T>(
  calculate: (scrollY: number) => T,
  deps?: React.DependencyList
): T {
  const scrollY = useScrollY()
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => calculate(scrollY), [calculate, scrollY, ...(deps || [])])
}
