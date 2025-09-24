'use client'

import { useState, useMemo } from 'react'
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

  const stableWatchlist = useMemo(() => watchlist, [watchlist]);
  
  const { 
    data: coins, 
    isLoading: isCoinsLoading, 
    error,
    performance
  } = useCoinGeckoWatchlistCoins(stableWatchlist);

  // Log performance metrics for monitoring
  console.log('🚀 Watchlist performance:', performance)

  // Create optimistic loading coins while data is being fetched
  const optimisticCoins = useMemo(() => {
    if (isCoinsLoading && !coins) {
      // Show skeleton rows during initial load
      return stableWatchlist.map(coinId => ({
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
  }, [isCoinsLoading, coins, stableWatchlist])

  // Filter and sort coins based on filter state
  const filteredCoins = useMemo(() => {
    if (!optimisticCoins.length) return [];
    
    console.log('Raw coins data:', optimisticCoins);
    console.log('Current filters:', filters);
    
    const filtered = optimisticCoins.filter(coin => {
      // Search filter
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        if (!coin.name.toLowerCase().includes(searchLower) && 
            !coin.symbol.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      
      // Price range filter
      if (coin.quote.USD.price < filters.priceRange[0] || 
          coin.quote.USD.price > filters.priceRange[1]) {
        console.log(`Filtering out ${coin.name} due to price: ${coin.quote.USD.price}`);
        return false;
      }
      
      // Market cap range filter
      if (coin.quote.USD.market_cap < filters.marketCapRange[0] || 
          coin.quote.USD.market_cap > filters.marketCapRange[1]) {
        console.log(`Filtering out ${coin.name} due to market cap: ${coin.quote.USD.market_cap}`);
        return false;
      }
      
      // 24h change filter
      if (filters.changeFilter === "positive" && coin.quote.USD.percent_change_24h <= 0) {
        return false;
      }
      if (filters.changeFilter === "negative" && coin.quote.USD.percent_change_24h >= 0) {
        return false;
      }
      
      return true;
    });
    
    console.log('Filtered coins:', filtered);
    
    // Sort coins
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (filters.sortBy) {
        case "price":
          aValue = a.quote.USD.price;
          bValue = b.quote.USD.price;
          break;
        case "change":
          aValue = a.quote.USD.percent_change_24h;
          bValue = b.quote.USD.percent_change_24h;
          break;
        case "marketCap":
          aValue = a.quote.USD.market_cap;
          bValue = b.quote.USD.market_cap;
          break;
        case "volume":
          aValue = a.quote.USD.volume_24h;
          bValue = b.quote.USD.volume_24h;
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
  const handleClearAllFilters = () => {
    setFilters({
      searchText: "",
      priceRange: [0, 1000000],
      marketCapRange: [0, 10000000000000],
      volumeRange: [0, 1000000000],
      changeFilter: "all",
      sortBy: "name",
      sortOrder: "asc",
    });
  };

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
