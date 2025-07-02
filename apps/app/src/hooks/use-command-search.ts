"use client";

import { useState, useMemo, useCallback } from 'react';
import { useDebounce } from './use-debounce';
import { useCoinSearch, useTopCoins } from './use-coin-search';

export interface CoinSearchResult {
  id: number;
  name: string;
  symbol: string;
  cmc_rank?: number;
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      market_cap: number;
      volume_24h: number;
    };
  };
}

export function useCommandSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Debounce search for API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // Get coin data
  const { 
    data: searchResults, 
    isLoading: isSearchLoading 
  } = useCoinSearch(debouncedSearchQuery);
  
  const { 
    data: topCoins, 
    isLoading: isTopCoinsLoading 
  } = useTopCoins();

  // Memoize coins to display (limit to 5 for performance)
  const coinsToDisplay = useMemo(() => {
    if (debouncedSearchQuery.trim()) {
      return searchResults?.slice(0, 5) || [];
    }
    return topCoins?.slice(0, 5) || [];
  }, [debouncedSearchQuery, searchResults, topCoins]);

  const isLoading = useMemo(() => {
    return searchQuery.trim() ? isSearchLoading : isTopCoinsLoading;
  }, [searchQuery, isSearchLoading, isTopCoinsLoading]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    coinsToDisplay,
    isLoading,
    clearSearch,
    hasSearch: Boolean(searchQuery.trim())
  };
}