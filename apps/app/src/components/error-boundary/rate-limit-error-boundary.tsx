"use client"

import React, { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@v1/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@v1/ui/card'
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { toast } from '@v1/ui/use-toast'
import { Effect } from "effect"
import { useEffectScoped } from "@/lib/effect/react"

interface RateLimitErrorBoundaryProps {
  children: React.ReactNode
  fallbackComponent?: React.ComponentType<{ retry: () => void }>
}

interface RateLimitErrorBoundaryState {
  hasError: boolean
  errorType: 'rate_limit' | 'network' | 'timeout' | 'unknown'
  isRetrying: boolean
  retryCount: number
  lastErrorTime: number
}

class RateLimitErrorBoundaryClass extends React.Component<
  RateLimitErrorBoundaryProps & { onRetry: () => void },
  RateLimitErrorBoundaryState
> {
  private retryTimeout: NodeJS.Timeout | null = null

  constructor(props: RateLimitErrorBoundaryProps & { onRetry: () => void }) {
    super(props)
    this.state = {
      hasError: false,
      errorType: 'unknown',
      isRetrying: false,
      retryCount: 0,
      lastErrorTime: 0
    }
  }

  static getDerivedStateFromError(error: Error): Partial<RateLimitErrorBoundaryState> {
    console.error('🚨 Error boundary caught error:', error)
    
    // Determine error type
    let errorType: RateLimitErrorBoundaryState['errorType'] = 'unknown'
    
    if (error.message.includes('Rate limit') || error.message.includes('RATE_LIMIT_EXCEEDED')) {
      errorType = 'rate_limit'
    } else if (error.message.includes('Network error') || error.message.includes('Failed to fetch')) {
      errorType = 'network'
    } else if (error.message.includes('timeout')) {
      errorType = 'timeout'
    }

    return {
      hasError: true,
      errorType,
      lastErrorTime: Date.now()
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary details:', { error, errorInfo })
    
    // Report to analytics/monitoring service here if needed
    if (typeof window !== 'undefined' && 'analytics' in window) {
      const analytics = (window as { analytics?: { track: (event: string, properties: Record<string, unknown>) => void } }).analytics
      analytics?.track('Error Boundary Triggered', {
        error: error.message,
        errorType: this.state.errorType,
        retryCount: this.state.retryCount,
        stackTrace: errorInfo.componentStack
      })
    }
  }

  handleRetry = () => {
    this.setState({ isRetrying: true })
    
    // Clear any existing timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
    }

    // Progressive delay based on retry count
    const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 30000)
    
    this.retryTimeout = setTimeout(() => {
      this.setState(prevState => ({
        hasError: false,
        isRetrying: false,
        retryCount: prevState.retryCount + 1,
        errorType: 'unknown'
      }))
      
      // Trigger the parent retry function
      this.props.onRetry()
    }, delay)
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallbackComponent) {
        const FallbackComponent = this.props.fallbackComponent
        return <FallbackComponent retry={this.handleRetry} />
      }

      return <DefaultErrorFallback 
        errorType={this.state.errorType}
        isRetrying={this.state.isRetrying}
        retryCount={this.state.retryCount}
        onRetry={this.handleRetry}
      />
    }

    return this.props.children
  }
}

function DefaultErrorFallback({ 
  errorType, 
  isRetrying, 
  retryCount, 
  onRetry 
}: {
  errorType: RateLimitErrorBoundaryState['errorType']
  isRetrying: boolean
  retryCount: number
  onRetry: () => void
}) {
  const [countdown, setCountdown] = useState(0)

  useEffectScoped(
    () =>
      Effect.gen(function* () {
        // Ensure this runs in a scope so it can be interrupted safely.
        yield* Effect.addFinalizer(() => Effect.void)

        if (!isRetrying) {
          yield* Effect.sync(() => setCountdown(0))
          return
        }

        const delayMs = Math.min(1000 * Math.pow(2, retryCount), 30000)
        let remainingSeconds = Math.ceil(delayMs / 1000)

        yield* Effect.sync(() => setCountdown(remainingSeconds))

        while (remainingSeconds > 0) {
          yield* Effect.sleep("1 second")
          remainingSeconds -= 1
          yield* Effect.sync(() => setCountdown(remainingSeconds))
        }
      }),
    [isRetrying, retryCount],
  )

  const getErrorConfig = () => {
    switch (errorType) {
      case 'rate_limit':
        return {
          icon: <AlertTriangle className="h-8 w-8 text-yellow-500" />,
          title: "Rate limit reached",
          description: "Too many requests have been made. Please wait a moment before trying again.",
          color: "yellow"
        }
      case 'network':
        return {
          icon: <WifiOff className="h-8 w-8 text-red-500" />,
          title: "Network error",
          description: "Unable to connect to the server. Please check your internet connection.",
          color: "red"
        }
      case 'timeout':
        return {
          icon: <Wifi className="h-8 w-8 text-orange-500" />,
          title: "Request timeout",
          description: "The request took too long to complete. Please try again.",
          color: "orange"
        }
      default:
        return {
          icon: <AlertTriangle className="h-8 w-8 text-gray-500" />,
          title: "Something went wrong",
          description: "An unexpected error occurred. Please try refreshing the page.",
          color: "gray"
        }
    }
  }

  const config = getErrorConfig()

  return (
    <div className="flex items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {config.icon}
          </div>
          <CardTitle className="text-lg">{config.title}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
          {retryCount > 0 && (
            <p className="text-sm text-muted-foreground">
              Retry attempt: {retryCount}
            </p>
          )}
        </CardHeader>
        <CardContent className="text-center">
          <Button 
            onClick={onRetry}
            disabled={isRetrying}
            className="w-full"
            variant={config.color === 'red' ? 'destructive' : 'default'}
          >
            {isRetrying ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" />
                Retrying {countdown > 0 ? `in ${countdown}s` : '...'}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </>
            )}
          </Button>
          
          {errorType === 'rate_limit' && (
            <p className="text-xs text-muted-foreground mt-4">
              Rate limits help maintain service quality for all users
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function RateLimitErrorBoundary(props: RateLimitErrorBoundaryProps) {
  const queryClient = useQueryClient()

  const handleRetry = () => {
    console.log('🔄 Error boundary triggering retry...')
    
    // Clear all failed queries and retry
    queryClient.clear()
    queryClient.invalidateQueries()
    
    toast({
      title: "Retrying...",
      description: "Attempting to reload all data",
      variant: "default",
    })
  }

  return (
    <RateLimitErrorBoundaryClass {...props} onRetry={handleRetry} />
  )
} 