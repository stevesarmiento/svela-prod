"use client";

import { useMemo } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";

// Interface for CoinGecko API pricing response
interface CoinGeckoPricingData {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  market_cap: number;
  total_volume: number;
  image: string;
}

// Interface for the final combined result
export interface HybridCoinSearchResult {
  id: string; // CoinGecko ID
  name: string;
  symbol: string;
  image: string; // From our database
  cmc_rank: number; // From API pricing data
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
      market_cap: number;
      volume_24h: number;
    };
  };
}

interface HybridSearchOptions {
  limit?: number;
}

/**
 * Hybrid search that combines database efficiency with real-time pricing
 * 
 * 1. Searches our coingeckoCoins database for name/symbol matches (fast)
 * 2. Gets real-time pricing from API for only the matched coins
 * 3. Combines static DB data with dynamic API data
 */
export function useHybridCoinSearch(
  query: string,
  options: HybridSearchOptions = {}
): {
  data: HybridCoinSearchResult[];
  isLoading: boolean;
  error: Error | null;
  searchType: 'symbol' | 'name' | 'mixed';
  totalResults: number;
} {
  const { limit = 50 } = options;
  
  // Step 1: Search our database for matching coins (very fast)
  const dbSearchResults = useConvexQuery(
    api.coins.searchCoinGeckoCoins,
    query.trim() ? { query: query.trim(), limit } : "skip"
  );

  // Extract CoinGecko IDs from database results
  const coingeckoIds = useMemo(() => {
    return dbSearchResults?.map(coin => coin.coingeckoId) || [];
  }, [dbSearchResults]);

  // Step 2: Get pricing data from API for only the matched coins
  const { data: pricingData, isLoading: isPricingLoading, error: pricingError } = useQuery({
    queryKey: ["hybrid-pricing", coingeckoIds.sort().join(",")],
    queryFn: async (): Promise<Record<string, CoinGeckoPricingData>> => {
      if (!coingeckoIds.length) return {};

      const response = await fetch(`/api/coingecko/quotes?ids=${coingeckoIds.join(",")}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data || {};
    },
    enabled: coingeckoIds.length > 0,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
  });

  // Step 3: Combine database static data with API pricing data
  const combinedResults = useMemo((): HybridCoinSearchResult[] => {
    if (!dbSearchResults || !pricingData) return [];

    return dbSearchResults
      .map(dbCoin => {
        const pricing = pricingData[dbCoin.coingeckoId];
        
        return {
          id: dbCoin.coingeckoId,
          name: dbCoin.name, // From database
          symbol: dbCoin.symbol, // From database  
          image: pricing?.image || dbCoin.logoUrl, // Use API image first, fallback to DB
          cmc_rank: pricing?.market_cap_rank || 0, // From API
          quote: {
            USD: {
              price: pricing?.current_price || 0, // From API
              percent_change_24h: pricing?.price_change_percentage_24h || 0, // From API
              percent_change_1h: pricing?.price_change_percentage_1h_in_currency,
              percent_change_7d: pricing?.price_change_percentage_7d_in_currency,
              percent_change_30d: pricing?.price_change_percentage_30d_in_currency,
              market_cap: pricing?.market_cap || 0, // From API
              volume_24h: pricing?.total_volume || 0, // From API
            }
          }
        };
      });
  }, [dbSearchResults, pricingData]);

  // Determine search type based on query characteristics
  const searchType = useMemo(() => {
    if (!query.trim()) return 'mixed';
    
    const cleanQuery = query.trim();
    const terms = cleanQuery.split(/[,\s]+/).filter(term => term.length > 0);
    
    const looksLikeSymbols = terms.every(term => 
      term.length <= 6 && 
      /^[A-Za-z0-9]+$/.test(term) && 
      !term.includes(' ')
    );
    
    return looksLikeSymbols ? 'symbol' : 'name';
  }, [query]);

  return {
    data: combinedResults,
    isLoading: !dbSearchResults || (coingeckoIds.length > 0 && isPricingLoading),
    error: pricingError as Error | null,
    searchType,
    totalResults: combinedResults.length
  };
}

/**
 * Get top coins using API directly for real market cap rankings
 * Database is only used for search, not for top coins
 */
export function useHybridTopCoins(limit = 25) {
  // Get top coins directly from API (not from database)
  const { data: pricingData, isLoading: isPricingLoading, error: pricingError } = useQuery({
    queryKey: ["hybrid-top-coins-api-direct", limit],
    queryFn: async (): Promise<Record<string, CoinGeckoPricingData>> => {
      // Get top coins directly from API by market cap
      const response = await fetch(`/api/coingecko/quotes?limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data || {};
    },
    enabled: true,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Convert API data directly to our result format
  const combinedResults = useMemo((): HybridCoinSearchResult[] => {
    if (!pricingData) return [];

    return Object.values(pricingData)
      .map(pricing => ({
        id: pricing.id,
        name: pricing.name,
        symbol: pricing.symbol,
        image: pricing.image, // Real image from API
        cmc_rank: pricing.market_cap_rank,
        quote: {
          USD: {
            price: pricing.current_price,
            percent_change_24h: pricing.price_change_percentage_24h,
            percent_change_1h: pricing.price_change_percentage_1h_in_currency,
            percent_change_7d: pricing.price_change_percentage_7d_in_currency,
            percent_change_30d: pricing.price_change_percentage_30d_in_currency,
            market_cap: pricing.market_cap,
            volume_24h: pricing.total_volume,
          }
        }
      }))
      .filter(coin => coin.quote.USD.price > 0) // Only coins with valid pricing
      .sort((a, b) => a.cmc_rank - b.cmc_rank) // Sort by market cap rank
      .slice(0, limit);
  }, [pricingData, limit]);

  return {
    data: combinedResults,
    isLoading: isPricingLoading,
    error: pricingError as Error | null,
    searchType: 'mixed' as const,
    totalResults: combinedResults.length
  };
} 