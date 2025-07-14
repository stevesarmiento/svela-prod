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
 * Optimized hybrid search that leverages database-first approach
 * 
 * 1. Searches our coingeckoCoins database for name/symbol matches (fast, with real images)
 * 2. Gets live pricing data from API for only the matched coins
 * 3. Combines static DB data (names, symbols, images) with dynamic API data (prices, changes)
 * 4. Sorts results by market cap (highest first) for better relevance
 * 
 * Benefits:
 * - Reduced API payload (only pricing data, not static data)
 * - Faster initial display (static data from DB)
 * - Real CoinGecko images from updated database
 * - Most relevant coins (by market cap) appear first
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
    if (!dbSearchResults) return [];

    return dbSearchResults
      .map(dbCoin => {
        const pricing = pricingData?.[dbCoin.coingeckoId];
        
        return {
          id: dbCoin.coingeckoId,
          name: dbCoin.name, // From database (static)
          symbol: dbCoin.symbol, // From database (static)
          image: dbCoin.logoUrl, // From database (now has real CoinGecko URLs)
          cmc_rank: pricing?.market_cap_rank || 0, // From API (live ranking)
          quote: {
            USD: {
              price: pricing?.current_price || 0, // From API (live price)
              percent_change_24h: pricing?.price_change_percentage_24h || 0, // From API (live)
              percent_change_1h: pricing?.price_change_percentage_1h_in_currency, // From API (live)
              percent_change_7d: pricing?.price_change_percentage_7d_in_currency, // From API (live)
              percent_change_30d: pricing?.price_change_percentage_30d_in_currency, // From API (live)
              market_cap: pricing?.market_cap || 0, // From API (live)
              volume_24h: pricing?.total_volume || 0, // From API (live)
            }
          }
        };
      })
      .sort((a, b) => {
        // Sort by market cap descending (highest first)
        const marketCapA = a.quote.USD.market_cap || 0;
        const marketCapB = b.quote.USD.market_cap || 0;
        
        // If both have market caps, sort by market cap
        if (marketCapA > 0 && marketCapB > 0) {
          return marketCapB - marketCapA;
        }
        
        // If only one has market cap, prioritize it
        if (marketCapA > 0 && marketCapB === 0) return -1;
        if (marketCapB > 0 && marketCapA === 0) return 1;
        
        // If neither has market cap, sort by CMC rank (lower rank = higher position)
        const rankA = a.cmc_rank || 999999;
        const rankB = b.cmc_rank || 999999;
        return rankA - rankB;
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
 * Get top coins using API-first approach for real-time market cap rankings
 * Uses direct API data to ensure accurate real-time top 25 by market cap
 */
export function useHybridTopCoins(limit = 25) {
  // Step 1: Get top coins directly from API by market cap (real-time ranking)
  const { data: pricingData, isLoading: isPricingLoading, error: pricingError } = useQuery({
    queryKey: ["hybrid-top-coins-api-first", limit],
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

  // Step 2: Combine API data directly (API provides the real-time top coins)
  const combinedResults = useMemo((): HybridCoinSearchResult[] => {
    if (!pricingData) return [];

    return Object.values(pricingData)
      .map(pricing => ({
        id: pricing.id,
        name: pricing.name,
        symbol: pricing.symbol,
        image: pricing.image, // Use API image for top coins (ensures real-time accuracy)
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