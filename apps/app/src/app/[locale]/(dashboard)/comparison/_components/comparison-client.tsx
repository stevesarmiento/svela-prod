'use client'

import { useState } from "react"
import dynamic from "next/dynamic"
import { IconBinocularsFill } from "symbols-react"
import { WatchlistMultiLineTimeScaleSelector } from "../../watchlist/_components/watchlist-multi-line-time-scale-selector"
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
 * Sector comparison: aggregate view across ALL watchlists — comparison chart
 * plus the accordion table with per-watchlist trends and coins.
 */
export function ComparisonClient() {
  const [activeTimeScale, setActiveTimeScale] = useState("7d")

  return (
    <div className="w-full space-y-6 px-4">
      <div className="flex items-center justify-between py-1 px-4">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <IconBinocularsFill className="size-4.5 fill-muted-foreground" />
          <span className="text-white text-[16px]">Sector Comparison</span>
        </div>
        <WatchlistMultiLineTimeScaleSelector
          activeTimeScale={activeTimeScale}
          setActiveTimeScale={setActiveTimeScale}
        />
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
