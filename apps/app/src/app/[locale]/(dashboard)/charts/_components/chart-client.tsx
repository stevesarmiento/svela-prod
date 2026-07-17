'use client'

import { Suspense, useTransition, useDeferredValue, memo, Component, type ErrorInfo } from 'react'
import { MultiPriceChartLightweight } from "./multi-line-lightweight"
import { ChartTable } from "./chart-table"
import { useOptimizedChartsData } from '@/hooks/use-optimized-charts-data'
import type { CoinMarketData } from '@/types/coins'
import { WatchlistsGrid } from "../../watchlist/_components/watchlists-grid"
import { WatchlistTable } from "../../watchlist/_components/watchlist-table"
import { WatchlistChartsEmptyState } from "./watchlist-charts-empty-state"
import { ComparisonGridSkeleton } from "../../comparison/_components/comparison-skeleton"

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
      <div className="w-full">
        <WatchlistChartsEmptyState groupName={selectedGroup?.name} groupColor={selectedGroup?.color} />
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Comparison-style layout: chart left (2/5, sticky), table right (3/5); stacks chart-first below lg */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-1">
        <div className="lg:col-span-6 min-w-0">
          {/* React 19: Show loading state during transitions */}
          <div className={`lg:sticky lg:top-4 ${isPending ? 'opacity-60 transition-opacity duration-200' : ''}`}>
            <MultiPriceChartLightweight
              coins={deferredCoins as OptimisticCoinMarketData[]}
              activeTimeScale={deferredTimeScale}
              setActiveTimeScale={handleTimeScaleChange}
              isPending={isPending}
              layout="horizontal"
            />
          </div>
        </div>

        <div className="lg:col-span-6 min-w-0">
          <ChartTable
            coins={deferredCoins}
            activeTimeScale={deferredTimeScale}
            isPending={isPending}
          />
        </div>
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
        <div className="space-y-6 w-full px-4">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Something went wrong</h3>
              <p className="text-muted-foreground mb-4">
                An error occurred while loading the charts. Please try refreshing the page.
              </p>
              <button
                type="button"
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
      <div className="space-y-6 w-full">
        {this.props.children}
      </div>
    );
  }
}

// Comparison view component for /chart page
interface ComparisonChartsContentProps {
  inset?: boolean;
  /** Controlled time scale (e.g. selector rendered in the page header). Falls back to internal state. */
  activeTimeScale?: string;
  onTimeScaleChange?: (scale: string) => void;
}

const ComparisonChartsContent = memo(function ComparisonChartsContent({
  inset = true,
  activeTimeScale: controlledTimeScale,
  onTimeScaleChange,
}: ComparisonChartsContentProps) {
  const {
    activeTimeScale: internalTimeScale,
    setActiveTimeScale,
    isInitialized,
  } = useOptimizedChartsData({ initialTimeScale: "7d" })

  const isControlled = controlledTimeScale !== undefined
  const activeTimeScale = controlledTimeScale ?? internalTimeScale

  if (process.env.NODE_ENV !== 'production' && isControlled && !onTimeScaleChange) {
    console.warn(
      'ComparisonChartsContent: `activeTimeScale` was provided without `onTimeScaleChange`; time scale changes will be ignored.',
    )
  }

  const [isPending, startTransition] = useTransition()

  const deferredTimeScale = useDeferredValue(activeTimeScale)

  const handleTimeScaleChange = (scale: string) => {
    startTransition(() => {
      if (isControlled) {
        onTimeScaleChange?.(scale)
      } else {
        setActiveTimeScale(scale)
      }
    })
  }

  if (!isInitialized) {
    return <ComparisonGridSkeleton inset={inset} />
  }

  return (
    <div className={`w-full ${inset ? 'px-4' : ''}`}>
      {/* Comparison chart left (1/4), table right (3/4); stacks chart-first below lg */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-6 min-w-0">
          <div className="lg:sticky lg:top-4">
            <WatchlistsGrid
              viewMode="chart"
              chartLayout="vertical"
              activeTimeScale={deferredTimeScale}
              onTimeScaleChange={handleTimeScaleChange}
              onViewModeChange={() => {}} // No-op for now
              showChartTimeScaleSelector={!isControlled}
            />
          </div>
        </div>

        <div className="lg:col-span-6 min-w-0">
          <WatchlistTable activeTimeScale={deferredTimeScale} />
        </div>
      </div>
    </div>
  )
})

export const ChartsClient = memo(function ChartsClient() {
  return (
    <ChartErrorBoundary>
      <Suspense fallback={<ComparisonGridSkeleton inset={false} />}>
        <ChartsContent />
      </Suspense>
    </ChartErrorBoundary>
  )
})

interface ComparisonChartsClientProps {
  inset?: boolean;
  /** Controlled time scale (e.g. selector rendered in the page header). */
  activeTimeScale?: string;
  onTimeScaleChange?: (scale: string) => void;
}

export const ComparisonChartsClient = memo(function ComparisonChartsClient({
  inset = true,
  activeTimeScale,
  onTimeScaleChange,
}: ComparisonChartsClientProps) {
  return (
    <ChartErrorBoundary>
      <Suspense fallback={<ComparisonGridSkeleton inset={inset} />}>
        <ComparisonChartsContent
          inset={inset}
          activeTimeScale={activeTimeScale}
          onTimeScaleChange={onTimeScaleChange}
        />
      </Suspense>
    </ChartErrorBoundary>
  )
})