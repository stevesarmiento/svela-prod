'use client'

import { useCallback, useMemo, useState } from "react"
import type { SortingState } from "@tanstack/react-table"

import { Spinner } from "@v1/ui/spinner"

import { WatchlistAutoRefreshIndicator } from "../../watchlist/_components/watchlist-auto-refresh-indicator"
import { WatchlistFilters } from "../../watchlist/_components/watchlist-filters"
import { WatchlistEmptyState } from "../../watchlist/_components/watchlist-empty-states"
import { WatchlistTableSection } from "../../watchlist/_components/watchlist-table-section"
import type { FilterState } from "@/hooks/use-watchlist-data"
import { useHybridCoinSearch } from "@/hooks/use-hybrid-coin-search"
import { useScreenerTopMarkets } from "@/hooks/use-screener-top-markets"
import type { CoinMarketData } from "@/types/coins"

const SCREENER_REFRESH_INTERVAL_MS = 60 * 60 * 1000
const SCREENER_DEFAULT_LIMIT = 250

export function ScreenerPageView() {
  const [sorting, setSorting] = useState<SortingState>([])

  const topMarketsQuery = useScreenerTopMarkets(SCREENER_DEFAULT_LIMIT)
  const topCoins = topMarketsQuery.data

  const [filters, setFilters] = useState<FilterState>({
    searchText: "",
    priceRange: [0, 1000000],
    marketCapRange: [0, 10000000000000],
    volumeRange: [0, 1000000000000],
    changeFilter: "all",
    sortBy: "marketCap",
    sortOrder: "desc",
    watchlistGroupId: null,
  })

  const appliedSearch = filters.searchText.trim()
  const globalSearchQuery = useHybridCoinSearch(appliedSearch, { limit: 50 })

  const searchCoins = useMemo((): CoinMarketData[] => {
    if (!appliedSearch) return []
    return (globalSearchQuery.data ?? []).map((coin) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      slug: coin.id,
      image: coin.image,
      sparkline7d: undefined,
      cmc_rank: coin.cmc_rank,
      circulating_supply: 0,
      max_supply: null,
      quote: coin.quote,
      fundingRate: null,
    }))
  }, [appliedSearch, globalSearchQuery.data])

  const coins = appliedSearch ? searchCoins : topCoins

  const filteredCoins = useMemo(() => {
    if (!coins.length) return []

    const searchLower = filters.searchText ? filters.searchText.toLowerCase() : null

    const filtered = coins.filter((coin) => {
      const usd = coin.quote.USD
      const price = usd.price
      const marketCap = usd.market_cap
      const volume24h = usd.volume_24h
      const change24h = usd.percent_change_24h

      if (searchLower) {
        if (
          !coin.name.toLowerCase().includes(searchLower) &&
          !coin.symbol.toLowerCase().includes(searchLower)
        ) {
          return false
        }
      }

      if (price < filters.priceRange[0] || price > filters.priceRange[1]) return false
      if (marketCap < filters.marketCapRange[0] || marketCap > filters.marketCapRange[1]) return false
      if (volume24h < filters.volumeRange[0] || volume24h > filters.volumeRange[1]) return false

      if (filters.changeFilter === "positive" && change24h <= 0) return false
      if (filters.changeFilter === "negative" && change24h >= 0) return false

      return true
    })

    filtered.sort((a, b) => {
      const aUsd = a.quote.USD
      const bUsd = b.quote.USD
      let aValue: number | string
      let bValue: number | string

      switch (filters.sortBy) {
        case "price":
          aValue = aUsd.price
          bValue = bUsd.price
          break
        case "change":
          aValue = aUsd.percent_change_24h
          bValue = bUsd.percent_change_24h
          break
        case "marketCap":
          aValue = aUsd.market_cap
          bValue = bUsd.market_cap
          break
        case "volume":
          aValue = aUsd.volume_24h
          bValue = bUsd.volume_24h
          break
        default:
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
      }

      if (filters.sortOrder === "desc") return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    })

    return filtered
  }, [coins, filters])

  const handleClearAllFilters = useCallback(() => {
    setFilters({
      searchText: "",
      priceRange: [0, 1000000],
      marketCapRange: [0, 10000000000000],
      volumeRange: [0, 1000000000000],
      changeFilter: "all",
      sortBy: "marketCap",
      sortOrder: "desc",
      watchlistGroupId: null,
    })
  }, [])

  const selectedCoins = useMemo(() => new Set<string>(), [])
  const removingCoins = useMemo(() => new Set<string>(), [])
  const noopRemove = useCallback(async (_coinId: number | string) => {}, [])
  const noopRemoveSelected = useCallback(async () => {}, [])
  const noopCoinSelect = useCallback((_coinId: string, _selected: boolean) => {}, [])
  const noopFiltersSelectAll = useCallback((_checked: boolean) => {}, [])
  const noopTableSelectAll = useCallback((_checked: boolean, _coinIds?: string[]) => {}, [])

  if (topMarketsQuery.error) {
    // Keep consistent with existing UI: don't hard-crash the page for a transient quotes error.
    // The table/empty state below is still safe to render.
    console.error("Screener top markets error:", topMarketsQuery.error)
  }
  if (globalSearchQuery.error) {
    console.error("Screener global search error:", globalSearchQuery.error)
  }

  return (
    <div className="space-y-6 px-8 w-full">
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex-1 min-w-0">
          <WatchlistFilters
            mode="screener"
            searchText={filters.searchText}
            priceRange={filters.priceRange}
            marketCapRange={filters.marketCapRange}
            volumeRange={filters.volumeRange}
            changeFilter={filters.changeFilter}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            watchlistGroupId={filters.watchlistGroupId}
            watchlistGroupOptions={[]}
            selectedCoins={selectedCoins}
            totalCoins={filteredCoins.length}
            onSearchTextChange={(value) => setFilters((prev) => ({ ...prev, searchText: value }))}
            onPriceRangeChange={(range) => setFilters((prev) => ({ ...prev, priceRange: range }))}
            onMarketCapRangeChange={(range) => setFilters((prev) => ({ ...prev, marketCapRange: range }))}
            onVolumeRangeChange={(range) => setFilters((prev) => ({ ...prev, volumeRange: range }))}
            onChangeFilterChange={(value) => setFilters((prev) => ({ ...prev, changeFilter: value }))}
            onSortByChange={(value) => setFilters((prev) => ({ ...prev, sortBy: value }))}
            onSortOrderChange={(value) => setFilters((prev) => ({ ...prev, sortOrder: value }))}
            onWatchlistGroupIdChange={() => setFilters((prev) => ({ ...prev, watchlistGroupId: null }))}
            onClearAllFilters={handleClearAllFilters}
            onSelectAll={noopFiltersSelectAll}
            onRemoveSelected={noopRemoveSelected}
            isRemoving={false}
            align="left"
          />
        </div>
        <WatchlistAutoRefreshIndicator
          status={{
            lastUpdatedAtMs: topMarketsQuery.lastUpdatedAtMs,
            refreshIntervalMs: SCREENER_REFRESH_INTERVAL_MS,
            isRefreshing: topMarketsQuery.isFetching,
          }}
        />
      </div>

      <div className="space-y-4">
        {topMarketsQuery.isLoading || (appliedSearch ? globalSearchQuery.isLoading : false) ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : coins.length === 0 ? (
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
            hasSelectedCoins={false}
            onRemove={noopRemove}
            onCoinSelect={noopCoinSelect}
            onSelectAll={noopTableSelectAll}
            mode="screener"
          />
        )}
      </div>
    </div>
  )
}

