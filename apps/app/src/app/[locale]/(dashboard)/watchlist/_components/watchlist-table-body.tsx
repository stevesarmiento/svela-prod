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
    <div className="rounded-[10px] bg-primary/5 overflow-hidden p-0.5">
      {/* Header - adjust grid to account for merged columns */}
      <WatchlistTableHeader table={table} />

      {/* Table Body */}
      <div 
        className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden cv-auto"
      >
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
