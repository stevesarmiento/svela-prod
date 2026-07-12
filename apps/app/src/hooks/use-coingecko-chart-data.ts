'use client'

import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
import type { CoinMarketData } from '@/types/coins'
import { Effect } from "effect"
import { CoinGeckoApi } from "@/lib/effect/coingecko-api"
import { runPromise } from "@/lib/effect/runtime-coingecko"
import { useCoinGeckoQuote } from './use-coingecko-quotes'

// Map time scales to optimal CoinGecko parameters
// Strategy: ≤90 days = prefer OHLC+volume for real candlesticks, >90 days = prefer market-chart for better granularity
const TIMEFRAME_CONFIG = {
  '1d': { days: '1' },     // Short: use OHLC + market-chart
  '7d': { days: '7' },     // Short: use OHLC + market-chart  
  '30d': { days: '90' },   // 1M view: show 1Q (90d)
  'max': { days: '365' },  // Long: prefer market-chart (daily vs OHLC's ~weekly)
  '2y': { days: 'max' }    // 2Y: max available (server caps to ~5y)
} as const

// API Response Interfaces
interface OHLCDataPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

interface OHLCAPIResponse {
  readonly data: ReadonlyArray<OHLCDataPoint>
  readonly cached?: boolean
  readonly status?: {
    readonly cached?: boolean
    readonly stale?: boolean
    readonly warmupRequested?: boolean
    readonly points?: number
    readonly lastUpdated?: number
  }
}

interface MarketChartPoint {
  time: number
  value: number
}

interface MarketChartAPIResponse {
  readonly data: {
    prices: ReadonlyArray<MarketChartPoint>
    volumes: ReadonlyArray<MarketChartPoint>
    market_caps: ReadonlyArray<MarketChartPoint>
  }
  readonly status?: {
    readonly cached?: boolean
    readonly stale?: boolean
    readonly warmupRequested?: boolean
    readonly points?: number
    readonly lastUpdated?: number
  }
}

interface ParsedChartData {
  lineChart: Array<{ time: Time; value: number }>
  volumeChart: Array<{ time: Time; value: number; color: string }>
  ohlcData: Array<{ time: Time; open: number; high: number; low: number; close: number }> // For tooltip
}

interface DataSourceResult {
  data: ParsedChartData | null
  source: 'ohlc' | 'market-chart' | 'fallback'
  cached: boolean
  stale?: boolean
  warmupRequested?: boolean
  points?: number
  lastUpdated?: number
  error?: string
}

interface CoinGeckoChartDataResult {
  chartData: Array<{ time: Time; value: number }>
  volumeData: Array<{ time: Time; value: number; color: string }>
  ohlcData: Array<{ time: Time; open: number; high: number; low: number; close: number }> // For tooltip
  isLoading: boolean
  /**
   * When true, the server told us it’s returning cached/stale data and has scheduled a warmup.
   * This should NOT necessarily block rendering if we already have a usable series.
   */
  isWarmingUp: boolean
  isStale: boolean
  tokenData: null
  performance: {
    dataSource: 'ohlc' | 'market-chart' | 'fallback'
    cached: boolean
    cacheHitRate: number
    dataPoints: number
  }
}

interface UseCoinGeckoChartDataOptions {
  /**
   * Prefer `/market-chart` over `/ohlc` when both are available.
   * Useful for tiny spark charts where maximum granularity matters.
   */
  preferMarketChart?: boolean
}

const LATEST_POINT_UPSERT_WINDOW_SECONDS = 5 * 60

const OHLC_SUPPORTED_DAYS = new Set(['1', '7', '14', '30', '90', '180', '365', 'max'])

function isOhlcSupportedDays(days: string): boolean {
  return OHLC_SUPPORTED_DAYS.has(days)
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function estimateAverageIntervalSeconds(epochSeconds: number[]): number | null {
  if (epochSeconds.length < 2) return null
  const sorted = epochSeconds.slice().sort((a, b) => a - b)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const span = last - first
  if (span <= 0) return null
  return span / (sorted.length - 1)
}

function pickMarketChartBucketSeconds(args: {
  activeTimeScale: string
  prices: ReadonlyArray<MarketChartPoint>
}): number {
  if (args.activeTimeScale === '30d') return 4 * 60 * 60 // 4h bars for 1M (=90d window)
  if (args.activeTimeScale === 'max') return 24 * 60 * 60 // daily bars for 1Y

  if (args.activeTimeScale === '2y') {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    let count = 0
    for (const p of args.prices) {
      const t = Number(p.time)
      if (!Number.isFinite(t)) continue
      count++
      if (t < min) min = t
      if (t > max) max = t
    }
    if (count < 2 || !Number.isFinite(min) || !Number.isFinite(max)) return 24 * 60 * 60
    const spanDays = (max - min) / (24 * 60 * 60)
    return spanDays > 900 ? 30 * 24 * 60 * 60 : 24 * 60 * 60 // monthly for long history
  }

  // Default: keep it fairly granular.
  return 60 * 60
}

function bucketizeMarketChart(args: {
  prices: ReadonlyArray<MarketChartPoint>
  volumes: ReadonlyArray<MarketChartPoint>
  bucketSeconds: number
}): ParsedChartData | null {
  const pricePoints = args.prices
    .map((point) => {
      const time = Math.floor(Number(point.time))
      const value = Number(point.value ?? 0)
      if (!Number.isFinite(time)) return null
      if (!Number.isFinite(value) || value <= 0) return null
      return { time, value }
    })
    .filter((p): p is { time: number; value: number } => p !== null)
    .sort((a, b) => a.time - b.time)

  if (pricePoints.length < 2) return null

  const bucketSeconds = Math.max(60, Math.floor(args.bucketSeconds))
  const priceBuckets = new Map<
    number,
    {
      time: Time
      open: number
      high: number
      low: number
      close: number
    }
  >()

  for (const p of pricePoints) {
    const bucketStart = Math.floor(p.time / bucketSeconds) * bucketSeconds
    const existing = priceBuckets.get(bucketStart)
    if (!existing) {
      priceBuckets.set(bucketStart, {
        time: bucketStart as Time,
        open: p.value,
        high: p.value,
        low: p.value,
        close: p.value,
      })
      continue
    }

    existing.high = Math.max(existing.high, p.value)
    existing.low = Math.min(existing.low, p.value)
    existing.close = p.value
  }

  const volumeBuckets = new Map<number, number>()
  for (const point of args.volumes) {
    const time = Math.floor(Number(point.time))
    const value = Number(point.value ?? 0)
    if (!Number.isFinite(time)) continue
    if (!Number.isFinite(value) || value < 0) continue
    const bucketStart = Math.floor(time / bucketSeconds) * bucketSeconds
    volumeBuckets.set(bucketStart, (volumeBuckets.get(bucketStart) ?? 0) + value)
  }

  const ohlcBars = Array.from(priceBuckets.entries())
    .map(([bucketStart, bar]) => ({
      ...bar,
      volume: volumeBuckets.get(bucketStart) ?? 0,
    }))
    .sort((a, b) => Number(a.time) - Number(b.time))
  const ohlcData = ohlcBars.map((bar) => ({
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }))

  return {
    lineChart: ohlcData.map((bar) => ({ time: bar.time, value: bar.close })),
    volumeChart: ohlcBars.map((bar) => ({ time: bar.time, value: bar.volume, color: 'oklch(1 0 0 / 0.251)' })),
    ohlcData,
  }
}

/**
 * Parse OHLC data from /api/coingecko/ohlc route
 */
function parseOHLCData(data: OHLCAPIResponse): ParsedChartData | null {
  if (!data?.data || !Array.isArray(data.data) || data.data.length === 0) {
    return null
  }

  try {
    const ohlcPoints = data.data.map((point: OHLCDataPoint) => ({
      time: Math.floor(point.timestamp / 1000) as Time,
      open: point.open ?? point.close ?? 0,
      high: point.high ?? point.close ?? 0,
      low: point.low ?? point.close ?? 0,
      close: point.close ?? 0,
    }))
    ohlcPoints.sort((a, b) => Number(a.time) - Number(b.time))

    // Generate line chart from close prices
    const lineChart = ohlcPoints.map((point: { time: Time; open: number; high: number; low: number; close: number }) => ({
      time: point.time,
      value: point.close
    }))

    // Generate volume data (OHLC doesn't include volume, so create placeholder)
    const volumeChart = ohlcPoints.map((point: { time: Time; open: number; high: number; low: number; close: number }) => ({
      time: point.time,
      value: 0, // OHLC route doesn't provide volume
      color: 'oklch(1 0 0 / 0.251)'
    }))

    return {
      lineChart,
      volumeChart,
      ohlcData: ohlcPoints // Real OHLC data for tooltip
    }
  } catch (error) {
    console.error('Failed to parse OHLC data:', error)
    return null
  }
}

/**
 * Parse market chart data from /api/coingecko/market-chart route
 */
function parseMarketChartData(data: MarketChartAPIResponse, activeTimeScale: string): ParsedChartData | null {
  if (!data?.data || !data.data.prices || !Array.isArray(data.data.prices)) {
    return null
  }

  try {
    const { prices, volumes = [] } = data.data
    const bucketSeconds = pickMarketChartBucketSeconds({ activeTimeScale, prices })
    return bucketizeMarketChart({ prices, volumes, bucketSeconds })
  } catch (error) {
    console.error('Failed to parse market chart data:', error)
    return null
  }
}

/**
 * Generate fallback data when both API routes fail
 */
function generateFallbackData(
  coinId: string,
  timeframe: string,
  initialData: CoinMarketData['quote']['USD']
): ParsedChartData {
  const config = TIMEFRAME_CONFIG[timeframe as keyof typeof TIMEFRAME_CONFIG] || TIMEFRAME_CONFIG['7d']
  const days = Number.parseInt(config.days, 10)
  const safeDays = Number.isFinite(days) && days > 0 ? days : 365
  // Ensure at least 2 points so tiny charts don't render "No data".
  const dataPoints = Math.max(2, Math.min(safeDays, 90)) // Limit fallback data points
  const basePrice = initialData?.price

  // If we don't have a real price to anchor on, return empty data (no fake charting).
  if (!basePrice || basePrice <= 0) {
    return { lineChart: [], volumeChart: [], ohlcData: [] }
  }

  const fallbackPoints = Array.from({ length: dataPoints }, (_, i) => {
    const time = ((Date.now() - (dataPoints - i) * 24 * 60 * 60 * 1000) / 1000) as Time
    return {
      time,
      price: basePrice,
      volume: 0,
      open: basePrice,
      high: basePrice,
      low: basePrice,
      close: basePrice,
    }
  })

  const lineChart = fallbackPoints.map(p => ({ time: p.time, value: p.price }))
  const volumeChart = fallbackPoints.map(p => ({ time: p.time, value: p.volume, color: 'oklch(1 0 0 / 0.251)' }))
  const ohlcData = fallbackPoints.map(p => ({ 
    time: p.time, 
    open: p.open, 
    high: p.high, 
    low: p.low, 
    close: p.close 
  }))

  return { lineChart, volumeChart, ohlcData }
}

/**
 * Combine real OHLC data with real volume data from market-chart
 */
function combineOHLCWithVolume(
  ohlcData: OHLCAPIResponse, 
  marketData: MarketChartAPIResponse
): ParsedChartData | null {
  if (!ohlcData?.data || !marketData?.data?.prices || !marketData?.data?.volumes) {
    return null
  }

  try {
    // Parse real OHLC data
    const ohlcPoints = ohlcData.data.map((point: OHLCDataPoint) => ({
      time: Math.floor(point.timestamp / 1000) as Time,
      open: point.open || 0,
      high: point.high || 0,
      low: point.low || 0,
      close: point.close || 0
    }))

    // Parse real volume data
    const volumePoints = marketData.data.volumes.map((point: MarketChartPoint) => ({
      time: point.time as Time,
      value: point.value || 0,
      color: 'oklch(1 0 0 / 0.251)'
    }))

    if (ohlcPoints.length < 2) return null

    // Generate line chart from OHLC close prices
    const lineChart = ohlcPoints.map(point => ({
      time: point.time,
      value: point.close
    }))

    return {
      lineChart,
      volumeChart: volumePoints,
      ohlcData: ohlcPoints // Real OHLC data for tooltip
    }
  } catch (error) {
    console.error('Failed to combine OHLC with volume data:', error)
    return null
  }
}

function toEpochSeconds(time: Time): number | null {
  if (typeof time === 'number') return time > 1e10 ? Math.floor(time / 1000) : Math.floor(time)
  if (typeof time === 'string') {
    const parsed = Date.parse(time)
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
  }
  return null
}

function upsertLatestPricePoint(parsedData: ParsedChartData, latestPrice: number, latestTimestampSeconds: number): ParsedChartData {
  if (!Number.isFinite(latestPrice) || latestPrice <= 0) return parsedData

  const lastLinePoint = parsedData.lineChart[parsedData.lineChart.length - 1]
  const lastSeconds = lastLinePoint ? toEpochSeconds(lastLinePoint.time) : null
  const nextTime = latestTimestampSeconds as Time

  // No history yet; seed a single point with the latest quote.
  if (parsedData.lineChart.length === 0 || lastSeconds == null) {
    return {
      lineChart: [{ time: nextTime, value: latestPrice }],
      volumeChart: [{ time: nextTime, value: 0, color: 'oklch(1 0 0 / 0.251)' }],
      ohlcData: [{ time: nextTime, open: latestPrice, high: latestPrice, low: latestPrice, close: latestPrice }],
    }
  }

  // If we already have a very recent bar, update it instead of appending.
  if (Math.abs(latestTimestampSeconds - lastSeconds) <= LATEST_POINT_UPSERT_WINDOW_SECONDS) {
    const lineChart = parsedData.lineChart.slice()
    lineChart[lineChart.length - 1] = { time: nextTime, value: latestPrice }

    const ohlcData = parsedData.ohlcData.slice()
    if (ohlcData.length > 0) {
      const prev = ohlcData[ohlcData.length - 1]!
      const open = Number.isFinite(prev.open) && prev.open > 0 ? prev.open : latestPrice
      const high = Number.isFinite(prev.high) ? Math.max(prev.high, latestPrice) : latestPrice
      const low = Number.isFinite(prev.low) ? Math.min(prev.low, latestPrice) : latestPrice

      ohlcData[ohlcData.length - 1] = { time: nextTime, open, high, low, close: latestPrice }
    }

    return {
      lineChart,
      volumeChart: parsedData.volumeChart,
      ohlcData,
    }
  }

  // Otherwise append a new point so startup always reflects the latest quote.
  return {
    lineChart: [...parsedData.lineChart, { time: nextTime, value: latestPrice }],
    volumeChart: [...parsedData.volumeChart, { time: nextTime, value: 0, color: 'oklch(1 0 0 / 0.251)' }],
    ohlcData: [
      ...parsedData.ohlcData,
      { time: nextTime, open: latestPrice, high: latestPrice, low: latestPrice, close: latestPrice },
    ],
  }
}

export async function fetchCoinGeckoCombinedChartData(args: {
  coinId: string
  activeTimeScale: string
  initialData: CoinMarketData['quote']['USD']
  preferMarketChart?: boolean
}): Promise<DataSourceResult> {
  const config =
    TIMEFRAME_CONFIG[args.activeTimeScale as keyof typeof TIMEFRAME_CONFIG] ||
    TIMEFRAME_CONFIG['7d']
  const preferMarketChart = args.preferMarketChart ?? false
  let primaryResult: DataSourceResult | null = null

  try {
    const numericDays = Number.parseInt(config.days, 10)
    const shouldPreferMarketChart =
      preferMarketChart ||
      args.activeTimeScale === '30d' ||
      args.activeTimeScale === '2y' ||
      !Number.isFinite(numericDays) ||
      numericDays > 90
    const swallowToNull = (_: unknown) => Effect.succeed(null)

    const marketEffect = CoinGeckoApi.getMarketChart({
      coinId: args.coinId,
      days: config.days,
      vsCurrency: "usd",
    }).pipe(
      Effect.catchTags({
        CoinGeckoInvalidParamsError: swallowToNull,
        CoinGeckoUnauthorizedError: swallowToNull,
        CoinGeckoNotFoundError: swallowToNull,
        CoinGeckoRateLimitedError: swallowToNull,
        CoinGeckoApiError: swallowToNull,
        CoinGeckoDecodeError: swallowToNull,
      }),
    )

    if (shouldPreferMarketChart) {
      const marketResult = await runPromise(marketEffect)
      if (marketResult) {
        const parsedMarket = parseMarketChartData(marketResult, args.activeTimeScale)
        if (parsedMarket) {
          primaryResult = {
            data: parsedMarket,
            source: 'market-chart',
            cached: marketResult.status?.cached || false,
            stale: marketResult.status?.stale,
            warmupRequested: marketResult.status?.warmupRequested,
            points: marketResult.status?.points,
            lastUpdated: marketResult.status?.lastUpdated,
          }
        }
      }

      const allowOhlcFallback =
        args.activeTimeScale !== '30d' &&
        args.activeTimeScale !== 'max' &&
        args.activeTimeScale !== '2y' &&
        isOhlcSupportedDays(config.days)

      if (!primaryResult && allowOhlcFallback) {
        const ohlcEffect = CoinGeckoApi.getOHLC({
          coinId: args.coinId,
          days: config.days,
          vsCurrency: "usd",
        }).pipe(
          Effect.catchTags({
            CoinGeckoInvalidParamsError: swallowToNull,
            CoinGeckoUnauthorizedError: swallowToNull,
            CoinGeckoNotFoundError: swallowToNull,
            CoinGeckoRateLimitedError: swallowToNull,
            CoinGeckoApiError: swallowToNull,
            CoinGeckoDecodeError: swallowToNull,
          }),
        )

        const ohlcResult = await runPromise(ohlcEffect)
        if (ohlcResult) {
          const parsedOHLC = parseOHLCData(ohlcResult)
          if (parsedOHLC) {
            primaryResult = {
              data: parsedOHLC,
              source: 'ohlc',
              cached: ohlcResult.cached || ohlcResult.status?.cached || false,
              stale: ohlcResult.status?.stale,
              warmupRequested: ohlcResult.status?.warmupRequested,
              points: ohlcResult.status?.points,
              lastUpdated: ohlcResult.status?.lastUpdated,
            }
          }
        }
      }
    } else {
      const ohlcEffect = CoinGeckoApi.getOHLC({
        coinId: args.coinId,
        days: config.days,
        vsCurrency: "usd",
      }).pipe(
        Effect.catchTags({
          CoinGeckoInvalidParamsError: swallowToNull,
          CoinGeckoUnauthorizedError: swallowToNull,
          CoinGeckoNotFoundError: swallowToNull,
          CoinGeckoRateLimitedError: swallowToNull,
          CoinGeckoApiError: swallowToNull,
          CoinGeckoDecodeError: swallowToNull,
        }),
      )

      const [ohlcResult, marketResult] = await runPromise(
        Effect.all([ohlcEffect, marketEffect], { concurrency: "unbounded" }),
      )

      if (ohlcResult && marketResult) {
        const combined = combineOHLCWithVolume(ohlcResult, marketResult)
        if (combined) {
          primaryResult = {
            data: combined,
            source: 'ohlc',
            cached:
              ohlcResult.cached ||
              ohlcResult.status?.cached ||
              marketResult.status?.cached ||
              false,
            stale: Boolean(ohlcResult.status?.stale || marketResult.status?.stale),
            warmupRequested: Boolean(
              ohlcResult.status?.warmupRequested || marketResult.status?.warmupRequested,
            ),
            points:
              typeof marketResult.status?.points === "number"
                ? marketResult.status.points
                : typeof ohlcResult.status?.points === "number"
                  ? ohlcResult.status.points
                  : undefined,
            lastUpdated:
              typeof marketResult.status?.lastUpdated === "number"
                ? marketResult.status.lastUpdated
                : typeof ohlcResult.status?.lastUpdated === "number"
                  ? ohlcResult.status.lastUpdated
                  : undefined,
          }
        }
      } else if (marketResult) {
        const parsedMarket = parseMarketChartData(marketResult, args.activeTimeScale)
        if (parsedMarket) {
          primaryResult = {
            data: parsedMarket,
            source: 'market-chart',
            cached: marketResult.status?.cached || false,
            stale: marketResult.status?.stale,
            warmupRequested: marketResult.status?.warmupRequested,
            points: marketResult.status?.points,
            lastUpdated: marketResult.status?.lastUpdated,
          }
        }
      } else if (ohlcResult) {
        const parsedOHLC = parseOHLCData(ohlcResult)
        if (parsedOHLC) {
          primaryResult = {
            data: parsedOHLC,
            source: 'ohlc',
            cached: ohlcResult.cached || ohlcResult.status?.cached || false,
            stale: ohlcResult.status?.stale,
            warmupRequested: ohlcResult.status?.warmupRequested,
            points: ohlcResult.status?.points,
            lastUpdated: ohlcResult.status?.lastUpdated,
          }
        }
      }
    }

    if (primaryResult) return primaryResult

    return {
      data: generateFallbackData(args.coinId, args.activeTimeScale, args.initialData),
      source: 'fallback',
      cached: false,
    }
  } catch (error) {
    return {
      data: generateFallbackData(args.coinId, args.activeTimeScale, args.initialData),
      source: 'fallback',
      cached: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export function useCoinGeckoChartData(
  coinId: string,
  activeTimeScale: string,
  initialData: CoinMarketData['quote']['USD'],
  options?: UseCoinGeckoChartDataOptions
): CoinGeckoChartDataResult {
  const quoteQuery = useCoinGeckoQuote(coinId)
  const preferMarketChart = options?.preferMarketChart ?? false

  // Bound the fast warmup polling so a series that can't heal (e.g. delisted
  // coin) doesn't pin this hook at 5s forever.
  const fastPollCountRef = useRef(0)

  // Fetch data from both routes with intelligent prioritization
  const { data: combinedData, isLoading } = useQuery({
    queryKey: ['coingecko-combined-chart-data', coinId, activeTimeScale, preferMarketChart],
    queryFn: async (): Promise<DataSourceResult> =>
      await fetchCoinGeckoCombinedChartData({
        coinId,
        activeTimeScale,
        initialData,
        preferMarketChart,
      }),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: (query) => {
      const points = query.state.data?.data?.lineChart?.length ?? 0
      const warmupRequested = Boolean(query.state.data?.warmupRequested)
      // When warmup is in-flight, poll quickly so token pages don't stay empty.
      if ((points < 2 || warmupRequested) && fastPollCountRef.current < 24) {
        fastPollCountRef.current += 1
        return 5_000 // ~2 minutes of fast polling max per warm cycle
      }
      fastPollCountRef.current = 0
      return 5 * 60 * 1000
    },
    enabled: !!coinId,
    retry: 1, // Don't retry too much, fallback handles failures
  })

  // Extract parsed data with better fallback logic
  let parsedData: ParsedChartData;
  let dataSource: 'ohlc' | 'market-chart' | 'fallback' = 'fallback';
  let cached = false;

  if (combinedData?.data) {
    // We have real data from API
    parsedData = combinedData.data;
    dataSource = combinedData.source;
    cached = combinedData.cached;
  } else if (combinedData?.error) {
    // Only generate fallback data if we have some initial pricing data to work with
    if (initialData?.price && initialData.price > 0) {
      parsedData = generateFallbackData(coinId, activeTimeScale, initialData);
    } else {
      // Return empty data instead of fake data
      parsedData = {
        lineChart: [],
        volumeChart: [],
        ohlcData: []
      };
    }
  } else if (isLoading) {
    // Still loading - return empty data
    parsedData = {
      lineChart: [],
      volumeChart: [],
      ohlcData: []
    };
  } else {
    // No data and not loading - only use fallback if we have valid initial data
    if (initialData?.price && initialData.price > 0) {
      parsedData = generateFallbackData(coinId, activeTimeScale, initialData);
    } else {
      parsedData = {
        lineChart: [],
        volumeChart: [],
        ohlcData: []
      };
    }
  }

  const dataWithLatestQuote = useMemo(() => {
    const latestPrice = quoteQuery.data?.current_price
    if (!latestPrice || latestPrice <= 0) return parsedData

    const quoteTimeMs = quoteQuery.data?.last_updated ? Date.parse(quoteQuery.data.last_updated) : Number.NaN
    const latestTimestampSeconds = Number.isFinite(quoteTimeMs)
      ? Math.floor(quoteTimeMs / 1000)
      : Math.floor(Date.now() / 1000)

    return upsertLatestPricePoint(parsedData, latestPrice, latestTimestampSeconds)
  }, [parsedData, quoteQuery.data?.current_price, quoteQuery.data?.last_updated])

  const serverPoints = combinedData?.points ?? combinedData?.data?.lineChart?.length ?? null
  const isStale = Boolean(combinedData?.stale)
  const isWarmingUp = Boolean(combinedData?.warmupRequested)

  return {
    chartData: dataWithLatestQuote.lineChart,
    volumeData: dataWithLatestQuote.volumeChart,
    ohlcData: dataWithLatestQuote.ohlcData, // OHLC data for tooltip
    isLoading,
    isWarmingUp: isWarmingUp || (typeof serverPoints === "number" ? serverPoints < 2 : false),
    isStale,
    tokenData: null,
    performance: {
      dataSource,
      cached,
      cacheHitRate: cached ? 100 : 0,
      dataPoints: dataWithLatestQuote.lineChart.length
    }
  }
}
