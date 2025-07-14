"use client";

import { useQuery } from "@tanstack/react-query";

interface CoinGeckoQuoteResponse {
  data: Record<string, CoinGeckoMarketData>;
  status: {
    timestamp: string;
    error_code: number;
    error_message: string;
    elapsed: number;
    credit_count: number;
    search_type: 'direct_api' | 'ids';
    total_results: number;
  };
}

interface CoinGeckoMarketData {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
  image: string;
  current_price: number;
  market_cap: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number | null;
  price_change_percentage_14d_in_currency: number | null;
  price_change_percentage_30d_in_currency: number | null;
  price_change_percentage_200d_in_currency: number | null;
  price_change_percentage_1y_in_currency: number | null;
  price_change_percentage_1h_in_currency: number | null;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  roi: { times: number; currency: string; percentage: number } | null;
  last_updated: string;
  sparkline_in_7d: { price: number[] };
}

// Transformed data structure to match our app's expectations
export interface CoinGeckoQuoteData {
  id: string;
  name: string;
  symbol: string;
  image: string; // CoinGecko image URL
  cmc_rank: number; // mapped from market_cap_rank for consistency
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

// Search parameters interface
export interface CoinGeckoSearchParams {
  ids?: string[];
  symbols?: string[];
  names?: string[];
  category?: string;
  limit?: number;
}

// Original hook for backward compatibility - searches by CoinGecko IDs
export function useCoinGeckoQuotes(coingeckoIds: string[]) {
  return useCoinGeckoSearch({ ids: coingeckoIds });
}

// Enhanced hook that supports multiple search methods
export function useCoinGeckoSearch(searchParams: CoinGeckoSearchParams) {
  const { ids, symbols, names, category, limit = 100 } = searchParams;
  
  // Create a stable cache key
  const cacheKey = [
    "coingecko-search",
    ids?.sort().join(",") || "",
    symbols?.sort().join(",") || "",
    names?.sort().join(",") || "",
    category || "",
    limit.toString()
  ].filter(Boolean).join("|");

  return useQuery({
    queryKey: [cacheKey],
    queryFn: async (): Promise<CoinGeckoQuoteData[]> => {
      // Validate that at least one search parameter is provided OR it's a top coins request
      if (!ids?.length && !symbols?.length && !names?.length && !category && !limit) {
        return [];
      }

      // Build query parameters
      const params = new URLSearchParams();
      
      if (ids?.length) {
        params.append('ids', ids.join(','));
      }
      if (symbols?.length) {
        params.append('symbols', symbols.join(','));
      }
      if (names?.length) {
        params.append('names', names.join(','));
      }
      if (category) {
        params.append('category', category);
      }
      if (limit) {
        params.append('limit', limit.toString());
      }

      const response = await fetch(`/api/coingecko/quotes?${params}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Invalid response format");
      }

      const data: CoinGeckoQuoteResponse = await response.json();
      
      if (data.status.error_code !== 0) {
        throw new Error(data.status.error_message || "API error");
      }

      // Transform the data to match our app's expected format
      return Object.values(data.data).map((coin: CoinGeckoMarketData): CoinGeckoQuoteData => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        image: coin.image,
        cmc_rank: coin.market_cap_rank || 0,
        quote: {
          USD: {
            price: coin.current_price,
            percent_change_24h: coin.price_change_percentage_24h || 0,
            percent_change_1h: coin.price_change_percentage_1h_in_currency || undefined,
            percent_change_7d: coin.price_change_percentage_7d_in_currency || undefined,
            percent_change_30d: coin.price_change_percentage_30d_in_currency || undefined,
            market_cap: coin.market_cap,
            volume_24h: coin.total_volume,
          }
        }
      }));
    },
    enabled: true, // Always enabled - API handles the logic for top coins vs search
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
  });
}

// Convenience hooks for specific search types
export function useCoinGeckoSymbolSearch(symbols: string[], limit?: number) {
  return useCoinGeckoSearch({ symbols, limit });
}

export function useCoinGeckoNameSearch(names: string[], limit?: number) {
  return useCoinGeckoSearch({ names, limit });
}

export function useCoinGeckoCategorySearch(category: string, limit?: number) {
  return useCoinGeckoSearch({ category, limit });
} ;