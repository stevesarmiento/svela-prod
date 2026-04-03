'use client'

import { useState, useMemo, useCallback } from 'react'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import { useWatchlistByGroup, useWatchlistGroups } from '@/lib/convex-hooks'
import type { CoinMarketData } from '@/types/coins'

// Filter interface
export interface FilterState {
  searchText: string;
  priceRange: [number, number];
  marketCapRange: [number, number];
  volumeRange: [number, number];
  changeFilter: "all" | "positive" | "negative";
  sortBy: "name" | "price" | "change" | "marketCap" | "volume";
  sortOrder: "asc" | "desc";
  watchlistGroupId: string | null;
  takerFilter: TakerFilterState | null;
}

export interface TakerFilterState {
  /** Snapshot range, currently backed by CoinGlass exchange-list snapshots (e.g. "24h"). */
  range: "1h" | "4h" | "12h" | "24h" | "7d";
  /**
   * If set, use that exchange's taker stats when available; otherwise use the overall snapshot.
   * Example: "Binance"
   */
  exchange: string | null;
  /** \(0..1\) */
  minBuyRatio: number | null;
  minBuyVolumeUsd: number | null;
  minTotalVolumeUsd: number | null;
  /** Minimum net buy volume in USD (buy - sell). */
  minNetBuyUsd: number | null;
  /** Require buy volume > sell volume. */
  requireBuyGreaterThanSell: boolean;
}

interface UseWatchlistDataProps {
  watchlist: string[];
}

export function useWatchlistData({ watchlist }: UseWatchlistDataProps) {
  // Filter state - increase market cap range to accommodate large coins
  const [filters, setFilters] = useState<FilterState>({
    searchText: "",
    priceRange: [0, 1000000],
    marketCapRange: [0, 10000000000000],
    // Default max must be high enough to include majors (BTC/ETH often > $1B daily volume).
    volumeRange: [0, 1000000000000],
    changeFilter: "all",
    // Default sort: highest market cap first
    sortBy: "marketCap",
    sortOrder: "desc",
    watchlistGroupId: null,
    takerFilter: null,
  })

  const watchlistGroups = useWatchlistGroups()
  const selectedGroupId = filters.watchlistGroupId ?? undefined
  const selectedGroupItems = useWatchlistByGroup(selectedGroupId)
  const isSelectedGroupItemsLoading = Boolean(selectedGroupId && selectedGroupItems === undefined)

  const selectedGroupCoinIdSet = useMemo(() => {
    return new Set((selectedGroupItems ?? []).map((item) => item.coinId))
  }, [selectedGroupItems])

  const watchlistGroupOptions = useMemo(() => {
    return (watchlistGroups ?? []).map((g) => ({ id: g._id, name: g.name }))
  }, [watchlistGroups])

  const { 
    data: coins, 
    isLoading: isCoinsLoading, 
    error,
    performance
  } = useCoinGeckoWatchlistCoins(watchlist);

  const isInitialCoinsLoading =
    (watchlist.length > 0 && isCoinsLoading && coins.length === 0) || isSelectedGroupItemsLoading

  // Filter and sort coins based on filter state
  const filteredCoins = useMemo(() => {
    if (!coins.length) return [];
    
    const searchLower = filters.searchText ? filters.searchText.toLowerCase() : null
    const hasWatchlistGroupFilter = Boolean(selectedGroupId)

    const filtered = coins.filter(coin => {
      const usd = coin.quote.USD
      const price = usd.price
      const marketCap = usd.market_cap
      const volume24h = usd.volume_24h
      const change24h = usd.percent_change_24h

      // Watchlist group filter (screener only)
      if (hasWatchlistGroupFilter) {
        if (!selectedGroupCoinIdSet.has(coin.id)) return false
      }

      // Search filter
      if (searchLower) {
        if (!coin.name.toLowerCase().includes(searchLower) && 
            !coin.symbol.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      
      // Price range filter
      if (price < filters.priceRange[0] || price > filters.priceRange[1]) {
        return false;
      }
      
      // Market cap range filter
      if (marketCap < filters.marketCapRange[0] || marketCap > filters.marketCapRange[1]) {
        return false;
      }

      // Volume range filter
      if (volume24h < filters.volumeRange[0] || volume24h > filters.volumeRange[1]) {
        return false
      }
      
      // 24h change filter
      if (filters.changeFilter === "positive" && change24h <= 0) {
        return false;
      }
      if (filters.changeFilter === "negative" && change24h >= 0) {
        return false;
      }
      
      return true;
    });
    
    // Sort coins
    filtered.sort((a, b) => {
      const aUsd = a.quote.USD
      const bUsd = b.quote.USD
      let aValue: number | string;
      let bValue: number | string;
      
      switch (filters.sortBy) {
        case "price":
          aValue = aUsd.price;
          bValue = bUsd.price;
          break;
        case "change":
          aValue = aUsd.percent_change_24h;
          bValue = bUsd.percent_change_24h;
          break;
        case "marketCap":
          aValue = aUsd.market_cap;
          bValue = bUsd.market_cap;
          break;
        case "volume":
          aValue = aUsd.volume_24h;
          bValue = bUsd.volume_24h;
          break;
        default: // "name"
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (filters.sortOrder === "desc") {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    });
    
    return filtered;
  }, [coins, filters, selectedGroupId, selectedGroupCoinIdSet]);

  // Filter handlers
  const handleClearAllFilters = useCallback(() => {
    setFilters({
      searchText: "",
      priceRange: [0, 1000000],
      marketCapRange: [0, 10000000000000],
      volumeRange: [0, 1000000000000],
      changeFilter: "all",
      // Default sort: highest market cap first
      sortBy: "marketCap",
      sortOrder: "desc",
      watchlistGroupId: null,
      takerFilter: null,
    });
  }, []);

  return {
    filters,
    setFilters,
    filteredCoins,
    isCoinsLoading,
    isInitialCoinsLoading,
    error,
    performance,
    handleClearAllFilters,
    watchlistGroupOptions,
  };
}
