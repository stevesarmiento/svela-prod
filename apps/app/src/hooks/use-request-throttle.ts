import { useRef, useCallback } from 'react'

interface RequestThrottleOptions {
  delay?: number
  maxConcurrent?: number
  debounceTime?: number
}

interface QueuedRequest {
  id: string
  url: string
  options: RequestInit
  resolve: (response: Response) => void
  reject: (error: Error) => void
  timestamp: number
  retryCount: number
}

export function useRequestThrottle(options: RequestThrottleOptions = {}) {
  const {
    delay = 100, // Minimum delay between requests
    maxConcurrent = 3, // Maximum concurrent requests
    debounceTime = 500 // Debounce rapid successive requests
  } = options

  const activeRequestsRef = useRef<Set<string>>(new Set())
  const requestQueueRef = useRef<QueuedRequest[]>([])
  const lastRequestTimeRef = useRef<number>(0)
  const debounceTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Clear timeouts on unmount
  const clearAllTimeouts = useCallback(() => {
    debounceTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
    debounceTimeoutsRef.current.clear()
  }, [])

  // Process queued requests
  const processQueue = useCallback(async () => {
    const now = Date.now()
    
    // Respect minimum delay between requests
    const timeSinceLastRequest = now - lastRequestTimeRef.current
    if (timeSinceLastRequest < delay) {
      setTimeout(processQueue, delay - timeSinceLastRequest)
      return
    }

    // Check if we can process more requests
    if (activeRequestsRef.current.size >= maxConcurrent || requestQueueRef.current.length === 0) {
      return
    }

    const request = requestQueueRef.current.shift()
    if (!request) return

    // Add to active requests
    activeRequestsRef.current.add(request.id)
    lastRequestTimeRef.current = now

    try {
      console.log(`🚀 Processing throttled request: ${request.url}`)
      const response = await fetch(request.url, request.options)
      request.resolve(response)
    } catch (error) {
      // Retry logic for failed requests
      if (request.retryCount < 2 && error instanceof Error) {
        console.log(`⚠️ Retrying failed request: ${request.url} (attempt ${request.retryCount + 1})`)
        request.retryCount++
        request.timestamp = Date.now()
        requestQueueRef.current.unshift(request) // Add back to front of queue
      } else {
        request.reject(error instanceof Error ? error : new Error('Request failed'))
      }
    } finally {
      // Remove from active requests
      activeRequestsRef.current.delete(request.id)
      
      // Continue processing queue
      if (requestQueueRef.current.length > 0) {
        setTimeout(processQueue, delay)
      }
    }
  }, [delay, maxConcurrent])

  // Throttled fetch function
  const throttledFetch = useCallback((
    url: string, 
    options: RequestInit = {}
  ): Promise<Response> => {
    return new Promise((resolve, reject) => {
      const requestId = `${url}-${Date.now()}-${Math.random()}`
      
      // Check for rapid successive requests to same URL
      const urlKey = url.split('?')[0] || url // Use base URL without query params
      const existingTimeout = debounceTimeoutsRef.current.get(urlKey)
      
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      // Debounce rapid requests to same endpoint
      const timeout = setTimeout(() => {
        debounceTimeoutsRef.current.delete(urlKey)
        
        // Check if there's already an identical request in queue
        const existingRequest = requestQueueRef.current.find(req => 
          req.url === url && JSON.stringify(req.options) === JSON.stringify(options)
        )
        
        if (existingRequest) {
          console.log(`🔄 Deduplicating request: ${url}`)
          // Attach to existing request instead of creating new one
          const originalResolve = existingRequest.resolve
          const originalReject = existingRequest.reject
          
          existingRequest.resolve = (response: Response) => {
            originalResolve(response.clone())
            resolve(response)
          }
          
          existingRequest.reject = (error: Error) => {
            originalReject(error)
            reject(error)
          }
          return
        }

        // Add request to queue
        const queuedRequest: QueuedRequest = {
          id: requestId,
          url,
          options,
          resolve,
          reject,
          timestamp: Date.now(),
          retryCount: 0
        }

        requestQueueRef.current.push(queuedRequest)
        
        // Start processing if not already running
        if (activeRequestsRef.current.size < maxConcurrent) {
          processQueue()
        }
      }, debounceTime)
      
      debounceTimeoutsRef.current.set(urlKey, timeout)
    })
  }, [debounceTime, processQueue, maxConcurrent])

  // Get queue statistics
  const getQueueStats = useCallback(() => {
    return {
      queueLength: requestQueueRef.current.length,
      activeRequests: activeRequestsRef.current.size,
      maxConcurrent,
      delay,
      debounceTime
    }
  }, [maxConcurrent, delay, debounceTime])

  // Clear queue (emergency stop)
  const clearQueue = useCallback(() => {
    requestQueueRef.current.forEach(request => {
      request.reject(new Error('Request cancelled'))
    })
    requestQueueRef.current = []
    clearAllTimeouts()
  }, [clearAllTimeouts])

  return {
    throttledFetch,
    getQueueStats,
    clearQueue,
    clearAllTimeouts
  }
} 