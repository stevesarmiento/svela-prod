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
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from "next/navigation"
import { Spinner } from "@v1/ui/spinner"
import { WatchlistsGrid } from "./watchlists-grid"
import { WatchlistTable } from "./watchlist-table"
import { matchesShortcut, GLOBAL_SHORTCUTS } from "@/lib/keyboard-shortcuts"
import { useWatchlistData } from "@/hooks/use-watchlist-data"
import { useWatchlistSelection } from "@/hooks/use-watchlist-selection"
import { Button } from "@v1/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@v1/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@v1/ui/tooltip'
import { IconStarFill, IconCircleDottedAndCircle, IconRectangleGrid2x2Fill, IconRectangleGrid1x2Fill } from 'symbols-react'
import { CreateWatchlist, CreateWatchlistTrigger } from './create-watchlist'
import { Kbd } from "@v1/ui/kbd"

interface WatchlistProps {
  activeTimeScale?: string;
  onTimeScaleChange?: (scale: string) => void;
  gridViewMode?: 'grid' | 'chart';
  onGridViewModeChange?: (mode: 'grid' | 'chart') => void;
  contentMode?: 'cards' | 'table';
  onContentModeChange?: (mode: 'cards' | 'table') => void;
}

export function Watchlist({ 
  activeTimeScale = '7d',
  onTimeScaleChange,
  gridViewMode = 'grid',
  onGridViewModeChange,
  contentMode = 'cards',
  onContentModeChange
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
    removeBulkFromSelectedGroup,
    watchlistGroups
  } = useWatchlist()
  
  const searchParams = useSearchParams()
  const [sorting, setSorting] = useState<SortingState>([])
  const [isCreatingWatchlist, setIsCreatingWatchlist] = useState(false)
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
  });

  // Keyboard shortcuts handler - Memoize the handler to avoid recreating the event listener
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Get the add token shortcut
      const addTokenShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'focusAddToken')
      
      if (addTokenShortcut && matchesShortcut(event, addTokenShortcut)) {
        event.preventDefault()
        coinSearchRef.current?.open()
      return;
    }

    if (event.key === '[' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      onContentModeChange?.('cards')
      return;
    }

    // "]" key for Table mode  
    if (event.key === ']' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      onContentModeChange?.('table')
      return;
    }

    // Watchlist mode shortcuts (only work in cards mode)
    if (contentMode === 'cards') {
      // "w" key for Watchlist mode
      if (event.key.toLowerCase() === 'w' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        onGridViewModeChange?.('grid')
        return;
      }

      // "c" key for Comparison mode  
      if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        onGridViewModeChange?.('chart')
        return;
      }
    }
  }, [contentMode, onGridViewModeChange, onContentModeChange])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Create a stable handleSelectAll wrapper to avoid column recreations
  const handleSelectAllWrapper = useCallback((checked: boolean) => {
    const coinIds = checked ? filteredCoins.map(coin => coin.id.toString()) : [];
    handleSelectAll(checked, coinIds);
  }, [filteredCoins, handleSelectAll]);

  // Calculate counter for toggle button
  const toggleCounter = useMemo(() => {
    if (contentMode === 'table') {
      // Show number of available watchlists
      return watchlistGroups.length;
    } else {
      // Show number of tokens in selected watchlist
      return filteredCoins.length;
    }
  }, [contentMode, watchlistGroups.length, filteredCoins.length]);

  // Memoize columns with hover state - Split dependencies to reduce recalculations
  const columns = useMemo(() => createWatchlistColumns({
    handleRemove, 
    selectedCoins, 
    onCoinSelect: handleCoinSelect, 
    onSelectAll: handleSelectAllWrapper, 
    totalCoins: filteredCoins.length,
    removingCoins,
    hoveredRowId,
    hasSelectedCoins
  }), [handleRemove, selectedCoins, handleCoinSelect, handleSelectAllWrapper, filteredCoins.length, removingCoins, hoveredRowId, hasSelectedCoins]);

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
    <TooltipProvider>
    <div className="space-y-6 px-4">
        {/* Unified Header */}
        <div className="flex items-center justify-between">
          {/* Left side - Tabs in cards mode, Filters in table mode */}
          {contentMode === 'cards' ? (
            <div className="flex items-center gap-4">          
              <Tabs value={gridViewMode} onValueChange={(value) => {
                const newMode = value as 'grid' | 'chart'
                onGridViewModeChange?.(newMode)
              }}>
                <Tooltip>
                <TooltipTrigger asChild>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="grid" className="flex items-center gap-2" title="Switch to Watchlists (W)">
                    <IconStarFill className="h-4 w-4 fill-muted-foreground" />
                    Watchlists
                  </TabsTrigger>
                  <TabsTrigger value="chart" className="flex items-center gap-2" title="Switch to Comparison (C)">
                    <IconCircleDottedAndCircle className="h-4 w-4 fill-muted-foreground" />
                    Comparison
                  </TabsTrigger>
                </TabsList>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="flex items-center gap-2 p-1 pl-2 rounded-md">
                  <span>Switch between Watchlists and Comparison</span>
                  <Kbd>W</Kbd>
                  <span>+</span>
                  <Kbd>E</Kbd>
                </TooltipContent>
              </Tooltip>
              </Tabs>
        </div>
      ) : (
          /* Table mode - Show filters on the left */
          <div className="flex items-center gap-2">
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
            onSelectAll={handleSelectAllWrapper}
            onRemoveSelected={handleRemoveSelected}
            isRemoving={removingCoins.size > 0}
          />
          </div>
        )}
        
        {/* Right side - Action buttons */}
        <div className="flex items-center gap-2">
          {/* Show create watchlist only in cards mode */}
          {contentMode === 'cards' && gridViewMode === 'grid' && (
            <CreateWatchlistTrigger onClick={() => setIsCreatingWatchlist(true)} />
          )}
          
          {/* Add token (CoinSearch) - show only in table mode */}
          {contentMode === 'table' && (
          <CoinSearch ref={coinSearchRef} />
          )}
          
          {/* Content Mode Toggle - Always show when not in comparison mode, icon only, rightmost */}
          {gridViewMode !== 'chart' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onContentModeChange?.(contentMode === 'cards' ? 'table' : 'cards')}
                  className="h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/80 hover:ring-1 hover:ring-primary/5 relative"
                >
                  {contentMode === 'cards' ? (
                    <IconRectangleGrid2x2Fill className="h-4 w-4 fill-muted-foreground" />
                  ) : (
                    <IconRectangleGrid1x2Fill className="h-4 w-4 fill-muted-foreground" />
                  )}
                  {/* Counter Badge */}
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center leading-none font-mono">
                    {toggleCounter}
                  </span>
                </Button>
                </TooltipTrigger>
              <TooltipContent side="bottom" align="end" className="flex items-center gap-2 p-1 pl-2 rounded-md">
                <span>Switch between Grid and List</span>
                  <Kbd>[</Kbd>
                  <span>+</span>
                  <Kbd>]</Kbd>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Main Content */}
      {contentMode === 'cards' ? (
        /* Cards Mode - Use Tabs */
        <Tabs value={gridViewMode}>
          <TabsContent value="grid" className="mt-0">
            <WatchlistsGrid 
              onSelectWatchlist={selectWatchlistGroup}
              viewMode="grid"
              activeTimeScale={activeTimeScale}
              onTimeScaleChange={onTimeScaleChange}
              onViewModeChange={onGridViewModeChange}
            />
          </TabsContent>

          <TabsContent value="chart" className="mt-0">
            {/* Comparison Mode */}
            <div className="space-y-4">
              <WatchlistsGrid 
                onSelectWatchlist={selectWatchlistGroup}
                viewMode="chart"
                activeTimeScale={activeTimeScale}
                onTimeScaleChange={onTimeScaleChange}
                onViewModeChange={onGridViewModeChange}
              />
              <WatchlistTable activeTimeScale={activeTimeScale} />
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        /* Table Mode - Direct render without tabs, filters now in header */
        <div className="space-y-4">
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

        {/* Create Watchlist Modal */}
        <CreateWatchlist 
          isOpen={isCreatingWatchlist} 
          onClose={() => setIsCreatingWatchlist(false)} 
        />
    </div>
    </TooltipProvider>
  )
}