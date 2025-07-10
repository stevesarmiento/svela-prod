"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@v1/ui/button'
import { AlertTriangle, RefreshCw, Clock } from 'lucide-react'
import { toast } from '@v1/ui/use-toast'

interface LoadingStateManagerProps {
  children: React.ReactNode
  timeoutMs?: number
  maxWaitMs?: number
}

interface LoadingState {
  isStuck: boolean
  hasTimedOut: boolean
  stuckSince: number | null
  timeoutCount: number
}

export function LoadingStateManager({ 
  children, 
  timeoutMs = 10000, // 10 seconds 
  maxWaitMs = 30000  // 30 seconds max wait
}: LoadingStateManagerProps) {
  const queryClient = useQueryClient()
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isStuck: false,
    hasTimedOut: false,
    stuckSince: null,
    timeoutCount: 0
  })

  const handleForceRecovery = useCallback(() => {
    console.log('🔧 Forcing loading state recovery...')
    
    // Cancel all queries
    queryClient.cancelQueries()
    
    // Clear query cache
    queryClient.clear()
    
    // Reset loading state
    setLoadingState({
      isStuck: false,
      hasTimedOut: false,
      stuckSince: null,
      timeoutCount: 0
    })
    
    // Invalidate and refetch
    setTimeout(() => {
      queryClient.invalidateQueries()
    }, 1000)
    
    toast({
      title: "Recovery initiated",
      description: "Clearing stuck requests and reloading data",
      variant: "default",
    })
  }, [queryClient])

  const handleRetry = useCallback(() => {
    console.log('🔄 Retrying stuck requests...')
    
    // Cancel existing queries first
    queryClient.cancelQueries()
    
    // Wait a moment then retry
    setTimeout(() => {
      queryClient.refetchQueries()
      
      setLoadingState(prev => ({
        ...prev,
        isStuck: false,
        hasTimedOut: false,
        stuckSince: Date.now() // Reset timer
      }))
    }, 500)
    
    toast({
      title: "Retrying...",
      description: "Attempting to reload stuck requests",
      variant: "default",
    })
  }, [queryClient])

  // Monitor for stuck loading states
  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    let maxTimeoutId: NodeJS.Timeout

    const checkForStuckState = () => {
      const queries = queryClient.getQueriesData({ type: 'active' })
      const hasActiveQueries = queries.length > 0
      
      if (hasActiveQueries) {
        if (!loadingState.stuckSince) {
          setLoadingState(prev => ({
            ...prev,
            stuckSince: Date.now()
          }))
          
          // Set timeout for stuck detection
          timeoutId = setTimeout(() => {
            setLoadingState(prev => ({
              ...prev,
              isStuck: true,
              hasTimedOut: true,
              timeoutCount: prev.timeoutCount + 1
            }))
            
            console.warn('🐌 Loading state appears stuck, offering recovery options')
            
            toast({
              title: "Slow loading detected",
              description: "Some data is taking longer than expected to load",
              variant: "default",
            })
          }, timeoutMs)
          
          // Set maximum wait timeout
          maxTimeoutId = setTimeout(() => {
            console.error('🚨 Maximum wait time exceeded, forcing recovery')
            handleForceRecovery()
          }, maxWaitMs)
        }
      } else {
        // Clear stuck state when no active queries
        if (loadingState.stuckSince) {
          setLoadingState(prev => ({
            ...prev,
            isStuck: false,
            hasTimedOut: false,
            stuckSince: null
          }))
          
          if (timeoutId) clearTimeout(timeoutId)
          if (maxTimeoutId) clearTimeout(maxTimeoutId)
        }
      }
    }

    // Check every 2 seconds
    const interval = setInterval(checkForStuckState, 2000)
    
    // Initial check
    checkForStuckState()

    return () => {
      clearInterval(interval)
      if (timeoutId) clearTimeout(timeoutId)
      if (maxTimeoutId) clearTimeout(maxTimeoutId)
    }
  }, [queryClient, timeoutMs, maxWaitMs, loadingState.stuckSince, handleForceRecovery])

  // Show stuck state overlay when detected
  if (loadingState.isStuck && loadingState.hasTimedOut) {
    const waitTime = loadingState.stuckSince 
      ? Math.floor((Date.now() - loadingState.stuckSince) / 1000)
      : 0

    return (
      <div className="relative">
        {/* Show children with overlay */}
        <div className="opacity-50 pointer-events-none">
          {children}
        </div>
        
        {/* Stuck state overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
          <div className="bg-card border rounded-lg p-6 max-w-md mx-4 shadow-lg">
            <div className="text-center">
              <div className="mx-auto mb-4">
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
              
              <h3 className="text-lg font-semibold mb-2">
                Loading is taking longer than expected
              </h3>
              
              <p className="text-muted-foreground text-sm mb-4">
                Waiting for {waitTime} seconds...
                {loadingState.timeoutCount > 1 && (
                  <span className="block mt-1">
                    Retry attempt: {loadingState.timeoutCount}
                  </span>
                )}
              </p>
              
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={handleRetry}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try again
                </Button>
                
                <Button 
                  onClick={handleForceRecovery}
                  variant="outline"
                  className="w-full"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Force reload
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground mt-3">
                This might be due to network issues or rate limiting
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
} 