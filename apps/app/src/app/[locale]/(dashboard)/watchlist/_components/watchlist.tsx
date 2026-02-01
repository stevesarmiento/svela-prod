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
import type React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from "next/navigation"
import { Spinner } from "@v1/ui/spinner"
import { WatchlistsGrid } from "./watchlists-grid"
import { ChartsClient } from "../../charts/_components/chart-client"
import { matchesShortcut, GLOBAL_SHORTCUTS } from "@/lib/keyboard-shortcuts"
import { useWatchlistData } from "@/hooks/use-watchlist-data"
import { useWatchlistSelection } from "@/hooks/use-watchlist-selection"
import type { CoinMarketData } from "@/types/coins"
import { Button } from "@v1/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@v1/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@v1/ui/tooltip'
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@v1/ui/popover'
import { IconCircleDottedAndCircle, IconRectangleGrid2x2Fill, IconRectangleGrid1x2Fill, IconEllipsis, IconWidgetSmallBadgePlus, IconBookmarkFill } from 'symbols-react'
import { CreateWatchlist } from './create-watchlist'
import { Kbd } from "@v1/ui/kbd"
import { useLatest } from "@/hooks/use-latest"
import { useReducedMotion } from "motion/react"

interface WatchlistProps {
  activeTimeScale?: string;
  onTimeScaleChange?: (scale: string) => void;
  gridViewMode?: 'grid' | 'chart';
  onGridViewModeChange?: (mode: 'grid' | 'chart') => void;
  contentMode?: 'cards' | 'table';
  onContentModeChange?: (mode: 'cards' | 'table') => void;
  onInlineChartError?: () => void;
}

interface WatchlistTableSectionProps {
  coins: Array<CoinMarketData>;
  sorting: SortingState;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  selectedCoins: Set<string>;
  watchlistGroup: string | null;
  hoveredRowId: string | null;
  removingCoins: Set<string>;
  hasSelectedCoins: boolean;
  onRemove: (coinId: number | string) => Promise<void>;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  onSelectAll: (checked: boolean, coinIds?: string[]) => void;
  onSetHover: (rowId: string | null) => void;
  onInlineChartError?: () => void;
}

function WatchlistTableSection({
  coins,
  sorting,
  onSortingChange,
  selectedCoins,
  watchlistGroup,
  hoveredRowId,
  removingCoins,
  hasSelectedCoins,
  onRemove,
  onCoinSelect,
  onSelectAll,
  onSetHover,
  onInlineChartError,
}: WatchlistTableSectionProps) {
  const shouldReduceMotion = useReducedMotion()

  // Stable wrapper to keep column defs focused and avoid re-creating work in parent.
  const handleSelectAllWrapper = useCallback((checked: boolean) => {
    const coinIds = checked ? coins.map(coin => coin.id.toString()) : [];
    onSelectAll(checked, coinIds);
  }, [coins, onSelectAll]);

  const columns = useMemo(() => createWatchlistColumns({
    handleRemove: onRemove,
    selectedCoins,
    onCoinSelect,
    onSelectAll: handleSelectAllWrapper,
    totalCoins: coins.length,
    removingCoins,
    hoveredRowId,
    hasSelectedCoins,
    shouldReduceMotion: shouldReduceMotion ?? false,
    onInlineChartError,
  }), [onRemove, selectedCoins, onCoinSelect, handleSelectAllWrapper, coins.length, removingCoins, hoveredRowId, hasSelectedCoins, shouldReduceMotion, onInlineChartError]);

  const table = useReactTable({
    data: coins,
    columns,
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
      hoveredRowId={hoveredRowId}
      onCoinSelect={onCoinSelect}
      onSetHover={onSetHover}
    />
  )
}

export function Watchlist({
  activeTimeScale = '7d',
  onTimeScaleChange,
  gridViewMode = 'grid',
  onGridViewModeChange,
  contentMode = 'cards',
  onContentModeChange,
  onInlineChartError,
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

  const contentModeRef = useLatest(contentMode)
  const onGridViewModeChangeRef = useLatest(onGridViewModeChange)
  const onContentModeChangeRef = useLatest(onContentModeChange)

  // Keyboard shortcuts handler (stable subscription, latest state via refs)
  useEffect(() => {
    const addTokenShortcut = GLOBAL_SHORTCUTS.find(s => s.handler === 'focusAddToken')

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (addTokenShortcut && matchesShortcut(event, addTokenShortcut)) {
        event.preventDefault()
        coinSearchRef.current?.open()
        return;
      }

      if (event.key === '[' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        onContentModeChangeRef.current?.('cards')
        return;
      }

      // "]" key for Table mode  
      if (event.key === ']' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        onContentModeChangeRef.current?.('table')
        return;
      }

      // Watchlist mode shortcuts (only work in cards mode)
      if (contentModeRef.current === 'cards') {
        // "w" key for Watchlist mode
        if (event.key.toLowerCase() === 'w' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          onGridViewModeChangeRef.current?.('grid')
          return;
        }

        // "e" key for Comparison mode  
        if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          onGridViewModeChangeRef.current?.('chart')
          return;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSelectAllWrapper = useCallback((checked: boolean) => {
    const coinIds = checked ? filteredCoins.map(coin => coin.id.toString()) : [];
    handleSelectAll(checked, coinIds);
  }, [filteredCoins, handleSelectAll]);

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
        {/* Unified Header */}
        <div className="flex items-center justify-between py-1">
          {/* Left side - Tabs in cards mode, Filters in table mode */}
          {contentMode === 'cards' ? (
            <div className="flex items-center gap-4">          
              <Tabs value={gridViewMode} onValueChange={(value) => {
                const newMode = value as 'grid' | 'chart'
                onGridViewModeChange?.(newMode)
              }}>
                <Tooltip>
                <TooltipTrigger asChild>
                <TabsList className="grid w-full grid-cols-2 p-0.5">
                  <TabsTrigger value="grid" className="flex items-center gap-2 p-0.5 px-2" title="Switch to Watchlists (W)">
                    <IconBookmarkFill className="size-3.5 fill-muted-foreground" />
                    Watchlists
                  </TabsTrigger>
                  <TabsTrigger value="chart" className="flex items-center gap-2 p-0.5 px-2" title="Switch to Comparison (C)">
                    <IconCircleDottedAndCircle className="size-4 fill-muted-foreground" />
                    Comparison
                  </TabsTrigger>
                </TabsList>
                </TooltipTrigger>
                <TooltipContent side="right" align="center" className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs">
                  <span>Switch between Watchlists and Comparison</span>
                  <Kbd>W</Kbd>
                  <span>or</span>
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
        
        {/* Right side - Action buttons and shortcuts */}
      <div className="flex items-center justify-between gap-4 flex-1 py-1">
          <div className="flex items-center gap-2" />
          {/* Action buttons - right side */}
          <div className="flex items-center gap-2">
            {/* Content Mode Toggle */}
            {gridViewMode !== 'chart' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onContentModeChange?.(contentMode === 'cards' ? 'table' : 'cards')}
                    className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/80"
                  >
                    {contentMode === 'cards' ? (
                      <IconRectangleGrid2x2Fill className="h-4 w-4 fill-muted-foreground group-hover:fill-primary" />
                    ) : (
                      <IconRectangleGrid1x2Fill className="h-4 w-4 fill-muted-foreground group-hover:fill-primary" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" align="center" className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs">
                  <span>Switch between Grid and List</span>
                    <Kbd>[</Kbd>
                    <span>/</span>
                    <Kbd>]</Kbd>
                </TooltipContent>
              </Tooltip>
            )}
            {/* Actions Menu */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10"
                >
                  <IconEllipsis className="size-3.5 fill-muted-foreground rotate-90" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-1 rounded-xl bg-white dark:bg-zinc-900" align="end" side="bottom">
                <div className="space-y-1">
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={() => {
                       setIsCreatingWatchlist(true)
                     }}
                     className="w-full justify-start gap-2 rounded-md"
                   >
                     <IconWidgetSmallBadgePlus className="h-3.5 w-3.5 fill-muted-foreground" />
                     <span>Create Watchlist</span>
                     <div className="ml-auto flex items-center gap-1">
                       <Kbd className="text-xs">Shift</Kbd>
                       <Kbd className="text-xs">N</Kbd>
                     </div>
                   </Button>
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={() => {
                       coinSearchRef.current?.open()
                     }}
                     className="w-full justify-start gap-2 rounded-md"
                   >
                     <IconBookmarkFill className="h-3.5 w-3.5 fill-muted-foreground" />
                     <span>Add Token</span>
                     <div className="ml-auto flex items-center gap-1">
                       <Kbd className="text-xs">Shift</Kbd>
                       <Kbd className="text-xs">A</Kbd>
                     </div>
                   </Button>
                </div>
              </PopoverContent>
            </Popover>
          
          </div>
        </div>
      </div>

      {/* Main Content */}
      {contentMode === 'cards' ? (
        /* Cards Mode - Use Tabs */
        <Tabs value={gridViewMode}>
          <TabsContent value="grid" className="mt-0">
            <WatchlistsGrid 
              onSelectWatchlist={(group) => {
                selectWatchlistGroup(group)
                onGridViewModeChange?.('chart')
              }}
              viewMode="grid"
              activeTimeScale={activeTimeScale}
              onTimeScaleChange={onTimeScaleChange}
              onViewModeChange={onGridViewModeChange}
            />
          </TabsContent>

          <TabsContent value="chart" className="mt-0">
            {/* Comparison Mode - Shows individual coin charts for selected watchlist */}
            <ChartsClient />
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
            <WatchlistTableSection
              coins={filteredCoins}
              sorting={sorting}
              onSortingChange={setSorting}
              selectedCoins={selectedCoins}
              watchlistGroup={watchlistGroup}
              hoveredRowId={hoveredRowId}
              removingCoins={removingCoins}
              hasSelectedCoins={hasSelectedCoins}
              onRemove={handleRemove}
              onCoinSelect={handleCoinSelect}
              onSelectAll={handleSelectAll}
              onSetHover={setHoveredRowId}
              onInlineChartError={onInlineChartError}
            />
          )}
        </div>
      )}

        {/* Create Watchlist Modal */}
        <CreateWatchlist 
          isOpen={isCreatingWatchlist} 
          onClose={() => setIsCreatingWatchlist(false)} 
        />

        {/* Hidden CoinSearch for ref access */}
        <div className="sr-only">
          <CoinSearch ref={coinSearchRef} />
        </div>
    </div>
  )
}