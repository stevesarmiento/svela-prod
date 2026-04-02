'use client'

import { useCallback, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
} from '@tanstack/react-table'
import { useReducedMotion } from "motion/react"

import type React from 'react'
import type { CoinMarketData } from "@/types/coins"
import { useLatest } from "@/hooks/use-latest"
import { WatchlistTableBody } from "./watchlist-table-body"
import { createWatchlistColumns } from "./watchlist-columns"

export interface WatchlistTableSectionProps {
  coins: Array<CoinMarketData>;
  sorting: SortingState;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  selectedCoins: Set<string>;
  watchlistGroup: string | null;
  removingCoins: Set<string>;
  hasSelectedCoins: boolean;
  onRemove: (coinId: number | string) => Promise<void>;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  onSelectAll: (checked: boolean, coinIds?: string[]) => void;
  onInlineChartError?: () => void;
  mode?: "watchlist" | "screener";
}

export function WatchlistTableSection({
  coins,
  sorting,
  onSortingChange,
  selectedCoins,
  watchlistGroup,
  removingCoins,
  hasSelectedCoins,
  onRemove,
  onCoinSelect,
  onSelectAll,
  onInlineChartError,
  mode = "watchlist",
}: WatchlistTableSectionProps) {
  const shouldReduceMotion = useReducedMotion()
  const selectedCoinsRef = useLatest(selectedCoins)
  const removingCoinsRef = useLatest(removingCoins)
  const hasSelectedCoinsRef = useLatest(hasSelectedCoins)

  const handleSelectAllWrapper = useCallback((checked: boolean) => {
    const coinIds = checked ? coins.map(coin => coin.id.toString()) : [];
    onSelectAll(checked, coinIds);
  }, [coins, onSelectAll]);

  const columns = useMemo(() => createWatchlistColumns({
    handleRemove: onRemove,
    selectedCoinsRef,
    onCoinSelect,
    onSelectAll: handleSelectAllWrapper,
    totalCoins: coins.length,
    removingCoinsRef,
    hasSelectedCoinsRef,
    shouldReduceMotion: shouldReduceMotion ?? false,
    onInlineChartError,
    mode,
  }), [onRemove, onCoinSelect, handleSelectAllWrapper, coins.length, shouldReduceMotion, onInlineChartError, mode]);

  const table = useReactTable({
    data: coins,
    columns,
    getRowId: (row) => row.id.toString(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange,
    state: { sorting },
  })

  return (
    <WatchlistTableBody
      table={table}
      selectedCoins={selectedCoins}
      watchlistGroup={watchlistGroup}
      onCoinSelect={onCoinSelect}
      mode={mode}
    />
  )
}

