'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SortingState } from "@tanstack/react-table"

import { Spinner } from "@v1/ui/spinner"
import { toast } from "sonner"

import { WatchlistAutoRefreshIndicator } from "../../watchlist/_components/watchlist-auto-refresh-indicator"
import { WatchlistFilters } from "../../watchlist/_components/watchlist-filters"
import { WatchlistEmptyState } from "../../watchlist/_components/watchlist-empty-states"
import { WatchlistTableSection, type WatchlistTableStatus } from "../../watchlist/_components/watchlist-table-section"
import type { FilterState } from "@/hooks/use-watchlist-data"
import { useHybridCoinSearch } from "@/hooks/use-hybrid-coin-search"
import { useScreenerTopMarkets } from "@/hooks/use-screener-top-markets"
import { useSmartScreenerTakerMetrics } from "@/hooks/use-smart-screener-taker-metrics"
import type { SmartScreenerScreenResponse } from "@/lib/smart-screener/screen-api"
import type { CoinMarketData } from "@/types/coins"

const SCREENER_REFRESH_INTERVAL_MS = 60 * 60 * 1000
const SCREENER_DEFAULT_LIMIT = 250
/** Match initial / cleared `FilterState` slider maxima so we only treat ranges as “active” when narrowed. */
const SCREENER_DEFAULT_PRICE_MAX = 1_000_000
const SCREENER_DEFAULT_MC_MAX = 10_000_000_000_000
const SCREENER_DEFAULT_VOL_MAX = 1_000_000_000_000

export function ScreenerPageView() {
  const [sorting, setSorting] = useState<SortingState>([])
  const [smartScreenerStatus, setSmartScreenerStatus] = useState<WatchlistTableStatus | null>(null)
  const [screenResult, setScreenResult] = useState<SmartScreenerScreenResponse | null>(null)

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
    takerFilter: null,
  })

  const appliedSearch = filters.searchText.trim()
  const globalSearchText = screenResult ? "" : appliedSearch
  const globalSearchQuery = useHybridCoinSearch(globalSearchText, { limit: 50 })

  const searchCoins = useMemo((): CoinMarketData[] => {
    if (!globalSearchText) return []
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
  }, [globalSearchQuery.data, globalSearchText])

  const screenCoins = useMemo((): CoinMarketData[] => {
    const rows = screenResult?.rows ?? []
    return rows.map((row) => ({
      id: row.coingeckoId,
      name: row.name,
      symbol: row.symbol,
      slug: row.coingeckoId,
      image: row.image,
      sparkline7d: undefined,
      cmc_rank: row.marketCapRank ?? 0,
      circulating_supply: 0,
      max_supply: null,
      quote: {
        USD: {
          price: row.currentPrice ?? 0,
          volume_24h: row.totalVolume ?? 0,
          market_cap: row.marketCap ?? 0,
          percent_change_24h: row.priceChangePercentage24h ?? 0,
          percent_change_1h: undefined,
          percent_change_7d: undefined,
          percent_change_30d: undefined,
          percent_change_60d: undefined,
          percent_change_90d: undefined,
        },
      },
      fundingRate: null,
    }))
  }, [screenResult])

  const coins = screenResult ? screenCoins : globalSearchText ? searchCoins : topCoins

  const takerSymbols = useMemo(() => {
    if (!filters.takerFilter) return []
    return coins.map((c) => c.symbol).filter(Boolean)
  }, [coins, filters.takerFilter])

  const takerMetricsQuery = useSmartScreenerTakerMetrics({
    symbols: takerSymbols,
    range: filters.takerFilter?.range ?? "24h",
    exchange: filters.takerFilter?.exchange ?? null,
    enabled: Boolean(filters.takerFilter),
  })

  const tableStatus = useMemo((): WatchlistTableStatus | null => {
    if (smartScreenerStatus) return smartScreenerStatus
    if (filters.takerFilter && takerMetricsQuery.isLoading) {
      return { kind: "loadingDerivatives", text: "Loading taker data…" }
    }
    return null
  }, [filters.takerFilter, smartScreenerStatus, takerMetricsQuery.isLoading])

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

      if (filters.takerFilter && !takerMetricsQuery.isLoading) {
        const symbolKey = coin.symbol.toUpperCase()
        const metrics = takerMetricsQuery.bySymbol[symbolKey] ?? null
        if (!metrics) return false

        if (filters.takerFilter.requireBuyGreaterThanSell) {
          if (!(metrics.buyVolumeUsd > metrics.sellVolumeUsd)) return false
        }
        if (filters.takerFilter.minBuyRatio != null) {
          if (!(metrics.buyRatio >= filters.takerFilter.minBuyRatio)) return false
        }
        if (filters.takerFilter.minBuyVolumeUsd != null) {
          if (!(metrics.buyVolumeUsd >= filters.takerFilter.minBuyVolumeUsd)) return false
        }
        if (filters.takerFilter.minTotalVolumeUsd != null) {
          if (!(metrics.totalVolumeUsd >= filters.takerFilter.minTotalVolumeUsd)) return false
        }
        if (filters.takerFilter.minNetBuyUsd != null) {
          const netBuy = metrics.buyVolumeUsd - metrics.sellVolumeUsd
          if (!(netBuy >= filters.takerFilter.minNetBuyUsd)) return false
        }
      }

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
  }, [coins, filters, takerMetricsQuery.bySymbol])

  const hasActiveScreenerFilters = useMemo(() => {
    if (screenResult != null) return true
    if (globalSearchText.length > 0) return true
    if (filters.searchText.trim().length > 0) return true
    if (filters.changeFilter !== "all") return true
    if (filters.takerFilter != null) return true
    const [p0, p1] = filters.priceRange
    if (p0 > 0 || p1 < SCREENER_DEFAULT_PRICE_MAX) return true
    const [m0, m1] = filters.marketCapRange
    if (m0 > 0 || m1 < SCREENER_DEFAULT_MC_MAX) return true
    const [v0, v1] = filters.volumeRange
    if (v0 > 0 || v1 < SCREENER_DEFAULT_VOL_MAX) return true
    return false
  }, [screenResult, globalSearchText, filters])

  const tokenHeaderCountBadge = useMemo(() => {
    if (!hasActiveScreenerFilters) return null
    return { count: filteredCoins.length }
  }, [hasActiveScreenerFilters, filteredCoins.length])

  const emptyToastKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!filters.takerFilter) {
      emptyToastKeyRef.current = null
      return
    }

    if (takerMetricsQuery.isLoading) return
    if (topMarketsQuery.isLoading) return
    if (appliedSearch && globalSearchQuery.isLoading) return
    if (coins.length === 0) return
    if (filteredCoins.length > 0) return

    const key = JSON.stringify({
      taker: filters.takerFilter,
      missing: takerMetricsQuery.counts.missing,
      total: takerMetricsQuery.counts.total,
    })
    if (emptyToastKeyRef.current === key) return
    emptyToastKeyRef.current = key

    const total = takerMetricsQuery.counts.total
    const missing = takerMetricsQuery.counts.missing

    if (total > 0 && missing / total >= 0.5) {
      toast.message("Taker data is warming up", {
        description: "Some tokens don’t have taker data yet. Try again in a moment.",
      })
      return
    }

    toast.error("No matches", {
      description: "Try lowering thresholds (e.g. net buy > $1m) or switching timeframe.",
    })
  }, [
    appliedSearch,
    coins.length,
    filteredCoins.length,
    filters.takerFilter,
    globalSearchQuery.isLoading,
    takerMetricsQuery.counts.missing,
    takerMetricsQuery.counts.total,
    takerMetricsQuery.isLoading,
    topMarketsQuery.isLoading,
  ])

  const handleClearAllFilters = useCallback(() => {
    setScreenResult(null)
    setFilters({
      searchText: "",
      priceRange: [0, 1000000],
      marketCapRange: [0, 10000000000000],
      volumeRange: [0, 1000000000000],
      changeFilter: "all",
      sortBy: "marketCap",
      sortOrder: "desc",
      watchlistGroupId: null,
      takerFilter: null,
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
  if (takerMetricsQuery.error) {
    console.error("Screener taker metrics error:", takerMetricsQuery.error)
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
            takerFilter={filters.takerFilter}
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
            onTakerFilterChange={(value) => setFilters((prev) => ({ ...prev, takerFilter: value }))}
            onClearAllFilters={handleClearAllFilters}
            onSelectAll={noopFiltersSelectAll}
            onRemoveSelected={noopRemoveSelected}
            isRemoving={false}
            align="left"
            onSmartScreenerStatusChange={setSmartScreenerStatus}
            smartScreenerSummary={screenResult?.summary ?? null}
            onSmartScreenerScreenResultChange={setScreenResult}
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
        {!screenResult &&
        (topMarketsQuery.isLoading ||
          (globalSearchText ? globalSearchQuery.isLoading : false)) ? (
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
            status={tableStatus}
            tokenHeaderCountBadge={tokenHeaderCountBadge}
          />
        )}
      </div>
    </div>
  )
}

