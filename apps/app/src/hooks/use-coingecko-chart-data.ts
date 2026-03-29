'use client'

import { useMemo } from 'react'
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
  '30d': { days: '90' },   // 30-day focus with 90 days context: use OHLC + market-chart
  'max': { days: '365' },  // Long: prefer market-chart (daily vs OHLC's ~weekly)
  '2y': { days: '1825' }   // Long: prefer market-chart (daily vs OHLC's sparse data)
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
  error?: string
}

interface CoinGeckoChartDataResult {
  chartData: Array<{ time: Time; value: number }>
  volumeData: Array<{ time: Time; value: number; color: string }>
  ohlcData: Array<{ time: Time; open: number; high: number; low: number; close: number }> // For tooltip
  isLoading: boolean
  tokenData: null
  performance: {
    dataSource: 'ohlc' | 'market-chart' | 'fallback'
    cached: boolean
    cacheHitRate: number
    dataPoints: number
  }
}

const LATEST_POINT_UPSERT_WINDOW_SECONDS = 5 * 60

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
      open: point.open || 0,
      high: point.high || 0,
      low: point.low || 0,
      close: point.close || 0
    }))

    // Generate line chart from close prices
    const lineChart = ohlcPoints.map((point: { time: Time; open: number; high: number; low: number; close: number }) => ({
      time: point.time,
      value: point.close
    }))

    // Generate volume data (OHLC doesn't include volume, so create placeholder)
    const volumeChart = ohlcPoints.map((point: { time: Time; open: number; high: number; low: number; close: number }) => ({
      time: point.time,
      value: 0, // OHLC route doesn't provide volume
      color: '#ffffff40'
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
function parseMarketChartData(data: MarketChartAPIResponse): ParsedChartData | null {
  if (!data?.data || !data.data.prices || !Array.isArray(data.data.prices)) {
    return null
  }

  try {
    const { prices, volumes = [] } = data.data

    // Parse line chart data
    const lineChart = prices.map((point: MarketChartPoint) => ({
      time: Math.floor(point.time) as Time,
      value: point.value || 0
    }))

    // Parse volume data
    const volumeChart = volumes.map((point: MarketChartPoint) => ({
      time: point.time as Time,
      value: point.value || 0,
      color: '#ffffff40'
    }))

    // Generate simple OHLC data from line chart for tooltip (no synthetic candlesticks)
    const ohlcData = lineChart.map((point: { time: Time; value: number }) => {
      const price = point.value
      
      return {
        time: point.time,
        open: price,
        high: price,
        low: price,
        close: price
      }
    })

    return {
      lineChart,
      volumeChart,
      ohlcData // Simple OHLC for tooltip (all values = current price)
    }
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
  const days = Number.parseInt(config.days)
  // Ensure at least 2 points so tiny charts don't render "No data".
  const dataPoints = Math.max(2, Math.min(days, 90)) // Limit fallback data points
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
  const volumeChart = fallbackPoints.map(p => ({ time: p.time, value: p.volume, color: '#ffffff40' }))
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
      color: '#ffffff40'
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
      volumeChart: [{ time: nextTime, value: 0, color: '#ffffff40' }],
      ohlcData: [{ time: nextTime, open: latestPrice, high: latestPrice, low: latestPrice, close: latestPrice }],
    }
  }

  // If we already have a very recent bar, update it instead of appending.
  if (Math.abs(latestTimestampSeconds - lastSeconds) <= LATEST_POINT_UPSERT_WINDOW_SECONDS) {
    const lineChart = parsedData.lineChart.slice()
    lineChart[lineChart.length - 1] = { time: nextTime, value: latestPrice }

    const ohlcData = parsedData.ohlcData.slice()
    if (ohlcData.length > 0) {
      ohlcData[ohlcData.length - 1] = {
        time: nextTime,
        open: latestPrice,
        high: latestPrice,
        low: latestPrice,
        close: latestPrice,
      }
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
    volumeChart: [...parsedData.volumeChart, { time: nextTime, value: 0, color: '#ffffff40' }],
    ohlcData: [
      ...parsedData.ohlcData,
      { time: nextTime, open: latestPrice, high: latestPrice, low: latestPrice, close: latestPrice },
    ],
  }
}

export function useCoinGeckoChartData(
  coinId: string,
  activeTimeScale: string,
  initialData: CoinMarketData['quote']['USD']
): CoinGeckoChartDataResult {
  const config = TIMEFRAME_CONFIG[activeTimeScale as keyof typeof TIMEFRAME_CONFIG] || TIMEFRAME_CONFIG['7d']
  const quoteQuery = useCoinGeckoQuote(coinId)

  // Fetch data from both routes with intelligent prioritization
  const { data: combinedData, isLoading } = useQuery({
    queryKey: ['coingecko-combined-chart-data', coinId, activeTimeScale],
    queryFn: async (): Promise<DataSourceResult> => {
      let primaryResult: DataSourceResult | null = null

      try {
        const shouldPreferMarketChart = Number.parseInt(config.days) > 90 || activeTimeScale === '30d'
        const swallowToNull = (_: unknown) => Effect.succeed(null)

        const ohlcEffect = CoinGeckoApi.getOHLC({
          coinId,
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

        const marketEffect = CoinGeckoApi.getMarketChart({
          coinId,
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
          if (shouldPreferMarketChart) {
            const parsedMarket = parseMarketChartData(marketResult)
            if (parsedMarket) {
              primaryResult = {
                data: parsedMarket,
                source: 'market-chart',
                cached: marketResult.status?.cached || false,
              }
            }
          } else {
            const combined = combineOHLCWithVolume(ohlcResult, marketResult)
            if (combined) {
              primaryResult = {
                data: combined,
                source: 'ohlc',
                cached: ohlcResult.cached || false,
              }
            }
          }
        } else if (marketResult) {
          const parsedMarket = parseMarketChartData(marketResult)
          if (parsedMarket) {
            primaryResult = {
              data: parsedMarket,
              source: 'market-chart',
              cached: marketResult.status?.cached || false,
            }
          }
        } else if (ohlcResult) {
          const parsedOHLC = parseOHLCData(ohlcResult)
          if (parsedOHLC) {
            primaryResult = {
              data: parsedOHLC,
              source: 'ohlc',
              cached: ohlcResult.cached || false,
            }
          }
        }

        if (primaryResult) return primaryResult

        return {
          data: generateFallbackData(coinId, activeTimeScale, initialData),
          source: 'fallback',
          cached: false,
        }
      } catch (error) {
        return {
          data: generateFallbackData(coinId, activeTimeScale, initialData),
          source: 'fallback',
          cached: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: (query) => {
      const points = query.state.data?.data?.lineChart?.length ?? 0
      // When warmup is in-flight, poll quickly so token pages don't stay empty.
      if (points < 2) return 5_000
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

  return {
    chartData: dataWithLatestQuote.lineChart,
    volumeData: dataWithLatestQuote.volumeChart,
    ohlcData: dataWithLatestQuote.ohlcData, // OHLC data for tooltip
    isLoading,
    tokenData: null,
    performance: {
      dataSource,
      cached,
      cacheHitRate: cached ? 100 : 0,
      dataPoints: dataWithLatestQuote.lineChart.length
    }
  }
}
