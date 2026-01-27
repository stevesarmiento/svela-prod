'use client'

import { useRef, useCallback, useEffect } from 'react'
import type { Table } from '@tanstack/react-table'
import { WatchlistTableHeader } from './watchlist-table-header'
import { WatchlistTableRow } from './watchlist-table-row'
import type { CoinMarketData } from '@/types/coins'

interface WatchlistTableBodyProps {
  table: Table<CoinMarketData>;
  selectedCoins: Set<string>;
  watchlistGroup: string | null;
  hoveredRowId: string | null;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  onSetHover: (rowId: string | null) => void;
}

export function WatchlistTableBody({ 
  table, 
  selectedCoins, 
  watchlistGroup, 
  onCoinSelect, 
  onSetHover 
}: WatchlistTableBodyProps) {
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Add debounced hover clear mechanism to prevent stuck states
  const clearHoverWithDelay = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      onSetHover(null)
    }, 150) // Small delay to prevent flickering but clear stuck states
  }, [onSetHover])

  const setHoverState = useCallback((rowId: string | null) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    onSetHover(rowId)
  }, [onSetHover])

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="rounded-[10px] bg-primary/5 overflow-hidden p-0.5">
      {/* Header - adjust grid to account for merged columns */}
      <WatchlistTableHeader table={table} />

      {/* Table Body */}
      <div 
        className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden cv-auto"
        onMouseLeave={() => clearHoverWithDelay()}
      >
        {table.getRowModel().rows.map(row => (
          <WatchlistTableRow
            key={row.id}
            row={row}
            selectedCoins={selectedCoins}
            watchlistGroup={watchlistGroup}
            onCoinSelect={onCoinSelect}
            onHoverEnter={(rowId) => setHoverState(rowId)}
            onHoverLeave={() => clearHoverWithDelay()}
          />
        ))}
      </div>
    </div>
  );
}
