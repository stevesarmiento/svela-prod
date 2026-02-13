"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { CoinGeckoApi, type CoinGeckoQuoteMarketData } from "@/lib/effect/coingecko-api";
import { runPromise } from "@/lib/effect/runtime-coingecko";

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

function makeStableKeyPart(values: ReadonlyArray<string> | undefined): string {
  if (!values?.length) return ""
  const unique = Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  )
  unique.sort()
  return unique.join(",")
}

export const coingeckoQuoteQueryKeys = {
  bulk: (stableIdsKey: string) => ["coingecko-quotes", stableIdsKey] as const,
  single: (coinId: string) => ["coingecko-quote", coinId] as const,
  search: (params: CoinGeckoSearchParams) =>
    [
      "coingecko-search",
      makeStableKeyPart(params.ids),
      makeStableKeyPart(params.symbols),
      makeStableKeyPart(params.names),
      params.category ?? "",
      String(params.limit ?? 100),
    ] as const,
} as const

const COINGECKO_QUOTES_QUERY_OPTIONS = {
  staleTime: 30 * 1000, // 30 seconds
  refetchInterval: 60 * 1000, // 1 minute
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false,
} as const

function formatCoinGeckoError(error: unknown): string {
  if (error && typeof error === "object" && "_tag" in error) {
    const tagged = error as { _tag: string; message?: unknown; status?: unknown }
    if (typeof tagged.message === "string") return tagged.message
    if (typeof tagged.status === "number") return `CoinGecko request failed (${tagged.status})`
    return `CoinGecko request failed (${tagged._tag})`
  }

  return error instanceof Error ? error.message : String(error)
}

export function useCoinGeckoQuote(coinId: string | null | undefined) {
  return useQuery<CoinGeckoQuoteMarketData | null, Error>({
    queryKey: coingeckoQuoteQueryKeys.single(coinId ?? ""),
    queryFn: async (): Promise<CoinGeckoQuoteMarketData | null> => {
      if (!coinId) return null

      try {
        const result = await runPromise(CoinGeckoApi.getQuotes({ ids: [coinId] }))
        if (result.status?.error_code !== undefined && result.status.error_code !== 0) {
          throw new Error(result.status.error_message || "API error")
        }
        return result.data[coinId] ?? null
      } catch (error) {
        throw new Error(formatCoinGeckoError(error))
      }
    },
    enabled: !!coinId,
    retry: 1,
    ...COINGECKO_QUOTES_QUERY_OPTIONS,
  })
}

export function useCoinGeckoQuotesBulk(coingeckoIds: ReadonlyArray<string>) {
  const queryClient = useQueryClient()

  const stableIds = useMemo(() => {
    const unique = Array.from(new Set(coingeckoIds)).filter((id) => id.length > 0)
    unique.sort()
    return unique
  }, [coingeckoIds])

  const stableIdsKey = useMemo(() => stableIds.join(","), [stableIds])

  const query = useQuery<Record<string, CoinGeckoQuoteMarketData>, Error>({
    queryKey: coingeckoQuoteQueryKeys.bulk(stableIdsKey),
    queryFn: async (): Promise<Record<string, CoinGeckoQuoteMarketData>> => {
      if (!stableIds.length) return {}

      try {
        const result = await runPromise(CoinGeckoApi.getQuotes({ ids: stableIds }))
        if (result.status?.error_code !== undefined && result.status.error_code !== 0) {
          throw new Error(result.status.error_message || "API error")
        }
        return result.data
      } catch (error) {
        throw new Error(formatCoinGeckoError(error))
      }
    },
    enabled: stableIds.length > 0,
    retry: 1,
    ...COINGECKO_QUOTES_QUERY_OPTIONS,
  })

  useEffect(() => {
    const data = query.data
    if (!data) return

    // Keep per-coin cache warm so table → token page renders identical cached price instantly.
    for (const [id, coin] of Object.entries(data)) {
      if (!coin) continue
      queryClient.setQueryData(coingeckoQuoteQueryKeys.single(id), coin)
    }
  }, [query.data, queryClient])

  return query
}

// Original hook for backward compatibility - searches by CoinGecko IDs
export function useCoinGeckoQuotes(coingeckoIds: string[]) {
  return useCoinGeckoSearch({ ids: coingeckoIds });
}

// Enhanced hook that supports multiple search methods
export function useCoinGeckoSearch(searchParams: CoinGeckoSearchParams) {
  const { ids, symbols, names, category, limit = 100 } = searchParams;

  return useQuery<CoinGeckoQuoteData[], Error>({
    queryKey: coingeckoQuoteQueryKeys.search({ ids, symbols, names, category, limit }),
    queryFn: async (): Promise<CoinGeckoQuoteData[]> => {
      // Validate that at least one search parameter is provided OR it's a top coins request
      if (!ids?.length && !symbols?.length && !names?.length && !category && !limit) {
        return [];
      }

      try {
        const result = await runPromise(
          CoinGeckoApi.getQuotes({
            ids,
            symbols,
            names,
            category,
            limit,
          }),
        )

        if (result.status?.error_code !== undefined && result.status.error_code !== 0) {
          throw new Error(result.status.error_message || "API error")
        }

        return Object.values(result.data).map((coin: CoinGeckoQuoteMarketData): CoinGeckoQuoteData => ({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol,
          image: coin.image,
          cmc_rank: coin.market_cap_rank ?? 0,
          quote: {
            USD: {
              price: coin.current_price ?? 0,
              percent_change_24h: coin.price_change_percentage_24h ?? 0,
              percent_change_1h: coin.price_change_percentage_1h_in_currency ?? undefined,
              percent_change_7d: coin.price_change_percentage_7d_in_currency ?? undefined,
              percent_change_30d: coin.price_change_percentage_30d_in_currency ?? undefined,
              market_cap: coin.market_cap ?? 0,
              volume_24h: coin.total_volume ?? 0,
            },
          },
        }))
      } catch (error) {
        throw new Error(formatCoinGeckoError(error))
      }
    },
    enabled: true, // Always enabled - API handles the logic for top coins vs search
    retry: 1,
    ...COINGECKO_QUOTES_QUERY_OPTIONS,
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