'use client'

import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
import type { CoinMarketData } from '@/types/coins'
import { Effect } from "effect"
import { CoinGeckoApi } from "@/lib/effect/coingecko-api"
import { runPromise } from "@/lib/effect/runtime-coingecko"

// Map time scales to CoinGecko days parameter
const TIME_SCALE_DAYS = {
  '1d': '1',
  '7d': '7',
  '30d': '30', 
  'max': '365',
  '2y': '730'
}

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

interface CoinSeries {
  id: string
  name: string
  symbol: string
  color?: string
  data: Array<{ time: Time; value: number }>
}

interface BulkChartDataResult {
  series: CoinSeries[]
  isLoading: boolean
  performance: {
    bulkApiCalls: number
    cacheHitRate: number
  }
}

export function useCoinGeckoBulkChartData(
  coins: OptimisticCoinMarketData[],
  activeTimeScale: string
): BulkChartDataResult {
  const days = TIME_SCALE_DAYS[activeTimeScale as keyof typeof TIME_SCALE_DAYS] || '7'
  
  // Filter out optimistic (loading) coins and coins without valid IDs
  const realCoins = coins.filter(coin => !coin.isOptimistic && coin.id != null)
  const coinIds = realCoins.map(coin => coin.id.toString())
  
  const { data, isLoading } = useQuery({
    queryKey: ['coingecko-bulk-chart', coinIds.join(','), activeTimeScale],
    queryFn: async (): Promise<{ series: CoinSeries[]; cacheHitRate: number }> => {
      if (coinIds.length === 0) return { series: [], cacheHitRate: 0 }

      type SeriesWithCache = { series: CoinSeries; cached: boolean }
      const swallowToNull = (_: unknown) => Effect.succeed(null)

      const fetchEffects = coinIds.map((coinId) =>
        CoinGeckoApi.getMarketChart({ coinId, days }).pipe(
          Effect.map((response): SeriesWithCache => {
            const coin = realCoins.find((c) => c.id.toString() === coinId)
            const prices = response.data.prices
            const basePrice = prices[0]?.value || 1

            const percentageData = prices.map((point) => ({
              time: point.time as Time,
              value: basePrice > 0 ? ((point.value - basePrice) / basePrice) * 100 : 0,
            }))

            // Remove duplicates and ensure strict ascending order.
            const uniqueData = new Map<number, { time: Time; value: number }>()
            for (const point of percentageData) {
              uniqueData.set(point.time as number, point)
            }

            const sortedUniqueData = Array.from(uniqueData.values()).sort(
              (a, b) => (a.time as number) - (b.time as number),
            )

            const finalData = sortedUniqueData.filter((point, index, array) => {
              if (index === 0) return true
              return (point.time as number) > (array[index - 1]?.time as number ?? 0)
            })

            return {
              cached: response.status?.cached ?? false,
              series: {
                id: coinId,
                name: coin?.name || "Unknown",
                symbol: coin?.symbol || "UNK",
                data: finalData,
              },
            }
          }),
          Effect.catchTags({
            CoinGeckoInvalidParamsError: swallowToNull,
            CoinGeckoUnauthorizedError: swallowToNull,
            CoinGeckoNotFoundError: swallowToNull,
            CoinGeckoRateLimitedError: swallowToNull,
            CoinGeckoApiError: swallowToNull,
            CoinGeckoDecodeError: swallowToNull,
          }),
        ),
      )

      const results = await runPromise(
        Effect.all(fetchEffects, {
          concurrency: 5,
          batching: false,
        }),
      )

      const validResults = results.filter((result): result is SeriesWithCache => result !== null)
      const cacheHits = validResults.filter((r) => r.cached).length
      const cacheHitRate = coinIds.length > 0 ? (cacheHits / coinIds.length) * 100 : 0

      return {
        series: validResults.map((r) => r.series),
        cacheHitRate,
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: coinIds.length > 0,
    retry: 1, // Limited retry for bulk operations
  })

  const seriesData = data?.series ?? []
  const cacheHitRate = data?.cacheHitRate ?? 0

  return {
    series: seriesData,
    isLoading,
    performance: {
      bulkApiCalls: coinIds.length,
      cacheHitRate
    }
  }
} 