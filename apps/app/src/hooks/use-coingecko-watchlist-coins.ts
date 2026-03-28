'use client'

import { useMemo } from "react"
import { useCoinGeckoQuotesBulk } from "@/hooks/use-coingecko-quotes"
import type { CoinGeckoQuoteMarketData } from "@/lib/effect/coingecko-api"

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

  const quotesQuery = useCoinGeckoQuotesBulk(stableCoinIds)

  const coins = useMemo((): CoinGeckoWatchlistCoin[] => {
    const quotesById = quotesQuery.data as Record<string, CoinGeckoQuoteMarketData> | undefined
    if (!quotesById) return []

    return stableCoinIds.map((id) => {
      const coin = quotesById[id]
      if (!coin) {
        return {
          id,
          name: id,
          symbol: "N/A",
          slug: id,
          image: "",
          cmc_rank: 0,
          circulating_supply: 0,
          max_supply: null,
          quote: {
            USD: {
              price: 0,
              percent_change_24h: 0,
              percent_change_1h: 0,
              percent_change_7d: 0,
              percent_change_30d: 0,
              market_cap: 0,
              volume_24h: 0,
            },
          },
        }
      }

      return {
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
      }
    })
  }, [quotesQuery.data, stableCoinIds])

  return {
    data: coins,
    isLoading: quotesQuery.isLoading,
    error: (quotesQuery.error as Error | null) ?? null,
    performance: { cacheHitRate: 0, apiCalls: stableCoinIds.length > 0 ? 1 : 0, totalCoins: stableCoinIds.length }
  };
} 