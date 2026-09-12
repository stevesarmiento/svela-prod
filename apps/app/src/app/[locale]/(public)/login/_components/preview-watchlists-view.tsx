"use client";

import {
  type WatchlistCardCoin,
  WatchlistCardView,
} from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-card";
import { WatchlistHeaderActionButton } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-page-view";
import { WATCHLISTS_GRID_CLASSNAME } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlists-grid";
import {
  AddTokenIcon,
  CreateWatchlistIcon,
  WatchlistsIcon,
} from "@/components/watchlist-icons";
import type { AggregateDataPoint } from "@/hooks/use-coingecko-watchlist-aggregate-chart-isolated";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@v1/ui/breadcrumb";
import { cn } from "@v1/ui/cn";
import type { UTCTimestamp } from "lightweight-charts";
import { useMemo } from "react";
import type { ShowcaseWatchlist } from "../_lib/showcase-types";

const noop = () => {};

/**
 * Mirrors `WatchlistPageView` (header row) + `WatchlistsGrid` (grid) with the
 * real `WatchlistCardView`, fed precomputed series instead of live queries.
 */
export function PreviewWatchlistsView({
  watchlists,
  chartsReady,
}: {
  watchlists: ReadonlyArray<ShowcaseWatchlist>;
  /** Charts are canvas-only; the initial paint keeps the card's placeholder. */
  chartsReady: boolean;
}) {
  const cards = useMemo(
    () =>
      watchlists.map((watchlist) => ({
        ...watchlist,
        aggregateData: watchlist.aggregatePoints.map(
          (point): AggregateDataPoint => ({
            time: point.time as UTCTimestamp,
            value: point.value,
          }),
        ),
        // ShowcaseCoin satisfies the card's stricter coin type structurally.
        cardCoins: watchlist.coins as WatchlistCardCoin[],
      })),
    [watchlists],
  );

  return (
    <div className="w-full px-4">
      <div className="space-y-6 px-4 w-full">
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-4">
            <div className="rounded-md">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="inline-flex items-center gap-2">
                      <WatchlistsIcon className="size-5 text-muted-foreground" />
                      <span>Watchlists</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <WatchlistHeaderActionButton
                ariaLabel="Create Watchlist"
                icon={CreateWatchlistIcon}
                tooltip={{ label: "Create Watchlist", keys: ["Shift", "N"] }}
                onClick={noop}
              />
              <WatchlistHeaderActionButton
                ariaLabel="Add Token"
                icon={AddTokenIcon}
                tooltip={{ label: "Add Token", keys: ["Shift", "A"] }}
                onClick={noop}
              />
            </div>
          </div>
        </div>

        <div className={cn(WATCHLISTS_GRID_CLASSNAME, "relative")}>
          {cards.map((card, index) => (
            <div key={card.group._id}>
              <WatchlistCardView
                name={card.group.name}
                icon={card.group.icon}
                color={card.group.color}
                coins={card.cardCoins}
                aggregateData={card.aggregateData}
                isChartReady={chartsReady && card.aggregateData.length > 0}
                isChartPending={!chartsReady}
                selected={index === 0}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
