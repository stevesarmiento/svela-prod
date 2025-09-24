'use client'

import { useWatchlist } from "./watchlist-context"
import { CoinSearch, type CoinSearchRef } from "./coin-search"
import { WatchlistFilters } from "./watchlist-filters"
import { WatchlistEmptyState } from "./watchlist-empty-states"
import { WatchlistTableBody } from "./watchlist-table-body"
import { createWatchlistColumns } from "./watchlist-columns"
import { toast } from "@v1/ui/use-toast"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
} from '@tanstack/react-table'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from "next/navigation"
import { Spinner } from "@v1/ui/spinner"
import { WatchlistsGrid } from "./watchlists-grid"
import { WatchlistTable } from "./watchlist-table"
import { matchesShortcut, GLOBAL_SHORTCUTS } from "@/lib/keyboard-shortcuts"
import { useWatchlistData } from "@/hooks/use-watchlist-data"
import { useWatchlistSelection } from "@/hooks/use-watchlist-selection"

interface WatchlistProps {
  viewMode?: 'comparison' | 'watchlist';
  activeTimeScale?: string;
  onTimeScaleChange?: (scale: string) => void;
  gridViewMode?: 'grid' | 'chart';
  onGridViewModeChange?: (mode: 'grid' | 'chart') => void;
}

export function Watchlist({ 
  viewMode = 'watchlist',
  activeTimeScale = '7d',
  onTimeScaleChange,
  gridViewMode = 'grid',
  onGridViewModeChange
}: WatchlistProps) {
  const { 
    // Legacy for backward compatibility
    watchlist, 
    removeFromWatchlist, 
    removeBulkFromWatchlist, 
    isInitialized,
    // New group functionality
    selectedGroup,
    selectedGroupCoins,
    selectWatchlistGroup,
    removeFromSelectedGroup,
    removeBulkFromSelectedGroup
  } = useWatchlist()
  
  const searchParams = useSearchParams()
  const [sorting, setSorting] = useState<SortingState>([])
  const coinSearchRef = useRef<CoinSearchRef>(null)
  
  // Get current watchlist group parameter to preserve it in navigation (same as chart-table and top-nav)
  const watchlistGroup = searchParams.get('wg')
  
  // Use selected group coins if available, otherwise fall back to legacy watchlist
  const currentWatchlist = selectedGroup ? selectedGroupCoins : watchlist;
  
  // Use extracted data and selection hooks
  const {
    filters,
    setFilters,
    filteredCoins,
    error,
    handleClearAllFilters,
  } = useWatchlistData({ watchlist: currentWatchlist });

  const {
    selectedCoins,
    removingCoins,
    hoveredRowId,
    setHoveredRowId,
    handleRemove,
    handleCoinSelect,
    handleSelectAll,
    handleRemoveSelected,
    hasSelectedCoins,
  } = useWatchlistSelection({
    selectedGroup,
    removeFromSelectedGroup,
    removeFromWatchlist,
    removeBulkFromSelectedGroup,
    removeBulkFromWatchlist,
    filteredCoins,
  });

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Get the add token shortcut
      const addTokenShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'focusAddToken')
      
      if (addTokenShortcut && matchesShortcut(event, addTokenShortcut)) {
        event.preventDefault()
        coinSearchRef.current?.open()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Memoize columns with hover state
  const columns = useMemo(() => createWatchlistColumns({
    handleRemove, 
    selectedCoins, 
    onCoinSelect: handleCoinSelect, 
    onSelectAll: handleSelectAll, 
    totalCoins: filteredCoins.length,
    removingCoins,
    hoveredRowId,
    hasSelectedCoins
  }), [handleRemove, selectedCoins, handleCoinSelect, handleSelectAll, filteredCoins.length, removingCoins, hoveredRowId, hasSelectedCoins]);

  const table = useReactTable({
    data: filteredCoins,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  })

  // Handle errors
  if (error) {
    toast({
      title: "Error",
      description: "Failed to fetch coin data",
      variant: "destructive",
    });
  }

  // Show loading skeleton while initializing or loading data
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4">
      {/* Watchlists Grid - Always show */}
      <WatchlistsGrid 
        onSelectWatchlist={selectWatchlistGroup}
        viewMode={gridViewMode}
        activeTimeScale={activeTimeScale}
        onTimeScaleChange={onTimeScaleChange}
        onViewModeChange={onGridViewModeChange}
      />
      
      {/* Conditional Content Based on View Mode */}
      {viewMode === 'comparison' ? (
        // Comparison mode shows the watchlist table
        <div className="space-y-4">
          <WatchlistTable activeTimeScale={activeTimeScale} />
        </div>
      ) : (
        // Watchlist mode shows individual coins
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex justify-start items-center gap-2">
              <WatchlistFilters
                searchText={filters.searchText}
                priceRange={filters.priceRange}
                marketCapRange={filters.marketCapRange}
                volumeRange={filters.volumeRange}
                changeFilter={filters.changeFilter}
                sortBy={filters.sortBy}
                sortOrder={filters.sortOrder}
                selectedCoins={selectedCoins}
                totalCoins={filteredCoins.length}
                onSearchTextChange={(value) => setFilters(prev => ({ ...prev, searchText: value }))}
                onPriceRangeChange={(range) => setFilters(prev => ({ ...prev, priceRange: range }))}
                onMarketCapRangeChange={(range) => setFilters(prev => ({ ...prev, marketCapRange: range }))}
                onVolumeRangeChange={(range) => setFilters(prev => ({ ...prev, volumeRange: range }))}
                onChangeFilterChange={(value) => setFilters(prev => ({ ...prev, changeFilter: value }))}
                onSortByChange={(value) => setFilters(prev => ({ ...prev, sortBy: value }))}
                onSortOrderChange={(value) => setFilters(prev => ({ ...prev, sortOrder: value }))}
                onClearAllFilters={handleClearAllFilters}
                onSelectAll={handleSelectAll}
                onRemoveSelected={handleRemoveSelected}
                isRemoving={removingCoins.size > 0}
              />
            </div>
            <CoinSearch ref={coinSearchRef} />
          </div>

          {/* Show empty state if no coins after filtering */}
          {!watchlist.length ? (
            <WatchlistEmptyState type="no-coins" />
          ) : filteredCoins.length === 0 ? (
            <WatchlistEmptyState type="no-filtered-coins" onClearFilters={handleClearAllFilters} />
          ) : (
            <WatchlistTableBody
              table={table}
              selectedCoins={selectedCoins}
              watchlistGroup={watchlistGroup}
              hoveredRowId={hoveredRowId}
              onCoinSelect={handleCoinSelect}
              onSetHover={setHoveredRowId}
            />
          )}
        </div>
      )}
    </div>
  )
}