"use client";

import { useMemo } from "react";
import { 
  useCoinGeckoSymbolSearch, 
  useCoinGeckoNameSearch, 
  useCoinGeckoSearch,
  type CoinGeckoQuoteData 
} from "./use-coingecko-quotes";

interface EnhancedSearchResult {
  data: CoinGeckoQuoteData[];
  isLoading: boolean;
  error: Error | null;
  searchType: 'symbol' | 'name' | 'mixed' | 'category';
  totalResults: number;
}

interface EnhancedSearchOptions {
  limit?: number;
  category?: string;
  enableFallback?: boolean; // Whether to try name search if symbol search fails
}

/**
 * Enhanced coin search that intelligently determines search type and provides fallbacks
 * 
 * @param query - Search term (can be symbol like "BTC" or name like "Bitcoin")
 * @param options - Search configuration options
 */
export function useEnhancedCoinSearch(
  query: string, 
  options: EnhancedSearchOptions = {}
): EnhancedSearchResult {
  const { limit = 50, category, enableFallback = true } = options;
  
  // Determine search strategy based on query characteristics
  const searchStrategy = useMemo(() => {
    if (!query.trim()) return null;
    
    const cleanQuery = query.trim();
    
    // Category search takes priority
    if (category) {
      return { type: 'category' as const, terms: [], category };
    }
    
    // Split by common separators for multi-term searches
    const terms = cleanQuery.split(/[,\s]+/).filter(term => term.length > 0);
    
    // Determine if this looks like symbol(s) or name(s)
    const looksLikeSymbols = terms.every(term => 
      term.length <= 6 && // Symbols are typically short
      /^[A-Za-z0-9]+$/.test(term) && // Only alphanumeric
      !term.includes(' ') // No spaces
    );
    
    if (looksLikeSymbols) {
      return { type: 'symbol' as const, terms, category: undefined };
    }
      return { type: 'name' as const, terms, category: undefined };
  }, [query, category]);
  
  // Primary search based on detected strategy
  const symbolSearch = useCoinGeckoSymbolSearch(
    searchStrategy?.type === 'symbol' ? searchStrategy.terms : [],
    limit
  );
  
  const nameSearch = useCoinGeckoNameSearch(
    searchStrategy?.type === 'name' ? searchStrategy.terms : [],
    limit
  );
  
  const categorySearch = useCoinGeckoSearch({
    category: searchStrategy?.type === 'category' ? searchStrategy.category : undefined,
    limit
  });
  
  // Fallback search - if symbol search returns no results, try name search
  const fallbackNameSearch = useCoinGeckoNameSearch(
    searchStrategy?.type === 'symbol' && enableFallback && 
    symbolSearch.data?.length === 0 && !symbolSearch.isLoading ? 
    searchStrategy.terms : [],
    limit
  );
  
  // Determine which search result to use
  const result = useMemo((): EnhancedSearchResult => {
    if (!searchStrategy) {
      return {
        data: [],
        isLoading: false,
        error: null,
        searchType: 'mixed',
        totalResults: 0
      };
    }
    
    switch (searchStrategy.type) {
      case 'category':
        return {
          data: categorySearch.data || [],
          isLoading: categorySearch.isLoading,
          error: categorySearch.error as Error | null,
          searchType: 'category',
          totalResults: categorySearch.data?.length || 0
        };
        
      case 'symbol': {
        // Use fallback if primary search failed and fallback has results
        const useSymbolFallback = enableFallback && 
          symbolSearch.data?.length === 0 && 
          !symbolSearch.isLoading &&
          (fallbackNameSearch.data?.length || 0) > 0;
          
        return {
          data: useSymbolFallback ? fallbackNameSearch.data || [] : symbolSearch.data || [],
          isLoading: symbolSearch.isLoading || fallbackNameSearch.isLoading,
          error: (symbolSearch.error || fallbackNameSearch.error) as Error | null,
          searchType: useSymbolFallback ? 'name' : 'symbol',
          totalResults: useSymbolFallback ? 
            fallbackNameSearch.data?.length || 0 : 
            symbolSearch.data?.length || 0
        };
      }
        
      case 'name':
        return {
          data: nameSearch.data || [],
          isLoading: nameSearch.isLoading,
          error: nameSearch.error as Error | null,
          searchType: 'name',
          totalResults: nameSearch.data?.length || 0
        };
        
      default:
        return {
          data: [],
          isLoading: false,
          error: null,
          searchType: 'mixed',
          totalResults: 0
        };
    }
  }, [searchStrategy, symbolSearch, nameSearch, categorySearch, fallbackNameSearch, enableFallback]);
  
  return result;
}

/**
 * Get top coins by market cap
 */
export function useTopCoinGeckoCoins(limit = 25) {
  return useCoinGeckoSearch({ limit });
}

/**
 * Search coins by category (e.g., 'layer-1', 'defi', 'nft')
 */
export function useCoinsByCategory(category: string, limit = 50) {
  return useCoinGeckoSearch({ category, limit });
} 