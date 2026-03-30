'use client'

import type { Table } from '@tanstack/react-table'
import { WatchlistTableHeader } from './watchlist-table-header'
import { WatchlistTableRow } from './watchlist-table-row'
import type { CoinMarketData } from '@/types/coins'

interface WatchlistTableBodyProps {
  table: Table<CoinMarketData>;
  selectedCoins: Set<string>;
  watchlistGroup: string | null;
  onCoinSelect: (coinId: string, selected: boolean) => void;
}

export function WatchlistTableBody({ 
  table, 
  selectedCoins, 
  watchlistGroup, 
  onCoinSelect
}: WatchlistTableBodyProps) {
  return (
    <div className="rounded-[10px] bg-primary/5 p-0.5">
      {/* Header: keep the original "on tinted background" styling,
          but inset by 1px so grid tracks match the bordered body. */}
      <div className="mx-px">
        <WatchlistTableHeader table={table} />
      </div>

      {/* Table Body */}
      <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm">
        {table.getRowModel().rows.map(row => (
          <WatchlistTableRow
            key={row.id}
            row={row}
            selectedCoins={selectedCoins}
            watchlistGroup={watchlistGroup}
            onCoinSelect={onCoinSelect}
          />
        ))}
      </div>
    </div>
  );
}
