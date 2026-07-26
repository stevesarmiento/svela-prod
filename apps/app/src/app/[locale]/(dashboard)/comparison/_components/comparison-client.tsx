'use client'

import { useState } from "react"
import dynamic from "next/dynamic"
import { ComparisonIcon } from "@/components/navigation/comparison-icon"
import { WatchlistMultiLineTimeScaleSelector } from "../../watchlist/_components/watchlist-multi-line-time-scale-selector"
import { WatchlistQuickActions } from "../../watchlist/_components/watchlist-quick-actions"
import { WatchlistsPageBootstrapClientProvider } from "../../watchlist/_components/watchlists-page-bootstrap-context"
import { ComparisonGridSkeleton } from "./comparison-skeleton"

const LazyComparisonChartsClient = dynamic(
  () =>
    import("../../charts/_components/chart-client").then(
      (module) => module.ComparisonChartsClient,
    ),
  {
    ssr: false,
    loading: () => <ComparisonGridSkeleton />,
  },
)

/**
 * Watchlist comparison: aggregate view across ALL watchlists — comparison chart
 * plus the accordion table with per-watchlist trends and coins.
 */
export function ComparisonClient() {
  const [activeTimeScale, setActiveTimeScale] = useState("7d")

  return (
    <div className="w-full space-y-6 px-4">
      <div className="flex items-center justify-between py-1 px-4">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ComparisonIcon className="size-5 text-muted-foreground" />
          <span className="text-white text-[16px]">Watchlist Comparison</span>
        </div>
        <div className="flex items-center gap-2">
          <WatchlistMultiLineTimeScaleSelector
            activeTimeScale={activeTimeScale}
            setActiveTimeScale={setActiveTimeScale}
          />
          <WatchlistQuickActions withShortcuts />
        </div>
      </div>
      <WatchlistsPageBootstrapClientProvider fallback={<ComparisonGridSkeleton />}>
        <LazyComparisonChartsClient
          inset={false}
          activeTimeScale={activeTimeScale}
          onTimeScaleChange={setActiveTimeScale}
        />
      </WatchlistsPageBootstrapClientProvider>
    </div>
  )
}
