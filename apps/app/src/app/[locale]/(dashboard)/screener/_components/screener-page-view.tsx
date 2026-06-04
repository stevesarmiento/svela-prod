'use client'

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SortingState } from "@tanstack/react-table"
import { useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"

import { Spinner } from "@v1/ui/spinner"
import { Button } from "@v1/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"

import type { FilterState } from "@/hooks/use-watchlist-data"
import { useScreenerTopMarkets } from "@/hooks/use-screener-top-markets"
import { useSmartScreenerTakerMetrics } from "@/hooks/use-smart-screener-taker-metrics"
import type { SmartScreenerScreenResponse } from "@/lib/smart-screener/screen-api"
import type { CoinMarketData } from "@/types/coins"
import { ScreenerFiltersBar } from "./screener-filters-bar"
import type { ScreenerSearchQueryState } from "./screener-search-state-loader"
import type { ScreenerTableStatus } from "./screener-table-types"

const SCREENER_REFRESH_INTERVAL_MS = 60 * 60 * 1000
const SCREENER_DEFAULT_LIMIT = 500
/** Match initial / cleared `FilterState` slider maxima so we only treat ranges as “active” when narrowed. */
const SCREENER_DEFAULT_PRICE_MAX = 1_000_000
const SCREENER_DEFAULT_MC_MAX = 10_000_000_000_000
const SCREENER_DEFAULT_VOL_MAX = 1_000_000_000_000

function notifyMessage(message: string, description: string) {
  void import("sonner").then(({ toast }) => {
    toast.message(message, { description })
  })
}

function notifyError(message: string, description: string) {
  void import("sonner").then(({ toast }) => {
    toast.error(message, { description })
  })
}

function loadScreenerSearchStateLoader() {
  return import("./screener-search-state-loader")
}

function loadScreenerAutoRefreshIndicator() {
  return import("./screener-auto-refresh-indicator")
}

function loadScreenerEmptyState() {
  return import("./screener-empty-state")
}

function loadScreenerTableSection() {
  return import("./screener-table-section")
}

const LazyScreenerSearchStateLoader = dynamic(
  () =>
    loadScreenerSearchStateLoader().then(
      (module) => module.ScreenerSearchStateLoader,
    ),
  { ssr: false, loading: () => null },
)

const LazyScreenerAutoRefreshIndicator = dynamic(
  () =>
    loadScreenerAutoRefreshIndicator().then(
      (module) => module.ScreenerAutoRefreshIndicator,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 rounded-md px-2 py-1">
          <div className="flex flex-col items-end leading-tight">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-primary/40">Refreshes in:</span>
              <span className="text-[11px] tabular-nums text-primary/80">--:--</span>
            </div>
            <div className="hidden md:flex items-center gap-1">
              <span className="text-[10px] text-primary/40">Last updated:</span>
              <span className="text-[11px] tabular-nums text-primary/80">--</span>
            </div>
          </div>
          <span className="size-7 rounded-full border border-primary/20" aria-hidden="true" />
        </div>
      </div>
    ),
  },
)

const LazyScreenerEmptyState = dynamic(
  () => loadScreenerEmptyState().then((module) => module.ScreenerEmptyState),
  {
    ssr: false,
    loading: () => (
      <div className="py-6 border border-dashed border-border rounded-lg">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="text-center">
            <h3 className="font-medium">Loading…</h3>
          </div>
        </div>
      </div>
    ),
  },
)

const LazyScreenerTableSection = dynamic(
  () => loadScreenerTableSection().then((module) => module.ScreenerTableSection),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-8">
        <Spinner size={24} />
      </div>
    ),
  },
)

export function ScreenerPageView() {
  const [sorting, setSorting] = useState<SortingState>([])
  const [smartScreenerStatus, setSmartScreenerStatus] = useState<ScreenerTableStatus | null>(null)
  const [screenResult, setScreenResult] = useState<SmartScreenerScreenResponse | null>(null)
  const [isRefreshingData, setIsRefreshingData] = useState(false)
  const [searchQueryState, setSearchQueryState] = useState<ScreenerSearchQueryState>({
    data: [],
    isLoading: false,
    error: null,
  })
  const queryClient = useQueryClient()

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
  const globalSearchQuery = searchQueryState

  useEffect(() => {
    const preloadTableSection = () => {
      void loadScreenerTableSection()
    }

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadTableSection)
      return () => window.cancelIdleCallback?.(idleId)
    }

    const timeoutId = setTimeout(preloadTableSection, 0)
    return () => clearTimeout(timeoutId)
  }, [])

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

  const coins = screenResult ? screenCoins : globalSearchText ? globalSearchQuery.data : topCoins

  useEffect(() => {
    if (globalSearchText) return
    setSearchQueryState({
      data: [],
      isLoading: false,
      error: null,
    })
  }, [globalSearchText])

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

  const tableStatus = useMemo((): ScreenerTableStatus | null => {
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
      notifyMessage(
        "Taker data is warming up",
        "Some tokens don’t have taker data yet. Try again in a moment.",
      )
      return
    }

    notifyError(
      "No matches",
      "Try lowering thresholds (e.g. net buy > $1m) or switching timeframe.",
    )
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
    <div className="w-full space-y-2 px-3 sm:px-4 lg:px-8">
      {globalSearchText ? (
        <LazyScreenerSearchStateLoader
          query={globalSearchText}
          limit={50}
          onStateChange={setSearchQueryState}
        />
      ) : null}

      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex-1 min-w-0">
          <ScreenerFiltersBar
            searchText={filters.searchText}
            priceRange={filters.priceRange}
            marketCapRange={filters.marketCapRange}
            volumeRange={filters.volumeRange}
            changeFilter={filters.changeFilter}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            takerFilter={filters.takerFilter}
            onSearchTextChange={(value) => setFilters((prev) => ({ ...prev, searchText: value }))}
            onPriceRangeChange={(range) => setFilters((prev) => ({ ...prev, priceRange: range }))}
            onMarketCapRangeChange={(range) => setFilters((prev) => ({ ...prev, marketCapRange: range }))}
            onVolumeRangeChange={(range) => setFilters((prev) => ({ ...prev, volumeRange: range }))}
            onChangeFilterChange={(value) => setFilters((prev) => ({ ...prev, changeFilter: value }))}
            onSortByChange={(value) => setFilters((prev) => ({ ...prev, sortBy: value }))}
            onSortOrderChange={(value) => setFilters((prev) => ({ ...prev, sortOrder: value }))}
            onTakerFilterChange={(value) => setFilters((prev) => ({ ...prev, takerFilter: value }))}
            onClearAllFilters={handleClearAllFilters}
            onSmartScreenerStatusChange={setSmartScreenerStatus}
            smartScreenerSummary={screenResult?.summary ?? null}
            onSmartScreenerScreenResultChange={setScreenResult}
          />
        </div>
        <div className="flex items-center gap-2">
          <LazyScreenerAutoRefreshIndicator
            status={{
              lastUpdatedAtMs: topMarketsQuery.lastUpdatedAtMs,
              refreshIntervalMs: SCREENER_REFRESH_INTERVAL_MS,
              isRefreshing: topMarketsQuery.isFetching || isRefreshingData,
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                aria-label="Refresh screener data"
                variant="ghost"
                size="sm"
                disabled={isRefreshingData}
                onClick={async () => {
                  if (isRefreshingData) return
                  setIsRefreshingData(true)
                  try {
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["screener"] }),
                      queryClient.invalidateQueries({ queryKey: ["smart-screener"] }),
                      queryClient.invalidateQueries({ queryKey: ["coingecko-inline-market-chart"] }),
                      queryClient.invalidateQueries({ queryKey: ["spotTakerBuySellVolumeHistory"] }),
                    ])
                  } catch (error) {
                    notifyError(
                      "Refresh failed",
                      error instanceof Error ? error.message : "Failed to refresh screener data.",
                    )
                  } finally {
                    setIsRefreshingData(false)
                  }
                }}
                className="group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10 disabled:opacity-60"
              >
                {isRefreshingData ? (
                  <Spinner size={14} />
                ) : (
                  <RefreshCw className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" align="center" className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs">
              <span>Refresh data</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="space-y-4">
        {!screenResult &&
        (topMarketsQuery.isLoading ||
          (globalSearchText ? globalSearchQuery.isLoading : false)) ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : coins.length === 0 ? (
          <LazyScreenerEmptyState type="no-coins" />
        ) : filteredCoins.length === 0 ? (
          <LazyScreenerEmptyState type="no-filtered-coins" onClearFilters={handleClearAllFilters} />
        ) : (
          <LazyScreenerTableSection
            coins={filteredCoins}
            sorting={sorting}
            onSortingChange={setSorting}
            status={tableStatus}
            tokenHeaderCountBadge={tokenHeaderCountBadge}
          />
        )}
      </div>
    </div>
  )
}
