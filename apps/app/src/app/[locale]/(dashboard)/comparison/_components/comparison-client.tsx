"use client";

import { ComparisonIcon } from "@/components/navigation/comparison-icon";
import {
  CompressWatchlistsIcon,
  ExpandWatchlistsIcon,
} from "@/components/watchlist-icons";
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { WatchlistMultiLineTimeScaleSelector } from "../../watchlist/_components/watchlist-multi-line-time-scale-selector";
import { WatchlistQuickActions } from "../../watchlist/_components/watchlist-quick-actions";
import { WatchlistsPageBootstrapClientProvider } from "../../watchlist/_components/watchlists-page-bootstrap-context";
import { ComparisonGridSkeleton } from "./comparison-skeleton";

const LazyComparisonChartsClient = dynamic(
  () =>
    import("../../charts/_components/chart-client").then(
      (module) => module.ComparisonChartsClient,
    ),
  {
    ssr: false,
    loading: () => <ComparisonGridSkeleton />,
  },
);

/**
 * Watchlist comparison: aggregate view across ALL watchlists — comparison chart
 * plus the accordion table with per-watchlist trends and coins.
 */
export function ComparisonClient() {
  const [activeTimeScale, setActiveTimeScale] = useState("7d");

  // Expand/collapse-all for the accordion table. The table owns the real
  // per-row state (it defaults to all-expanded) and reports the aggregate
  // back so the toggle stays accurate after manual row toggles.
  const [allExpanded, setAllExpanded] = useState(true);
  const [expandAllCommand, setExpandAllCommand] = useState<{
    expand: boolean;
    nonce: number;
  } | null>(null);

  const toggleAllExpanded = useCallback(() => {
    setExpandAllCommand((prev) => ({
      expand: !allExpanded,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, [allExpanded]);

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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAllExpanded}
                aria-label={
                  allExpanded
                    ? "Collapse all watchlists"
                    : "Expand all watchlists"
                }
                className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10"
              >
                {allExpanded ? (
                  <CompressWatchlistsIcon className="size-4.5 text-muted-foreground group-hover:text-primary" />
                ) : (
                  <ExpandWatchlistsIcon className="size-4.5 text-muted-foreground group-hover:text-primary" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="p-1 px-2 rounded-md text-xs"
            >
              {allExpanded
                ? "Collapse all watchlists"
                : "Expand all watchlists"}
            </TooltipContent>
          </Tooltip>
          <WatchlistQuickActions withShortcuts />
        </div>
      </div>
      <WatchlistsPageBootstrapClientProvider
        fallback={<ComparisonGridSkeleton />}
      >
        <LazyComparisonChartsClient
          inset={false}
          activeTimeScale={activeTimeScale}
          onTimeScaleChange={setActiveTimeScale}
          expandAllCommand={expandAllCommand}
          onAllExpandedChange={setAllExpanded}
        />
      </WatchlistsPageBootstrapClientProvider>
    </div>
  );
}
