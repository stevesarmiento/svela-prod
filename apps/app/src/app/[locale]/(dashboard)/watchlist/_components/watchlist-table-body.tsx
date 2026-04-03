'use client'

import type { Table } from '@tanstack/react-table'
import { Spinner } from "@v1/ui/spinner"
import { WatchlistTableHeader } from './watchlist-table-header'
import { WatchlistTableRow } from './watchlist-table-row'
import type { CoinMarketData } from '@/types/coins'
import type { WatchlistTableStatus } from "./watchlist-table-section"

interface WatchlistTableBodyProps {
  table: Table<CoinMarketData>;
  selectedCoins: Set<string>;
  watchlistGroup: string | null;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  mode?: "watchlist" | "screener";
  status?: WatchlistTableStatus | null;
  tokenHeaderCountBadge?: { count: number } | null;
}

export function WatchlistTableBody({ 
  table, 
  selectedCoins, 
  watchlistGroup, 
  onCoinSelect,
  mode = "watchlist",
  status = null,
  tokenHeaderCountBadge = null,
}: WatchlistTableBodyProps) {
  return (
    <div className="rounded-[10px] bg-primary/5 p-0.5">
      {/* Header: keep the original "on tinted background" styling,
          but inset by 1px so grid tracks match the bordered body. */}
      <div className="mx-px">
        <WatchlistTableHeader
          table={table}
          tokenHeaderCountBadge={tokenHeaderCountBadge}
        />
      </div>

      {/* Table Body */}
      <div className="relative bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm">
        {table.getRowModel().rows.map(row => (
          <WatchlistTableRow
            key={row.id}
            row={row}
            selectedCoins={selectedCoins}
            watchlistGroup={watchlistGroup}
            onCoinSelect={onCoinSelect}
            mode={mode}
          />
        ))}

        {status ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/75 dark:bg-black/35 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <Spinner size={16} />
              <span className="text-pretty">{status.text}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
