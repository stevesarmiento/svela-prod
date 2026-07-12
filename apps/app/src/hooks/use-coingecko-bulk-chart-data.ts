'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef } from "react"
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

function alignSeriesToSharedTimeAxis(series: CoinSeries[]): CoinSeries[] {
  if (series.length <= 1) return series

  const axisSource = series.reduce((best, current) => {
    if (current.data.length > best.data.length) return current
    return best
  }, series[0]!)

  const axisTimes = axisSource.data.map((point) => point.time as number)
  const uniqueAxisTimes = Array.from(new Set(axisTimes)).sort((a, b) => a - b)
  if (uniqueAxisTimes.length === 0) return series

  return series.map((row) => {
    if (row.data.length === 0) return row

    if (row.data.length === 1) {
      const onlyValue = row.data[0]?.value ?? 0
      return {
        ...row,
        data: uniqueAxisTimes.map((time) => ({ time: time as Time, value: onlyValue })),
      }
    }

    const points = row.data
    const lastIndex = points.length - 1
    const firstTime = points[0]?.time as number | undefined
    const lastTime = points[lastIndex]?.time as number | undefined
    const firstValue = points[0]?.value ?? 0
    const lastValue = points[lastIndex]?.value ?? firstValue

    if (firstTime === undefined || lastTime === undefined) return row

    const alignedData: Array<{ time: Time; value: number }> = []
    let cursor = 0

    for (const time of uniqueAxisTimes) {
      if (time <= firstTime) {
        alignedData.push({ time: time as Time, value: firstValue })
        continue
      }

      if (time >= lastTime) {
        alignedData.push({ time: time as Time, value: lastValue })
        continue
      }

      while (cursor < lastIndex - 1 && ((points[cursor + 1]?.time as number) < time)) {
        cursor += 1
      }

      const left = points[cursor]
      const right = points[cursor + 1]
      if (!left || !right) {
        alignedData.push({ time: time as Time, value: lastValue })
        continue
      }

      const t0 = left.time as number
      const t1 = right.time as number
      if (t1 <= t0) {
        alignedData.push({ time: time as Time, value: left.value })
        continue
      }

      const ratio = (time - t0) / (t1 - t0)
      const value = left.value + ratio * (right.value - left.value)
      alignedData.push({ time: time as Time, value })
    }

    return { ...row, data: alignedData }
  })
}

export function useCoinGeckoBulkChartData(
  coins: OptimisticCoinMarketData[],
  activeTimeScale: string
): BulkChartDataResult {
  const days = TIME_SCALE_DAYS[activeTimeScale as keyof typeof TIME_SCALE_DAYS] || '7'
  
  // Filter out optimistic (loading) coins and coins without valid IDs
  const realCoins = coins.filter(coin => !coin.isOptimistic && coin.id != null)
  const coinIds = realCoins.map(coin => coin.id.toString())
  const coinMetaById = useMemo(() => {
    const map = new Map<string, { name: string; symbol: string }>()
    for (const coin of realCoins) {
      map.set(coin.id.toString(), { name: coin.name, symbol: coin.symbol })
    }
    return map
  }, [realCoins])
  
  // Bound the fast warmup polling so a permanently-stale coin (e.g. delisted)
  // can't keep the whole fan-out on a 5s loop forever.
  const fastPollCountRef = useRef(0)

  const { data, isLoading } = useQuery({
    queryKey: ['coingecko-bulk-chart', coinIds.join(','), activeTimeScale],
    queryFn: async (): Promise<{ series: CoinSeries[]; cacheHitRate: number; needsWarmup: boolean }> => {
      if (coinIds.length === 0) return { series: [], cacheHitRate: 0, needsWarmup: false }

      type SeriesWithCache = { series: CoinSeries; cached: boolean; needsWarmup: boolean }
      const swallowToNull = (_: unknown) => Effect.succeed(null)

      const fetchEffects = coinIds.map((coinId) =>
        CoinGeckoApi.getMarketChart({ coinId, days }).pipe(
          Effect.map((response): SeriesWithCache => {
            const coinMeta = coinMetaById.get(coinId)
            const prices = response.data.prices
            // Remove duplicates and ensure strict ascending order.
            // NOTE: `time` is already seconds (UTCTimestamp) from our `/api/coingecko/market-chart` route.
            const uniquePrices = new Map<number, number>()
            for (const point of prices) {
              uniquePrices.set(point.time, point.value)
            }

            const sortedUniquePrices = Array.from(uniquePrices.entries()).sort(([a], [b]) => a - b)
            const basePrice = sortedUniquePrices[0]?.[1] ?? 1

            const finalData: Array<{ time: Time; value: number }> = sortedUniquePrices.map(([time, value]) => ({
              time: time as Time,
              value: basePrice > 0 ? ((value - basePrice) / basePrice) * 100 : 0,
            }))

            return {
              cached: response.status?.cached ?? false,
              // Server schedules a background refresh when the stored series is
              // stale or thin; keep polling until it lands instead of waiting 5min.
              needsWarmup:
                (response.status?.warmupRequested ?? false) ||
                (response.status?.stale ?? false),
              series: {
                id: coinId,
                name: coinMeta?.name || "Unknown",
                symbol: coinMeta?.symbol || "UNK",
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

      const rawSeries = validResults.map((r) => r.series)
      const alignedSeries = alignSeriesToSharedTimeAxis(rawSeries)

      return {
        series: alignedSeries,
        cacheHitRate,
        needsWarmup: validResults.some((r) => r.needsWarmup),
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: (query) => {
      const result = query.state.data as
        | { series: CoinSeries[]; cacheHitRate: number; needsWarmup?: boolean }
        | undefined
      if (!result) return 2_000

      // Poll fast while any coin is warming (stale series or a background refresh
      // was just scheduled) or has insufficient points, so flat/stale lines fill
      // in within seconds instead of after the 5min interval.
      const hasSparseSeries = result.series.some((row) => (row.data?.length ?? 0) < 2)
      const warming = hasSparseSeries || (result.needsWarmup ?? false)

      if (warming && fastPollCountRef.current < 24) {
        fastPollCountRef.current += 1
        return 5_000 // ~2 minutes of fast polling max per warm cycle
      }

      fastPollCountRef.current = 0
      return 5 * 60 * 1000 // 5 minutes
    },
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