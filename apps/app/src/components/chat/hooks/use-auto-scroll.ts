'use client'

import { useRef, useCallback, useEffect } from 'react'

interface UseAutoScrollOptions {
  dependencies?: readonly unknown[]
  enabled?: boolean
  smooth?: boolean
}

/**
 * Optimized auto-scroll hook that eliminates setInterval anti-pattern
 * Uses requestAnimationFrame for better performance and smoother scrolling
 * Following React best practices from the useEffect guidelines
 */
export function useAutoScroll(options: UseAutoScrollOptions = {}) {
  const { dependencies = [], enabled = true, smooth = true } = options
  const scrollElementRef = useRef<HTMLElement>(null)
  const rafIdRef = useRef<number | undefined>(undefined)

  const scrollToBottom = useCallback(() => {
    if (!scrollElementRef.current || !enabled) return

    const element = scrollElementRef.current
    const scrollHeight = element.scrollHeight
    const scrollTop = element.scrollTop
    const clientHeight = element.clientHeight
    
    // Only scroll if not already at bottom (with small threshold for performance)
    if (scrollHeight - scrollTop - clientHeight > 5) {
      element.scrollTo({
        top: scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      })
    }
  }, [enabled, smooth])

  const scheduleScroll = useCallback(() => {
    // Cancel any pending animation frame to prevent stacking
    if (rafIdRef.current !== undefined) {
      cancelAnimationFrame(rafIdRef.current)
    }
    
    // Use RAF for 60fps smooth performance instead of setInterval
    rafIdRef.current = requestAnimationFrame(() => {
      scrollToBottom()
      rafIdRef.current = undefined
    })
  }, [scrollToBottom])

  // React best practice: Use useEffect for external system (DOM manipulation)
  useEffect(() => {
    if (enabled) {
      scheduleScroll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, enabled])

  // Cleanup RAF on unmount - proper external system cleanup
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== undefined) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  return {
    scrollElementRef,
    scrollToBottom: scheduleScroll,
    manualScroll: scrollToBottom
  }
}
