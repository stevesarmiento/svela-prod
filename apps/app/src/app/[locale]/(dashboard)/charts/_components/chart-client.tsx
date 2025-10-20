'use client'

import { Suspense, useTransition, useDeferredValue, memo, Component, ErrorInfo } from 'react'
import { MultiPriceChartLightweight } from "./multi-line-lightweight"
import { ChartTable } from "./chart-table"
import { useOptimizedChartsData } from '@/hooks/use-optimized-charts-data'
import { Spinner } from "@v1/ui/spinner"
import type { CoinMarketData } from '@/types/coins'
import { WatchlistsGrid } from "../../watchlist/_components/watchlists-grid"
import { WatchlistTable } from "../../watchlist/_components/watchlist-table"

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

// React 19: Memoized content component with concurrent features
const ChartsContent = memo(function ChartsContent() {
  const {
    optimisticCoins,
    activeTimeScale,
    setActiveTimeScale,
    isInitialized,
    hasWatchlistItems,
    selectedGroup,
  } = useOptimizedChartsData()

  // React 19: Use transition for time scale changes
  const [isPending, startTransition] = useTransition()

  // React 19: Defer expensive coin data for better responsiveness
  const deferredCoins = useDeferredValue(optimisticCoins)
  const deferredTimeScale = useDeferredValue(activeTimeScale)

  // Enhanced time scale setter with transition
  const handleTimeScaleChange = (scale: string) => {
    startTransition(() => {
      setActiveTimeScale(scale)
    })
  }

  if (isInitialized && !hasWatchlistItems) {
    return (
      <div className="space-y-6 w-full z-0 p-8">
        {/* Selected Group Header */}
        {selectedGroup && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Charts: {selectedGroup.name}</h2>
              {selectedGroup.description && (
                <p className="text-sm text-muted-foreground">{selectedGroup.description}</p>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              0 coins
            </div>
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-lg font-medium mb-2">
              {selectedGroup ? `No coins in ${selectedGroup.name}` : 'No coins in watchlist'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {selectedGroup
                ? `Add some coins to ${selectedGroup.name} to see charts`
                : 'Add some coins to your watchlist to see charts'
              }
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full z-0 p-8">
      <div className="space-y-14">
        {/* React 19: Show loading state during transitions */}
        <div className={isPending ? 'opacity-60 transition-opacity duration-200' : ''}>
          <MultiPriceChartLightweight
            coins={deferredCoins as OptimisticCoinMarketData[]}
            activeTimeScale={deferredTimeScale}
            setActiveTimeScale={handleTimeScaleChange}
            isPending={isPending}
          />
        </div>

        <ChartTable
          coins={deferredCoins}
          activeTimeScale={deferredTimeScale}
          isPending={isPending}
        />
      </div>
    </div>
  )
})

// TypeScript interfaces for error boundary
interface ChartErrorBoundaryProps {
  children: React.ReactNode;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
}

// React error boundary class component
class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ChartErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ChartErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-6 w-full z-08">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Something went wrong</h3>
              <p className="text-muted-foreground mb-4">
                An error occurred while loading the charts. Please try refreshing the page.
              </p>
              <button 
                onClick={() => this.setState({ hasError: false })}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 w-full z-0">
        {this.props.children}
      </div>
    );
  }
}

// React 19: Optimized suspense fallback
const ChartSkeleton = memo(function ChartSkeleton() {
  return (
    <div className="space-y-6 w-full z-0 p-8">
      <div className="space-y-14">
        <div className="grid grid-cols-12 gap-0 rounded-[13px] bg-zinc-950/50 border border-zinc-800/20 overflow-hidden p-1">
          <div className="flex flex-col col-span-3 p-6 pt-2 space-y-2" />
          <div className="col-span-9 border border-zinc-800/30 rounded-[13px] overflow-hidden">
            <div className="h-[400px] flex items-center justify-center">
              <Spinner size={24} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

// Comparison view component for /chart page
const ComparisonChartsContent = memo(function ComparisonChartsContent() {
  const {
    activeTimeScale,
    setActiveTimeScale,
    isInitialized,
  } = useOptimizedChartsData()

  const [isPending, startTransition] = useTransition()

  const deferredTimeScale = useDeferredValue(activeTimeScale)

  const handleTimeScaleChange = (scale: string) => {
    startTransition(() => {
      setActiveTimeScale(scale)
    })
  }

  if (!isInitialized) {
    return (
      <div className="space-y-6 w-full z-0 p-8">
        <div className="space-y-14">
          <div className="grid grid-cols-12 gap-0 rounded-[13px] bg-zinc-950/50 border border-zinc-800/20 overflow-hidden p-1">
            <div className="flex flex-col col-span-3 p-6 pt-2 space-y-2" />
            <div className="col-span-9 border border-zinc-800/30 rounded-[13px] overflow-hidden">
              <div className="h-[400px] flex items-center justify-center">
                <Spinner size={24} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full z-0 p-8">
      <div className="space-y-4">
        {/* Comparison of all watchlists */}
        <WatchlistsGrid
          onSelectWatchlist={(group) => {
            // Handle watchlist selection - could update selected group
            console.log('Selected watchlist:', group)
          }}
          viewMode="chart"
          activeTimeScale={deferredTimeScale}
          onTimeScaleChange={handleTimeScaleChange}
          onViewModeChange={() => {}} // No-op for now
        />
        <WatchlistTable activeTimeScale={deferredTimeScale} />
      </div>
    </div>
  )
})

export const ChartsClient = memo(function ChartsClient() {
  return (
    <ChartErrorBoundary>
      <Suspense fallback={<ChartSkeleton />}>
        <ChartsContent />
      </Suspense>
    </ChartErrorBoundary>
  )
})

export const ComparisonChartsClient = memo(function ComparisonChartsClient() {
  return (
    <ChartErrorBoundary>
      <Suspense fallback={<ChartSkeleton />}>
        <ComparisonChartsContent />
      </Suspense>
    </ChartErrorBoundary>
  )
})