'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from "react"
import { Effect } from "effect"
import { CoinGeckoApi } from "@/lib/effect/coingecko-api"
import { runPromise } from "@/lib/effect/runtime-coingecko"

interface CoinGeckoWatchlistCoin {
  id: string; // CoinGecko string ID
  name: string;
  symbol: string;
  slug: string;
  image: string; // CoinGecko image URL
  cmc_rank: number;
  circulating_supply: number;
  max_supply: number | null;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
      market_cap: number;
      percent_change_24h: number;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
    };
  };
}

/**
 * Pure CoinGecko hook for watchlist coins - replaces useOptimizedWatchlistCoins
 */
export function useCoinGeckoWatchlistCoins(coinIds: string[]) {
  const stableCoinIds = useMemo(() => {
    const unique = Array.from(new Set(coinIds)).filter((id) => id.length > 0)
    unique.sort()
    return unique
  }, [coinIds])

  const stableCoinIdsKey = useMemo(() => stableCoinIds.join(","), [stableCoinIds])

  const { data: coins, isLoading, error } = useQuery({
    queryKey: ['coingecko-watchlist-coins', stableCoinIdsKey],
    queryFn: async (): Promise<CoinGeckoWatchlistCoin[]> => {
      if (!stableCoinIds.length) return []

      const program = CoinGeckoApi.getQuotes({ ids: stableCoinIds }).pipe(
        Effect.catchTags({
          CoinGeckoInvalidParamsError: () => Effect.succeed({ data: {} }),
          CoinGeckoUnauthorizedError: () => Effect.succeed({ data: {} }),
          CoinGeckoNotFoundError: () => Effect.succeed({ data: {} }),
          CoinGeckoRateLimitedError: () => Effect.succeed({ data: {} }),
          CoinGeckoApiError: () => Effect.succeed({ data: {} }),
          CoinGeckoDecodeError: () => Effect.succeed({ data: {} }),
        }),
      )

      const response = await runPromise(program)

      return stableCoinIds.flatMap((id) => {
        const coin = response.data[id]
        if (!coin) return []

        return [
          {
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            slug: coin.id,
            image: coin.image,
            cmc_rank: coin.market_cap_rank ?? 0,
            circulating_supply: 0,
            max_supply: null,
            quote: {
              USD: {
                price: coin.current_price ?? 0,
                percent_change_24h: coin.price_change_percentage_24h ?? 0,
                percent_change_1h: coin.price_change_percentage_1h_in_currency ?? 0,
                percent_change_7d: coin.price_change_percentage_7d_in_currency ?? 0,
                percent_change_30d: coin.price_change_percentage_30d_in_currency ?? 0,
                market_cap: coin.market_cap ?? 0,
                volume_24h: coin.total_volume ?? 0,
              },
            },
          },
        ]
      })
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: stableCoinIds.length > 0,
    retry: 1,
  });

  return {
    data: coins,
    isLoading,
    error: error as Error | null,
    performance: { cacheHitRate: 0, apiCalls: stableCoinIds.length > 0 ? 1 : 0, totalCoins: stableCoinIds.length }
  };
} 