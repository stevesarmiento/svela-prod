'use client'

import { useCallback, useState } from "react"
import type { SortingState } from "@tanstack/react-table"

import { Spinner } from "@v1/ui/spinner"
import { IconSafariFill } from "symbols-react"

import { WatchlistFilters } from "../../watchlist/_components/watchlist-filters"
import { WatchlistEmptyState } from "../../watchlist/_components/watchlist-empty-states"
import { WatchlistTableSection } from "../../watchlist/_components/watchlist-table-section"
import { useWatchlistData } from "@/hooks/use-watchlist-data"
import { useWatchlistSelection } from "@/hooks/use-watchlist-selection"
import { useCoinGeckoQuotesBulk } from "@/hooks/use-coingecko-quotes"
import {
  useAllWatchlistCoinIds,
  useRemoveBulkFromAllWatchlists,
  useRemoveFromAllWatchlists,
} from "@/lib/convex-hooks"

const SCREENER_REFRESH_INTERVAL_MS = 60 * 60 * 1000

export function ScreenerPageView() {
  const [sorting, setSorting] = useState<SortingState>([])

  const allCoinIds = useAllWatchlistCoinIds()
  const isCoinIdsLoading = allCoinIds === undefined
  const coinIds = allCoinIds ?? []
  const quotesQuery = useCoinGeckoQuotesBulk(coinIds)
  const lastUpdatedAtMs = quotesQuery.dataUpdatedAt ? quotesQuery.dataUpdatedAt : null

  const {
    filters,
    setFilters,
    filteredCoins,
    isInitialCoinsLoading,
    error,
    handleClearAllFilters,
  } = useWatchlistData({ watchlist: coinIds })

  const removeFromAllWatchlists = useRemoveFromAllWatchlists()
  const removeBulkFromAllWatchlists = useRemoveBulkFromAllWatchlists()

  const noopRemove = useCallback(async () => {}, [])

  const {
    selectedCoins,
    removingCoins,
    handleRemove,
    handleCoinSelect,
    handleSelectAll,
    handleRemoveSelected,
    hasSelectedCoins,
  } = useWatchlistSelection({
    removalScope: "everywhere",
    selectedGroup: null,
    removeFromSelectedGroup: noopRemove,
    removeFromWatchlist: noopRemove,
    removeBulkFromSelectedGroup: noopRemove,
    removeBulkFromWatchlist: noopRemove,
    removeFromAllWatchlists,
    removeBulkFromAllWatchlists,
  })

  if (error) {
    // Keep consistent with existing UI: don't hard-crash the page for a transient quotes error.
    // The table/empty state below is still safe to render.
    console.error("Screener quotes error:", error)
  }

  return (
    <div className="space-y-6 px-8 w-full">
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex-1 min-w-0">
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
            autoRefreshStatus={{
              lastUpdatedAtMs,
              refreshIntervalMs: SCREENER_REFRESH_INTERVAL_MS,
              isRefreshing: quotesQuery.isFetching,
            }}
            onSearchTextChange={(value) => setFilters(prev => ({ ...prev, searchText: value }))}
            onPriceRangeChange={(range) => setFilters(prev => ({ ...prev, priceRange: range }))}
            onMarketCapRangeChange={(range) => setFilters(prev => ({ ...prev, marketCapRange: range }))}
            onVolumeRangeChange={(range) => setFilters(prev => ({ ...prev, volumeRange: range }))}
            onChangeFilterChange={(value) => setFilters(prev => ({ ...prev, changeFilter: value }))}
            onSortByChange={(value) => setFilters(prev => ({ ...prev, sortBy: value }))}
            onSortOrderChange={(value) => setFilters(prev => ({ ...prev, sortOrder: value }))}
            onClearAllFilters={handleClearAllFilters}
            onSelectAll={(checked) => handleSelectAll(checked, filteredCoins.map((coin) => coin.id.toString()))}
            onRemoveSelected={handleRemoveSelected}
            isRemoving={removingCoins.size > 0}
            align="left"
          />
        </div>
      </div>

      <div className="space-y-4">
        {isCoinIdsLoading || isInitialCoinsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : coinIds.length === 0 ? (
          <WatchlistEmptyState type="no-coins" />
        ) : filteredCoins.length === 0 ? (
          <WatchlistEmptyState type="no-filtered-coins" onClearFilters={handleClearAllFilters} />
        ) : (
          <WatchlistTableSection
            coins={filteredCoins}
            sorting={sorting}
            onSortingChange={setSorting}
            selectedCoins={selectedCoins}
            watchlistGroup={null}
            removingCoins={removingCoins}
            hasSelectedCoins={hasSelectedCoins}
            onRemove={handleRemove}
            onCoinSelect={handleCoinSelect}
            onSelectAll={handleSelectAll}
          />
        )}
      </div>
    </div>
  )
}

