"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCoinGeckoQuotesBulk } from "@/hooks/use-coingecko-quotes";
import { CoinGeckoApi } from "@/lib/effect/coingecko-api";
import { CoinsInternalApi, type CoinSummary } from "@/lib/effect/coins-internal-api";
import { runPromise as runCoinsInternalPromise } from "@/lib/effect/runtime-coins-internal";
import { runPromise as runCoinGeckoPromise } from "@/lib/effect/runtime-coingecko";

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

// How many candidates to pull from the DB before re-ranking client-side.
// Deliberately larger than the display limit: the DB ranks lexically only
// (exact id > exact symbol > ...), so ticker-squatting joke coins (symbol
// literally "BITCOIN") would otherwise fill a small slate before legitimate
// partial matches ever reach the client.
const SEARCH_SLATE_SIZE = 50;

/** Ticker-like queries ("btc", "sol") should let exact-symbol matches win. */
function isTickerLikeQuery(query: string): boolean {
  return query.length <= 6 && /^[a-z0-9]+$/.test(query);
}

/**
 * Lexical relevance boost, blended with log10(market cap) for final ranking.
 *
 * Exact symbol matches only get the full boost for ticker-like queries:
 * for name-like queries ("bitcoin"), a symbol-exact match is usually a
 * squatter riding a famous name, so market cap decides instead.
 */
function exactnessBoost(
  coin: { id: string; name: string; symbol: string },
  normalizedQuery: string,
  tickerLike: boolean,
): number {
  const id = coin.id.toLowerCase();
  const name = coin.name.toLowerCase();
  const symbol = coin.symbol.toLowerCase();

  if (id === normalizedQuery || name === normalizedQuery) return 6;
  if (symbol === normalizedQuery) return tickerLike ? 6 : 1.5;
  if (name.startsWith(normalizedQuery) || symbol.startsWith(normalizedQuery)) return 2;
  if (name.includes(normalizedQuery)) return 0.5;
  return 0;
}

/**
 * Optimized hybrid search that leverages database-first approach
 *
 * 1. Searches our coingeckoCoins database for name/symbol matches (fast, with real images)
 * 2. Gets live pricing data from API for only the matched coins
 * 3. Combines static DB data (names, symbols, images) with dynamic API data (prices, changes)
 * 4. Re-ranks by blended score: log10(market cap) + lexical exactness boost
 *
 * Benefits:
 * - Reduced API payload (only pricing data, not static data)
 * - Faster initial display (static data from DB)
 * - Real CoinGecko images from updated database
 * - Popular coins outrank ticker-squatters; exact tickers still win for short queries
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
  // Over-fetch so the client-side re-rank has real candidates to work with.
  const fetchLimit = Math.max(SEARCH_SLATE_SIZE, limit);

  // Step 1: Search our database for matching coins (very fast)
  const {
    data: dbSearchResults,
    isLoading: isDbLoading,
    error: dbError,
  } = useQuery({
    queryKey: ["coins", "search", query.trim(), fetchLimit],
    queryFn: async ({ signal }): Promise<ReadonlyArray<CoinSummary>> =>
      await runCoinsInternalPromise(
        CoinsInternalApi.use((api) =>
          api.search({ query: query.trim(), limit: fetchLimit }),
        ),
        { signal },
      ),
    enabled: !!query.trim(),
    staleTime: 10 * 60 * 1000,
  });

  // Extract CoinGecko IDs from database results
  const coingeckoIds = useMemo(() => {
    return dbSearchResults?.map(coin => coin.coingeckoId) || [];
  }, [dbSearchResults]);

  // Step 2: Get pricing data from API for only the matched coins
  const quotesQuery = useCoinGeckoQuotesBulk(coingeckoIds)

  // Step 3: Combine database static data with API pricing data, then re-rank
  const combinedResults = useMemo((): HybridCoinSearchResult[] => {
    if (!dbSearchResults) return [];

    const normalizedQuery = query.trim().toLowerCase();
    const tickerLike = isTickerLikeQuery(normalizedQuery);

    return dbSearchResults
      .map(dbCoin => {
        const pricing = quotesQuery.data?.[dbCoin.coingeckoId];

        const coin = {
          id: dbCoin.coingeckoId,
          name: dbCoin.name, // From database (static)
          symbol: dbCoin.symbol, // From database (static)
          image: dbCoin.logoUrl, // From database (now has real CoinGecko URLs)
          cmc_rank: pricing?.market_cap_rank || 0, // From API (live ranking)
          quote: {
            USD: {
              price: pricing?.current_price ?? 0,
              percent_change_24h: pricing?.price_change_percentage_24h || 0, // From API (live)
              percent_change_1h: pricing?.price_change_percentage_1h_in_currency ?? undefined, // From API (live)
              percent_change_7d: pricing?.price_change_percentage_7d_in_currency ?? undefined, // From API (live)
              percent_change_30d: pricing?.price_change_percentage_30d_in_currency ?? undefined, // From API (live)
              market_cap: pricing?.market_cap || 0, // From API (live)
              volume_24h: pricing?.total_volume || 0, // From API (live)
            }
          }
        };

        return {
          coin,
          // Blend popularity (log10 mcap: BTC ≈ 12, dead coins = 0) with lexical
          // relevance so exact matches win among peers but a $10k squatter can't
          // outrank a real project.
          score:
            Math.log10(Math.max(coin.quote.USD.market_cap, 1)) +
            exactnessBoost(coin, normalizedQuery, tickerLike),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ coin }) => coin);
  }, [dbSearchResults, quotesQuery.data, query, limit]);

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
    isLoading:
      (query.trim() !== "" && (isDbLoading || !dbSearchResults)) ||
      (coingeckoIds.length > 0 && quotesQuery.isLoading),
    error: (dbError || quotesQuery.error) as Error | null,
    searchType,
    totalResults: combinedResults.length
  };
}

/**
 * Get top coins using API-first approach for real-time market cap rankings
 * Uses direct API data to ensure accurate real-time top 25 by market cap
 *
 * Pass `enabled: false` to defer the fetch (e.g. until a palette is about to
 * open) and keep it off the page's critical loading path.
 */
export function useHybridTopCoins(limit = 25, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  // Step 1: Get top coins directly from API by market cap (real-time ranking)
  const { data: pricingData, isLoading: isPricingLoading, error: pricingError } = useQuery({
    queryKey: ["hybrid-top-coins-api-first", limit],
    queryFn: async ({ signal }) => {
      // Get top coins directly from API by market cap
      const response = await runCoinGeckoPromise(
        CoinGeckoApi.use((api) => api.getQuotes({ limit })),
        { signal },
      );
      return response.data;
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });

  // Step 2: Combine API data directly (API provides the real-time top coins)
  const combinedResults = useMemo((): HybridCoinSearchResult[] => {
    if (!pricingData) return [];

    return Object.values(pricingData)
      .flatMap(pricing =>
        (pricing.current_price ?? 0) > 0 &&
        pricing.market_cap_rank !== null &&
        pricing.market_cap_rank > 0
          ? [{
              id: pricing.id,
              name: pricing.name,
              symbol: pricing.symbol,
              image: pricing.image, // Use API image for top coins (ensures real-time accuracy)
              cmc_rank: pricing.market_cap_rank,
              quote: {
                USD: {
                  price: pricing.current_price ?? 0,
                  percent_change_24h: pricing.price_change_percentage_24h ?? 0,
                  percent_change_1h: pricing.price_change_percentage_1h_in_currency ?? undefined,
                  percent_change_7d: pricing.price_change_percentage_7d_in_currency ?? undefined,
                  percent_change_30d: pricing.price_change_percentage_30d_in_currency ?? undefined,
                  market_cap: pricing.market_cap ?? 0,
                  volume_24h: pricing.total_volume ?? 0,
                }
              }
            }]
          : [],
      )
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