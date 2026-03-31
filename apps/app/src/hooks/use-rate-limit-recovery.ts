import { useCallback, useRef, useState } from 'react'
import { toast } from '@v1/ui/use-toast'
import { useQueryClient } from '@tanstack/react-query'

interface RateLimitState {
  isRateLimited: boolean
  retryAfter: number | null
  lastRateLimitTime: number | null
}

interface UseRateLimitRecoveryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
}

export function useRateLimitRecovery(options: UseRateLimitRecoveryOptions = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000
  } = options

  const queryClient = useQueryClient()
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    isRateLimited: false,
    retryAfter: null,
    lastRateLimitTime: null
  })
  
  const activeTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set())

  // Clear all active timeouts on unmount
  const clearAllTimeouts = useCallback(() => {
    activeTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
    activeTimeoutsRef.current.clear()
  }, [])

  // Enhanced fetch with rate limit detection and recovery
  const fetchWithRecovery = useCallback(async (
    url: string,
    options: RequestInit = {},
    retryAttempt = 0
  ): Promise<Response> => {
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || AbortSignal.timeout(30000) // 30s timeout
      })

      // Rate limit detected
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const delay = retryAfter 
          ? Number.parseInt(retryAfter) * 1000 
          : Math.min(initialDelay * 2 ** retryAttempt, maxDelay)

        console.warn(`🚨 Rate limit hit for ${url}. Retrying in ${delay}ms (attempt ${retryAttempt + 1}/${maxRetries})`)

        // Update rate limit state
        setRateLimitState({
          isRateLimited: true,
          retryAfter: delay,
          lastRateLimitTime: Date.now()
        })

        // Show user-friendly toast only on first rate limit
        if (retryAttempt === 0) {
          toast({
            title: "Rate limit reached",
            description: `Retrying in ${Math.ceil(delay / 1000)} seconds...`,
            variant: "default",
          })
        }

        if (retryAttempt < maxRetries) {
          // Wait and retry
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(async () => {
              activeTimeoutsRef.current.delete(timeout)
              try {
                const result = await fetchWithRecovery(url, options, retryAttempt + 1)
                resolve(result)
              } catch (error) {
                reject(error)
              }
            }, delay)
            
            activeTimeoutsRef.current.add(timeout)
          })
        }
          // Max retries exceeded - clear rate limit state and throw
          setRateLimitState({
            isRateLimited: false,
            retryAfter: null,
            lastRateLimitTime: Date.now()
          })
          throw new Error(`Rate limit exceeded after ${maxRetries} attempts`)
      }

      // Success - clear rate limit state
      if (rateLimitState.isRateLimited) {
        setRateLimitState({
          isRateLimited: false,
          retryAfter: null,
          lastRateLimitTime: null
        })
        
        toast({
          title: "Connection restored",
          description: "Data fetching has resumed normally",
          variant: "default",
        })
      }

      return response
    } catch (error) {
      // Handle network errors, timeouts, etc.
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout - please try again')
        }
        if (error.message.includes('Failed to fetch')) {
          throw new Error('Network error - please check your connection')
        }
      }
      throw error
    }
  }, [initialDelay, maxDelay, maxRetries, rateLimitState.isRateLimited])

  // Force retry all failed queries
  const forceRetryQueries = useCallback(() => {
    console.log('🔄 Force retrying all failed queries...')
    
    // Invalidate and refetch all queries
    queryClient.invalidateQueries()
    
    // Clear rate limit state
    setRateLimitState({
      isRateLimited: false,
      retryAfter: null,
      lastRateLimitTime: null
    })
    
    toast({
      title: "Retrying...",
      description: "Attempting to reload all data",
      variant: "default",
    })
  }, [queryClient])

  // Reset rate limit state
  const resetRateLimitState = useCallback(() => {
    clearAllTimeouts()
    setRateLimitState({
      isRateLimited: false,
      retryAfter: null,
      lastRateLimitTime: null
    })
  }, [clearAllTimeouts])

  return {
    rateLimitState,
    fetchWithRecovery,
    forceRetryQueries,
    resetRateLimitState,
    clearAllTimeouts
  }
} 