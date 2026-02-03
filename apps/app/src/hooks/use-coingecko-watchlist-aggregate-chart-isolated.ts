'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
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

interface AggregateDataPoint {
  time: Time
  value: number // Aggregated price value
}

interface CoinHistoricalData {
  time: number
  value: number
}

interface UseCoinGeckoWatchlistAggregateChartIsolatedProps {
  coins: CoinGeckoWatchlistCoin[]
  timeScale?: string
  /**
   * Optional override to ensure multiple series share the same range end.
   * Pass a stable value (e.g. floored bucket time) to keep charts aligned.
   */
  rangeEndTimeMs?: number
}

interface CoinGeckoWatchlistAggregateIsolatedResult {
  aggregateData: AggregateDataPoint[]
  isLoading: boolean
  currentAggregateChange: number
  coinsCount: number
  performance: {
    cacheHits: number
    cacheMisses: number
    totalQueries: number
    cacheHitRate: number
  }
}

interface HistoricalDataResult {
  data: Record<string, CoinHistoricalData[]>
  performance: {
    cacheHits: number
    cacheMisses: number
    totalQueries: number
  }
}

function getRangeDaysFromTimeScale(timeScale: string): number {
  switch (timeScale) {
    case "1d":
      return 1
    case "7d":
      return 7
    case "30d":
      return 30
    case "max":
      return 365
    default:
      return 7
  }
}

function getBucketMsFromTimeScale(timeScale: string): number {
  switch (timeScale) {
    // Keep buckets coarse enough to avoid hundreds/thousands of points.
    case "1d":
      return 15 * 60 * 1000 // 15m
    case "7d":
      return 2 * 60 * 60 * 1000 // 2h
    case "30d":
      return 12 * 60 * 60 * 1000 // 12h
    case "max":
      return 24 * 60 * 60 * 1000 // 1d
    default:
      return 2 * 60 * 60 * 1000 // 2h
  }
}

function floorToBucket(timeMs: number, bucketMs: number): number {
  return Math.floor(timeMs / bucketMs) * bucketMs
}

function buildBucketTimesMs(args: {
  startTimeMs: number
  endTimeMs: number
  bucketMs: number
}): Array<number> {
  const bucketTimesMs: Array<number> = []
  for (let t = args.startTimeMs; t <= args.endTimeMs; t += args.bucketMs) {
    bucketTimesMs.push(t)
  }
  return bucketTimesMs
}

/**
 * Isolated CoinGecko watchlist aggregate chart hook that:
 * 1. Fetches historical data for all coins in the watchlist  
 * 2. Aggregates them into a combined price line
 * 3. Shows the actual combined performance over time
 */
export function useCoinGeckoWatchlistAggregateChartIsolated({ 
  coins,
  timeScale = '7d',
  rangeEndTimeMs,
}: UseCoinGeckoWatchlistAggregateChartIsolatedProps): CoinGeckoWatchlistAggregateIsolatedResult {
  const [aggregateData, setAggregateData] = useState<AggregateDataPoint[]>([])

  // Get CoinGecko IDs for fetching historical data
  const coinIds = useMemo(() => {
    const ids = coins.map(coin => coin.id)
    return ids
  }, [coins])

  const coinIdsKey = useMemo(() => {
    return [...coinIds].sort().join(',')
  }, [coinIds])

  // Convert timeScale to days for CoinGecko API
  const getDaysFromTimeScale = (scale: string): string => {
    switch (scale) {
      case '1d': return '1'
      case '7d': return '7'
      case '30d': return '30'
      case 'max': return '365'
      default: return '7'
    }
  }

  const days = getDaysFromTimeScale(timeScale)

  // Fetch historical market chart data for all coins in the watchlist
  const { data: historicalData, isLoading } = useQuery<HistoricalDataResult>({
    queryKey: ['watchlist-aggregate-historical', coinIdsKey, timeScale],
    queryFn: async () => {
      const emptyData: Record<string, CoinHistoricalData[]> = {}
      if (!coinIds.length) return { data: emptyData, performance: { cacheHits: 0, cacheMisses: 0, totalQueries: 0 } }

      try {
        const swallowToNull = (_: unknown) => Effect.succeed({ data: null, cached: false })

        const fetchEffects = coinIds.map((coinId) =>
          CoinGeckoApi.getMarketChart({ coinId, days }).pipe(
            Effect.map((response) => ({
              data: response.data,
              cached: response.status?.cached ?? false,
            })),
            Effect.catchTags({
              CoinGeckoInvalidParamsError: swallowToNull,
              CoinGeckoUnauthorizedError: swallowToNull,
              CoinGeckoNotFoundError: swallowToNull,
              CoinGeckoRateLimitedError: swallowToNull,
              CoinGeckoApiError: swallowToNull,
              CoinGeckoDecodeError: swallowToNull,
            }),
            Effect.map((result) => ({ coinId, ...result })),
          ),
        )

        const results = await runPromise(
          Effect.all(fetchEffects, {
            concurrency: 5, // Max 5 concurrent requests
            batching: false, // Don't batch requests
          }),
        )
        
        // Process results into a map of historical data
        const historicalDataMap: Record<string, CoinHistoricalData[]> = {}
        let successCount = 0
        let cacheHits = 0
        
        for (const result of results) {
          if (result.cached) cacheHits++
          const prices = result.data?.prices
          if (!Array.isArray(prices)) continue

          historicalDataMap[result.coinId] = prices.map((pricePoint: { time: number; value: number }) => ({
            time: pricePoint.time,
            value: pricePoint.value
          }))
          successCount++
        }
        
        return {
          data: historicalDataMap,
          performance: {
            cacheHits,
            cacheMisses: Math.max(0, coinIds.length - cacheHits),
            totalQueries: coinIds.length,
          }
        }
      } catch (error) {
        return { data: emptyData, performance: { cacheHits: 0, cacheMisses: 0, totalQueries: 1 } }
      }
    },
    enabled: coinIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 15 * 60 * 1000, // 15 minutes
  })

  // Aggregate historical data into a combined price line
  useEffect(() => {
    if (!historicalData?.data || !coins.length) {
      setAggregateData([])
      return
    }

    try {
      const coinDataMap = historicalData.data
      const validCoinIds = Object.keys(coinDataMap).filter(coinId => 
        coinDataMap[coinId] && coinDataMap[coinId].length > 0
      )

      if (validCoinIds.length === 0) {
        setAggregateData([])
        return
      }

      // Build a shared, deterministic bucket timeline so series align and end together.
      const rangeDays = getRangeDaysFromTimeScale(timeScale)
      const bucketMs = getBucketMsFromTimeScale(timeScale)
      const endTimeMs = floorToBucket(rangeEndTimeMs ?? Date.now(), bucketMs)
      const startTimeMs = endTimeMs - rangeDays * 24 * 60 * 60 * 1000
      const bucketTimesMs = buildBucketTimesMs({ startTimeMs, endTimeMs, bucketMs })

      const sumReturnsByBucket: Array<number> = Array.from({ length: bucketTimesMs.length }, () => 0)
      const countReturnsByBucket: Array<number> = Array.from({ length: bucketTimesMs.length }, () => 0)

      // Equal-weighted % returns: normalize each coin to 0% at range start, then average returns.
      for (const coinId of validCoinIds) {
        const rawSeries = coinDataMap[coinId]
        if (!rawSeries?.length) continue

        const series = [...rawSeries].sort((a, b) => a.time - b.time)
        let cursor = 0
        let lastPrice: number | null = null
        let baselinePrice: number | null = null

        for (let i = 0; i < bucketTimesMs.length; i++) {
          const bucketTimeMs = bucketTimesMs[i]!
          // CoinGecko market-chart timestamps are seconds; bucket times are ms.
          const bucketTimeSec = Math.floor(bucketTimeMs / 1000)

          while (cursor < series.length && series[cursor]!.time <= bucketTimeSec) {
            lastPrice = series[cursor]!.value
            cursor++
          }

          // Set baseline at the first bucket where this coin has a known price in-range.
          if (baselinePrice === null && lastPrice !== null && lastPrice > 0) {
            baselinePrice = lastPrice
          }

          if (baselinePrice === null || lastPrice === null) continue

          const returnPct = ((lastPrice - baselinePrice) / baselinePrice) * 100
          sumReturnsByBucket[i] = (sumReturnsByBucket[i] ?? 0) + returnPct
          countReturnsByBucket[i] = (countReturnsByBucket[i] ?? 0) + 1
        }
      }

      const percentageData: AggregateDataPoint[] = []
      let lastAggregateValue: number | null = null
      for (let i = 0; i < bucketTimesMs.length; i++) {
        const bucketTimeMs = bucketTimesMs[i]!
        const bucketTimeSec = Math.floor(bucketTimeMs / 1000)
        const count = countReturnsByBucket[i] ?? 0

        if (count > 0) {
          const value = (sumReturnsByBucket[i] ?? 0) / count
          lastAggregateValue = value
          percentageData.push({ time: bucketTimeSec as Time, value })
          continue
        }

        // Keep the series continuous so crosshair markers don't blink.
        percentageData.push({
          time: bucketTimeSec as Time,
          value: lastAggregateValue ?? 0,
        })
      }

      setAggregateData(percentageData)
    } catch (error) {
      console.error('Error processing watchlist aggregate data:', error)
      setAggregateData([])
    }
  }, [historicalData, coins, timeScale, rangeEndTimeMs])

  // Calculate current aggregate performance for display
  const currentAggregateChange = useMemo(() => {
    if (!coins.length) return 0
    
    const totalChange = coins.reduce((sum, coin) => sum + coin.quote.USD.percent_change_24h, 0)
    return totalChange / coins.length
  }, [coins])

  const performance = useMemo(() => {
    if (!historicalData?.performance) return { cacheHits: 0, cacheMisses: 0, totalQueries: 0, cacheHitRate: 0 }
    
    const { cacheHits, cacheMisses, totalQueries } = historicalData.performance
    return {
      cacheHits,
      cacheMisses,
      totalQueries,
      cacheHitRate: totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0
    }
  }, [historicalData])

  return {
    aggregateData,
    isLoading,
    currentAggregateChange,
    coinsCount: coins.length,
    performance
  }
} 