'use client'

import { useState, useLayoutEffect, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
  isFetching: boolean
  isPlaceholderData: boolean
  /** True when interval has no chart aggregate (e.g. 2Y — same idea as chart-table N/A). */
  isChangeUnavailable: boolean
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

export function getRangeDaysFromTimeScale(timeScale: string): number {
  switch (timeScale) {
    case "1d":
      return 1
    case "7d":
      return 7
    case "30d":
      return 30
    case "max":
      return 365
    case "2y":
      // CoinGecko list charts are capped; align window with `max` fetch below.
      return 730
    default:
      return 7
  }
}

export function getBucketMsFromTimeScale(timeScale: string): number {
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
    case "2y":
      return 24 * 60 * 60 * 1000 // 1d
    default:
      return 2 * 60 * 60 * 1000 // 2h
  }
}

export function floorToBucket(timeMs: number, bucketMs: number): number {
  return Math.floor(timeMs / bucketMs) * bucketMs
}

/** Shared range end for list rows / charts so bucket windows line up. */
export function getWatchlistAggregateRangeEndMs(
  timeScale: string,
  nowMs: number = Date.now(),
): number {
  const bucketMs = getBucketMsFromTimeScale(timeScale)
  return floorToBucket(nowMs, bucketMs)
}

function toEpochSeconds(timeMs: number): number {
  return Math.floor(timeMs / 1000)
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
      case '2y': return 'max'
      default: return '7'
    }
  }

  const days = getDaysFromTimeScale(timeScale)
  const isChangeUnavailable = timeScale === '2y'
  const historicalQueryEnabled = coinIds.length > 0 && !isChangeUnavailable

  // Fetch historical market chart data for all coins in the watchlist
  const {
    data: historicalData,
    isLoading,
    isFetching,
    isPlaceholderData,
  } = useQuery<HistoricalDataResult>({
    queryKey: ['watchlist-aggregate-historical', coinIdsKey, timeScale, rangeEndTimeMs ?? 'now'],
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
    enabled: historicalQueryEnabled,
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: 60 * 60 * 1000, // 1 hour
    placeholderData: keepPreviousData,
  })

  // Aggregate historical data into a combined price line (layout effect avoids one frame of stale %).
  useLayoutEffect(() => {
    // Do not mix previous query `data` (keepPreviousData) with a new timeScale / coin set.
    if (
      isChangeUnavailable ||
      isPlaceholderData ||
      !historicalData?.data ||
      !coins.length
    ) {
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

      // Build a shared bucket timeline so series align and end together.
      // Important: don't "floor" endTime to a bucket boundary here.
      // If we floor, our start time shifts earlier than the upstream API range (CoinGecko returns last N days ending at now),
      // which can move baselines forward by up to one bucket and make returns look "off".
      const rangeDays = getRangeDaysFromTimeScale(timeScale)
      const bucketMs = getBucketMsFromTimeScale(timeScale)
      const endTimeMs = rangeEndTimeMs ?? Date.now()
      const startTimeMs = endTimeMs - rangeDays * 24 * 60 * 60 * 1000
      const bucketTimesMs = buildBucketTimesMs({ startTimeMs, endTimeMs, bucketMs })

      const sumReturnsByBucket: Array<number> = Array.from({ length: bucketTimesMs.length }, () => 0)
      const countReturnsByBucket: Array<number> = Array.from({ length: bucketTimesMs.length }, () => 0)

      // Equal-weighted portfolio return: normalize each coin to 0% at range start, then average returns.
      // This matches "if SOL is -20% and BTC is -10%, aggregate is (-20 + -10) / 2 = -15%" (equal-weight).
      for (const coinId of validCoinIds) {
        const rawSeries = coinDataMap[coinId]
        if (!rawSeries?.length) continue

        const series = [...rawSeries].sort((a, b) => a.time - b.time)
        let cursor = 0
        let lastPrice: number | null = null

        // Baseline: first known price in the returned range.
        // We assume CoinGecko's "days" range aligns with our [startTimeMs, endTimeMs] window.
        const baselinePrice = series[0]?.value && series[0].value > 0 ? series[0].value : null
        if (baselinePrice === null) continue

        for (let i = 0; i < bucketTimesMs.length; i++) {
          const bucketTimeMs = bucketTimesMs[i]!
          // CoinGecko market-chart timestamps are seconds; bucket times are ms.
          const bucketTimeSec = toEpochSeconds(bucketTimeMs)

          while (cursor < series.length && series[cursor]!.time <= bucketTimeSec) {
            lastPrice = series[cursor]!.value
            cursor++
          }

          // If we don't have a price yet for this bucket, assume it's still at baseline.
          // This keeps the aggregate denominator stable and ensures the series starts at 0%.
          const priceForBucket = lastPrice ?? baselinePrice
          const returnPct = ((priceForBucket - baselinePrice) / baselinePrice) * 100
          sumReturnsByBucket[i] = (sumReturnsByBucket[i] ?? 0) + returnPct
          countReturnsByBucket[i] = (countReturnsByBucket[i] ?? 0) + 1
        }
      }

      const percentageData: AggregateDataPoint[] = []
      let lastAggregateValue: number | null = null
      for (let i = 0; i < bucketTimesMs.length; i++) {
        const bucketTimeMs = bucketTimesMs[i]!
        const bucketTimeSec = toEpochSeconds(bucketTimeMs)
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
  }, [
    historicalData,
    coins,
    timeScale,
    rangeEndTimeMs,
    isChangeUnavailable,
    isPlaceholderData,
  ])

  // Calculate current aggregate performance for display
  const currentAggregateChange = useMemo(() => {
    return aggregateData[aggregateData.length - 1]?.value ?? 0
  }, [aggregateData])

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
    isLoading: historicalQueryEnabled ? isLoading : false,
    isFetching: historicalQueryEnabled ? isFetching : false,
    isPlaceholderData: historicalQueryEnabled ? isPlaceholderData : false,
    isChangeUnavailable,
    currentAggregateChange,
    coinsCount: coins.length,
    performance
  }
} 