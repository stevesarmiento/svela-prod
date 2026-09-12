"use client";

import { ScreenerAutoRefreshIndicator } from "@/app/[locale]/(dashboard)/screener/_components/screener-auto-refresh-indicator";
import { createScreenerColumns } from "@/app/[locale]/(dashboard)/screener/_components/screener-columns";
import {
  AddFilterChipTrigger,
  ChipShell,
} from "@/app/[locale]/(dashboard)/screener/_components/screener-filter-chips";
import { SmartSearchButton } from "@/app/[locale]/(dashboard)/screener/_components/screener-filters-bar";
import { ScreenerTableBody } from "@/app/[locale]/(dashboard)/screener/_components/screener-table-body";
import type { ScreenerTableMeta } from "@/app/[locale]/(dashboard)/screener/_components/screener-table-types";
import type { CoinMarketData } from "@/types/coins";
import {
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Kbd } from "@v1/ui/kbd";
import { useMemo, useState } from "react";
import type { SeriesPoint, ShowcaseCoin } from "../_lib/showcase-types";

const EMPTY_SELECTION = new Set<string>();
const noop = () => {};

/**
 * Mirrors `ScreenerPageView`: filters bar + refresh indicator + the real
 * TanStack table (`createScreenerColumns` → `ScreenerTableBody`) over static
 * rows. Trail cells render the provided series instead of fetching.
 */
export function PreviewScreenerView({
  coins,
  trailById,
  generatedAtMs,
}: {
  coins: ReadonlyArray<ShowcaseCoin>;
  trailById: Record<string, SeriesPoint[]>;
  generatedAtMs: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "dailyPerformance", desc: true },
  ]);

  const columns = useMemo(
    () =>
      createScreenerColumns({
        getStaticTrail: (coin) => trailById[coin.id],
      }),
    [trailById],
  );
  const data = useMemo(() => coins as CoinMarketData[], [coins]);
  const meta = useMemo<ScreenerTableMeta>(
    () => ({ tokenHeaderCountBadge: { count: coins.length } }),
    [coins.length],
  );

  const table = useReactTable({
    data,
    columns,
    meta,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="w-full space-y-2 px-3 sm:px-4 lg:px-8">
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center w-full">
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                <SmartSearchButton hasActiveFilters onClick={noop} />
                <div className="flex flex-wrap gap-2 min-w-0 items-center">
                  <ChipShell
                    label="Screener"
                    value="top gainers, liquid"
                    onRemove={noop}
                  />
                  <ChipShell label="Volume" value="> $100M" onRemove={noop} />
                  <AddFilterChipTrigger onClick={noop} />
                </div>
                <span className="text-[10px] uppercase text-muted-foreground ml-1">
                  press <Kbd className="font-bold w-8">esc</Kbd> to clear
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ScreenerAutoRefreshIndicator
            status={{ lastUpdatedAtMs: generatedAtMs, isRefreshing: false }}
          />
        </div>
      </div>

      <div className="space-y-4">
        <ScreenerTableBody
          table={table}
          selectedCoins={EMPTY_SELECTION}
          hasSelectedCoins={false}
          onCoinSelect={noop}
        />
      </div>
    </div>
  );
}
