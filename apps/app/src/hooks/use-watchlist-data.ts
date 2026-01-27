'use client'

import { useState, useMemo, useCallback } from 'react'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
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
    volumeRange: [0, 1000000000],
    changeFilter: "all",
    sortBy: "name",
    sortOrder: "asc",
  })

  const { 
    data: coins, 
    isLoading: isCoinsLoading, 
    error,
    performance
  } = useCoinGeckoWatchlistCoins(watchlist);

  // Create optimistic loading coins while data is being fetched
  const optimisticCoins = useMemo(() => {
    if (isCoinsLoading && !coins) {
      // Show skeleton rows during initial load
      return watchlist.map(coinId => ({
        id: coinId,
        name: 'Loading...',
        symbol: 'Loading...',
        image: '', // Empty image triggers skeleton loading
        slug: `coin-${coinId}`,
        cmc_rank: 0,
        circulating_supply: 0,
        max_supply: null,
        quote: {
          USD: {
            price: 0, // 0 price triggers skeleton loading
            volume_24h: 0,
            market_cap: 0,
            percent_change_24h: 0,
          }
        }
      } as CoinMarketData))
    }
    return coins || []
  }, [isCoinsLoading, coins, watchlist])

  // Filter and sort coins based on filter state
  const filteredCoins = useMemo(() => {
    if (!optimisticCoins.length) return [];
    
    const searchLower = filters.searchText ? filters.searchText.toLowerCase() : null

    const filtered = optimisticCoins.filter(coin => {
      const usd = coin.quote.USD
      const price = usd.price
      const marketCap = usd.market_cap
      const change24h = usd.percent_change_24h

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
      let aValue, bValue;
      
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
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });
    
    return filtered;
  }, [optimisticCoins, filters]);

  // Filter handlers
  const handleClearAllFilters = useCallback(() => {
    setFilters({
      searchText: "",
      priceRange: [0, 1000000],
      marketCapRange: [0, 10000000000000],
      volumeRange: [0, 1000000000],
      changeFilter: "all",
      sortBy: "name",
      sortOrder: "asc",
    });
  }, []);

  return {
    filters,
    setFilters,
    filteredCoins,
    isCoinsLoading,
    error,
    performance,
    handleClearAllFilters,
  };
}
