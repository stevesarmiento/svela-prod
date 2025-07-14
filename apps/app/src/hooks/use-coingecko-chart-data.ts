'use client'

import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
import type { CoinMarketData } from '@/types/coins'

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
  data: OHLCDataPoint[]
  cached?: boolean
}

interface MarketChartPoint {
  time: number
  value: number
}

interface MarketChartAPIResponse {
  data: {
    prices: MarketChartPoint[]
    volumes: MarketChartPoint[]
    market_caps: MarketChartPoint[]
  }
  status?: {
    cached?: boolean
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

/**
 * Parse OHLC data from /api/coingecko/ohlc route
 */
function parseOHLCData(data: OHLCAPIResponse): ParsedChartData | null {
  if (!data?.data || !Array.isArray(data.data) || data.data.length === 0) {
    return null
  }

  try {
    const ohlcPoints = data.data.map((point: OHLCDataPoint) => ({
      time: (point.timestamp / 1000) as Time,
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
      time: point.time as Time,
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
  const days = parseInt(config.days)
  const dataPoints = Math.min(days, 90) // Limit fallback data points
  
  const fallbackPoints = Array.from({ length: dataPoints }, (_, i) => {
    const time = ((Date.now() - (dataPoints - i) * 24 * 60 * 60 * 1000) / 1000) as Time
    const basePrice = initialData?.price || 100
    const randomFactor = 0.95 + Math.random() * 0.1 // ±5% variation
    const price = basePrice * randomFactor
    const volume = (initialData?.volume_24h || 1000000) * (0.5 + Math.random() * 1.0)
    
    return {
      time,
      price,
      volume,
      open: price * 0.998,
      high: price * 1.003,
      low: price * 0.997,
      close: price
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
      time: (point.timestamp / 1000) as Time,
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

export function useCoinGeckoChartData(
  coinId: string,
  activeTimeScale: string,
  initialData: CoinMarketData['quote']['USD']
): CoinGeckoChartDataResult {
  const config = TIMEFRAME_CONFIG[activeTimeScale as keyof typeof TIMEFRAME_CONFIG] || TIMEFRAME_CONFIG['7d']

  // Fetch data from both routes with intelligent prioritization
  const { data: combinedData, isLoading } = useQuery({
    queryKey: ['coingecko-combined-chart-data', coinId, activeTimeScale],
    queryFn: async (): Promise<DataSourceResult> => {
      console.log('🎯 Fetching CoinGecko data for:', { coinId, timeframe: activeTimeScale, config })

      let primaryResult: DataSourceResult | null = null

            try {
        // Smart strategy: For longer timeframes (and 30d), prefer market-chart for better granularity
        const shouldPreferMarketChart = parseInt(config.days) > 90 || activeTimeScale === '30d'
        console.log('🔄 Fetching both OHLC and market-chart data', { 
          days: config.days, 
          preferMarketChart: shouldPreferMarketChart 
        })
        
        let ohlcResult: OHLCAPIResponse | null = null
        let marketResult: MarketChartAPIResponse | null = null
        
        // Fetch both endpoints in parallel
        const [ohlcResponse, marketResponse] = await Promise.allSettled([
          fetch(`/api/coingecko/ohlc?id=${coinId}&days=${config.days}&vs_currency=usd`),
          fetch(`/api/coingecko/market-chart?id=${coinId}&days=${config.days}&vs_currency=usd`)
        ])
        
        // Process OHLC response
        if (ohlcResponse.status === 'fulfilled' && ohlcResponse.value.ok) {
          try {
            ohlcResult = await ohlcResponse.value.json()
            console.log('✅ OHLC data fetched successfully')
          } catch (error) {
            console.warn('⚠️ Failed to parse OHLC data:', error)
          }
        } else {
          console.warn('⚠️ OHLC request failed:', ohlcResponse.status === 'rejected' ? ohlcResponse.reason : ohlcResponse.value.status)
        }
        
        // Process market-chart response
        if (marketResponse.status === 'fulfilled' && marketResponse.value.ok) {
          try {
            marketResult = await marketResponse.value.json()
            console.log('✅ Market-chart data fetched successfully')
          } catch (error) {
            console.warn('⚠️ Failed to parse market-chart data:', error)
          }
        } else {
          console.warn('⚠️ Market-chart request failed:', marketResponse.status === 'rejected' ? marketResponse.reason : marketResponse.value.status)
        }
        
        // Combine data intelligently based on what we got and timeframe
        if (ohlcResult && marketResult) {
          if (shouldPreferMarketChart) {
            // For longer timeframes: prefer market-chart for better daily granularity
            const parsedMarket = parseMarketChartData(marketResult)
            if (parsedMarket) {
              console.log('✅ Using market-chart data for long timeframe (daily granularity preferred)')
              primaryResult = {
                data: parsedMarket,
                source: 'market-chart',
                cached: marketResult.status?.cached || false
              }
            }
          } else {
            // For shorter timeframes: combine real OHLC + real volume
            const combinedData = combineOHLCWithVolume(ohlcResult, marketResult)
            if (combinedData) {
              console.log('✅ Combined real OHLC + real volume data for short timeframe')
              primaryResult = {
                data: combinedData,
                source: 'ohlc',
                cached: ohlcResult.cached || false
              }
            }
          }
        } else if (marketResult) {
          // Market-chart only: real price line + volume, synthetic OHLC
          const parsedMarket = parseMarketChartData(marketResult)
          if (parsedMarket) {
            console.log('✅ Using market-chart data (real price+volume, synthetic OHLC)')
            primaryResult = {
              data: parsedMarket,
              source: 'market-chart',
              cached: marketResult.status?.cached || false
            }
          }
        } else if (ohlcResult) {
          // OHLC only: real candlesticks, no volume
          const parsedOHLC = parseOHLCData(ohlcResult)
          if (parsedOHLC) {
            console.log('✅ Using OHLC data (real candlesticks, no volume)')
            primaryResult = {
              data: parsedOHLC,
              source: 'ohlc',
              cached: ohlcResult.cached || false
            }
          }
        }

        // Return the result if we have one
        if (primaryResult) {
          return primaryResult
        }

        // Generate fallback data if both routes fail
        console.log('🔄 Generating fallback data (both API routes failed)')
        return {
          data: generateFallbackData(coinId, activeTimeScale, initialData),
          source: 'fallback',
          cached: false
        }

      } catch (error) {
        console.error('❌ Complete chart data fetch failure:', error)
        return {
          data: generateFallbackData(coinId, activeTimeScale, initialData),
          source: 'fallback',
          cached: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
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
    console.log('✅ Using real data from', dataSource);
  } else if (combinedData?.error) {
    // We have an error - log it and only use fallback if specifically needed
    console.error('❌ Chart data fetch error:', combinedData.error);
    
    // Only generate fallback data if we have some initial pricing data to work with
    if (initialData && initialData.price && initialData.price > 0) {
      console.warn('⚠️ Using fallback data due to API error, but with real initial price');
      parsedData = generateFallbackData(coinId, activeTimeScale, initialData);
    } else {
      console.error('💥 No real data and no valid initial data - returning empty chart');
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
    if (initialData && initialData.price && initialData.price > 0) {
      console.warn('⚠️ No API data available, using fallback with real initial price');
      parsedData = generateFallbackData(coinId, activeTimeScale, initialData);
    } else {
      console.warn('⚠️ No API data and no valid initial data - returning empty chart');
      parsedData = {
        lineChart: [],
        volumeChart: [],
        ohlcData: []
      };
    }
  }

  console.log('📊 Final chart data summary:', {
    source: dataSource,
    cached,
    timeframe: activeTimeScale,
    days: config.days,
    linePoints: parsedData.lineChart.length,
    volumePoints: parsedData.volumeChart.length,
    ohlcPoints: parsedData.ohlcData.length,
    granularity: parsedData.lineChart.length > 0 ? `~${Math.round(parseInt(config.days) / parsedData.lineChart.length)} days per point` : 'unknown'
  })

  return {
    chartData: parsedData.lineChart,
    volumeData: parsedData.volumeChart,
    ohlcData: parsedData.ohlcData, // OHLC data for tooltip
    isLoading,
    tokenData: null,
    performance: {
      dataSource,
      cached,
      cacheHitRate: cached ? 100 : 0,
      dataPoints: parsedData.lineChart.length
    }
  }
}