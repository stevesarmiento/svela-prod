"use client";

import { useQuery } from "@tanstack/react-query";
import { Effect } from "effect";

import { useDebounce } from "@/hooks/use-debounce";
import {
  CoinGeckoApi,
  type CoinGeckoMarketRow,
} from "@/lib/effect/coingecko-api";
import {
  type CoinSummary,
  CoinsInternalApi,
} from "@/lib/effect/coins-internal-api";
import { runPromise as runSearchPromise } from "@/lib/effect/runtime-search";
import { toCoinMarketData } from "@/lib/screener/coin-market-data";
import type { CoinMarketData } from "@/types/coins";

// Keystrokes settle for this long before a search request fires — the
// debounced value is the query key, so intermediate strings never fetch.
const SEARCH_DEBOUNCE_MS = 250;

function searchResultToCoinMarketData(
  result: CoinSummary,
  market: CoinGeckoMarketRow | null,
): CoinMarketData {
  // Null-preserving (see lib/screener/coin-market-data.ts): a coin without
  // market data yet renders "—" instead of a fake $0.
  return toCoinMarketData({
    coingeckoId: result.coingeckoId,
    symbol: result.symbol,
    name: result.name,
    image: market?.image ?? result.logoUrl,
    currentPrice: market?.current_price ?? undefined,
    marketCap: market?.market_cap ?? undefined,
    marketCapRank: market?.market_cap_rank ?? undefined,
    totalVolume: market?.total_volume ?? undefined,
    priceChangePercentage24h: market?.price_change_percentage_24h ?? undefined,
  });
}

function fetchScreenerSearchResults(query: string, limit: number) {
  return Effect.gen(function* () {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [] as CoinMarketData[];

    const searchResults = yield* CoinsInternalApi.use((api) =>
      api.search({ query: trimmedQuery, limit }),
    );
    if (searchResults.length === 0) return [] as CoinMarketData[];

    const markets = yield* CoinGeckoApi.use((api) =>
      api.getMarkets({
        ids: searchResults.map((coin) => coin.coingeckoId),
        vsCurrency: "usd",
      }),
    );

    const marketById = new Map(
      markets.data.map((market) => [market.id, market] as const),
    );

    return searchResults
      .map((result) =>
        searchResultToCoinMarketData(
          result,
          marketById.get(result.coingeckoId) ?? null,
        ),
      )
      .sort((a, b) => {
        const marketCapA = a.quote.USD.market_cap ?? 0;
        const marketCapB = b.quote.USD.market_cap ?? 0;

        if (marketCapA > 0 && marketCapB > 0) {
          return marketCapB - marketCapA;
        }

        if (marketCapA > 0 && marketCapB === 0) return -1;
        if (marketCapB > 0 && marketCapA === 0) return 1;

        const rankA = a.cmc_rank ?? Number.POSITIVE_INFINITY;
        const rankB = b.cmc_rank ?? Number.POSITIVE_INFINITY;
        return rankA - rankB;
      });
  });
}

export function useScreenerSearchResults(query: string, limit = 50) {
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebounce(trimmedQuery, SEARCH_DEBOUNCE_MS);

  const queryResult = useQuery({
    queryKey: ["screener", "coin-search", debouncedQuery, limit],
    queryFn: ({ signal }) =>
      runSearchPromise(fetchScreenerSearchResults(debouncedQuery, limit), {
        signal,
      }),
    enabled: debouncedQuery.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: queryResult.data ?? [],
    isLoading: queryResult.isLoading,
    error: queryResult.error as Error | null,
  };
}
