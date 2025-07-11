'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { CoinMarketData, OHLCVQuote } from '@/types/coins'
import type { Time } from 'lightweight-charts'
import { useTokenData } from './use-token-data'
import { useRateLimitRecovery } from './use-rate-limit-recovery'

interface HistoricalQuote {
  timestamp: string;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
    };
  };
}

interface OHLCVDataPoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface ConvexChartDataResult {
  chartData: Array<{ time: Time; value: number }>
  volumeData: Array<{ time: Time; value: number; color: string }>
  ohlcvData: OHLCVDataPoint[]
  isLoading: boolean
  tokenData: ReturnType<typeof useTokenData>['data']
  performance: {
    dataSource: 'convex-cache' | 'api-fresh' | 'convex-stale' | 'fallback'
    cached: boolean
    staleTime: number
    refetchInterval: number
    cacheHitRate: number
  }
}

// Cache timing functions (same as other hooks)
function getStaleTime(timeScale: string): number {
  const staleTimeMap = {
    '1d': 2 * 60 * 1000,       // 2 minutes for intraday
    '7d': 5 * 60 * 1000,       // 5 minutes for short-term
    '30d': 15 * 60 * 1000,     // 15 minutes for medium-term
    'max': 60 * 60 * 1000,     // 1 hour for long-term
    '2y': 60 * 60 * 1000,      // 1 hour for long-term
  } as const
  
  return staleTimeMap[timeScale as keyof typeof staleTimeMap] || 2 * 60 * 1000
}

function getRefetchInterval(timeScale: string): number {
  const refetchMap = {
    '1d': 30 * 1000,           // 30 seconds for intraday
    '7d': 60 * 1000,           // 1 minute for short-term
    '30d': 2 * 60 * 1000,      // 2 minutes for medium-term
    'max': 10 * 60 * 1000,     // 10 minutes for long-term
    '2y': 10 * 60 * 1000,      // 10 minutes for long-term
  } as const
  
  return refetchMap[timeScale as keyof typeof refetchMap] || 2 * 60 * 1000
}

/**
 * Convex-first optimized chart data hook that:
 * 1. Checks Convex cache first for historical data
 * 2. Falls back to API only when cache is stale/missing
 * 3. Caches fresh data back to Convex
 * 4. Provides same interface as useOptimizedChartData
 */
export function useConvexOptimizedChartData(
  coinId: string, 
  activeTimeScale: string, 
  initialData: CoinMarketData['quote']['USD']
): ConvexChartDataResult {
  const convex = useConvex()
  const { data: tokenData } = useTokenData(coinId)
  const { fetchWithRecovery } = useRateLimitRecovery()

  // Use React Query with Convex integration
  const { data: chartDataResponse, isLoading } = useQuery({
    queryKey: ['convex-optimized-chart-data', coinId, activeTimeScale],
    queryFn: async () => {
      const startTime = Date.now()
      let dataSource: 'convex-cache' | 'api-fresh' | 'convex-stale' | 'fallback' = 'fallback'
      
      try {
        // 1. Check Convex cache first
        const cachedData = await convex.query(api.historicalData.getHistoricalData, {
          coinId: Number(coinId),
          timeframe: activeTimeScale
        })

        if (cachedData.cached && !cachedData.stale && cachedData.data.length > 0) {
          // Fresh cached data available
          console.log(`🚀 Convex cache hit for ${coinId} (${activeTimeScale}):`, {
            dataPoints: cachedData.dataPoints,
            lastUpdated: new Date(cachedData.lastUpdated).toLocaleString()
          })
          
          dataSource = 'convex-cache'
          return {
            convexData: cachedData.data,
            apiData: null,
            dataSource,
            cached: true,
            performance: {
              fetchTime: Date.now() - startTime,
              cacheHit: true
            }
          }
        } else if (cachedData.cached && cachedData.stale && cachedData.data.length > 0) {
          // Stale data available - use it while we fetch fresh data
          console.log(`⚠️ Convex stale data for ${coinId} (${activeTimeScale}), fetching fresh...`)
          
          // Fetch fresh data from API
          const response = await fetchWithRecovery(`/api/coins/${coinId}?timeScale=${activeTimeScale}`)
          
          if (response.ok) {
            const apiData = await response.json()
            
            // Cache the fresh data (fire and forget)
            cacheApiDataInConvex(convex, coinId, activeTimeScale, apiData)
            
            dataSource = 'api-fresh'
            return {
              convexData: null,
              apiData,
              dataSource,
              cached: false,
              performance: {
                fetchTime: Date.now() - startTime,
                cacheHit: false
              }
            }
          } else {
            // API failed, use stale data
            console.log(`🔄 API failed, using stale Convex data for ${coinId}`)
            dataSource = 'convex-stale'
            return {
              convexData: cachedData.data,
              apiData: null,
              dataSource,
              cached: true,
              performance: {
                fetchTime: Date.now() - startTime,
                cacheHit: true
              }
            }
          }
        } else {
          // No cached data, fetch from API
          console.log(`💾 No cached data for ${coinId} (${activeTimeScale}), fetching from API...`)
          
          const response = await fetchWithRecovery(`/api/coins/${coinId}?timeScale=${activeTimeScale}`)
          
          if (response.ok) {
            const apiData = await response.json()
            
            // Cache the fresh data (fire and forget)
            cacheApiDataInConvex(convex, coinId, activeTimeScale, apiData)
            
            dataSource = 'api-fresh'
            return {
              convexData: null,
              apiData,
              dataSource,
              cached: false,
              performance: {
                fetchTime: Date.now() - startTime,
                cacheHit: false
              }
            }
          } else {
            throw new Error(`API request failed: ${response.status}`)
          }
        }
      } catch (error) {
        console.error(`❌ Failed to fetch chart data for ${coinId}:`, error)
        
        // Try to return any available stale data as last resort
        try {
          const staleData = await convex.query(api.historicalData.getHistoricalData, {
            coinId: Number(coinId),
            timeframe: activeTimeScale
          })
          
          if (staleData.data.length > 0) {
            console.log(`🔄 Using stale Convex data as fallback for ${coinId}`)
            dataSource = 'convex-stale'
            return {
              convexData: staleData.data,
              apiData: null,
              dataSource,
              cached: true,
              performance: {
                fetchTime: Date.now() - startTime,
                cacheHit: true
              }
            }
          }
        } catch (staleError) {
          console.warn(`Failed to get stale data for ${coinId}:`, staleError)
        }
        
        // Complete fallback - return empty data
        return {
          convexData: null,
          apiData: null,
          dataSource: 'fallback',
          cached: false,
          performance: {
            fetchTime: Date.now() - startTime,
            cacheHit: false
          }
        }
      }
    },
    staleTime: getStaleTime(activeTimeScale),
    refetchInterval: getRefetchInterval(activeTimeScale),
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    enabled: !!coinId,
  })

  // Process chart data with optimized logic
  const { chartData, volumeData, ohlcvData, performance } = useMemo(() => {
    if (!chartDataResponse) {
      return {
        chartData: [],
        volumeData: [],
        ohlcvData: [],
        performance: {
          dataSource: 'fallback' as const,
          cached: false,
          staleTime: getStaleTime(activeTimeScale),
          refetchInterval: getRefetchInterval(activeTimeScale),
          cacheHitRate: 0
        }
      }
    }

         const { convexData, apiData, dataSource, cached } = chartDataResponse

    // Process Convex data if available
    if (convexData && convexData.length > 0) {
      console.log(`📊 Processing Convex data for ${coinId}:`, convexData.length, 'points')
      
      const chartData = convexData.map(point => ({
        time: (point.timestamp / 1000) as Time,
        value: point.price
      }))

      const volumeData = convexData.map(point => ({
        time: (point.timestamp / 1000) as Time,
        value: point.volume || 0,
        color: '#ffffff40'
      }))

      const ohlcvData: OHLCVDataPoint[] = convexData.map((point, index, array) => {
        const price = point.close || point.price
        const prevPrice = index > 0 ? (array[index - 1]?.close || array[index - 1]?.price || price) : price
        
        // Validate OHLCV data integrity with explicit type guards
        const hasValidOHLCV = typeof point.open === 'number' && 
                             typeof point.high === 'number' && 
                             typeof point.low === 'number' && 
                             typeof point.close === 'number' &&
                             point.high >= Math.max(point.open, point.close) &&
                             point.low <= Math.min(point.open, point.close)
        
        if (hasValidOHLCV) {
          // Use real OHLCV data (TypeScript knows these are numbers now)
          return {
            time: (point.timestamp / 1000) as Time,
            open: point.open as number,
            high: point.high as number,
            low: point.low as number,
            close: point.close as number,
            volume: point.volume || 0
          }
        } else {
          // Generate realistic OHLCV from price data with proper spreads
          const volatility = Math.abs(price - prevPrice) * 0.3 + price * 0.001
          const open = prevPrice
          const close = price
          const spread = volatility * 0.5
          
          return {
            time: (point.timestamp / 1000) as Time,
            open,
            high: Math.max(open, close) + spread,
            low: Math.min(open, close) - spread,
            close,
            volume: point.volume || 0
          }
        }
      })

      return {
        chartData,
        volumeData,
        ohlcvData,
        performance: {
          dataSource: dataSource as 'convex-cache' | 'api-fresh' | 'convex-stale' | 'fallback',
          cached,
          staleTime: getStaleTime(activeTimeScale),
          refetchInterval: getRefetchInterval(activeTimeScale),
          cacheHitRate: cached ? 100 : 0
        }
      }
    }

    // Process API data if available
    if (apiData) {
      console.log(`📊 Processing API data for ${coinId}`)
      
      // Priority 1: Use OHLCV data if available (best quality)
      if (apiData.ohlcv?.data?.quotes?.length) {
        console.log('📊 Using OHLCV data (highest quality)')
        
        const ohlcvQuotes = apiData.ohlcv.data.quotes as OHLCVQuote[]
        
        const chartData = ohlcvQuotes.map(quote => ({
          time: (new Date(quote.time_close).getTime() / 1000) as Time,
          value: quote.quote.USD.close
        }))

        const volumeData = ohlcvQuotes.map(quote => ({
          time: (new Date(quote.time_close).getTime() / 1000) as Time,
          value: quote.quote.USD.volume,
          color: '#ffffff40'
        }))

        const ohlcvData: OHLCVDataPoint[] = ohlcvQuotes.map(quote => ({
          time: (new Date(quote.time_close).getTime() / 1000) as Time,
          open: quote.quote.USD.open,
          high: quote.quote.USD.high,
          low: quote.quote.USD.low,
          close: quote.quote.USD.close,
          volume: quote.quote.USD.volume
        }))

        return {
          chartData,
          volumeData,
          ohlcvData,
          performance: {
            dataSource,
            cached,
            staleTime: getStaleTime(activeTimeScale),
            refetchInterval: getRefetchInterval(activeTimeScale),
            cacheHitRate: cached ? 100 : 0
          }
        }
      }
      
      // Priority 2: Use historical data (good quality)
      if (apiData.historical?.data?.quotes?.length) {
        console.log('📈 Using historical data')
        
        const chartData = apiData.historical.data.quotes.map((quote: HistoricalQuote) => ({
          time: (new Date(quote.timestamp).getTime() / 1000) as Time,
          value: quote.quote.USD.price
        }))

        const volumeData = apiData.historical.data.quotes.map((quote: HistoricalQuote) => ({
          time: (new Date(quote.timestamp).getTime() / 1000) as Time,
          value: quote.quote.USD.volume_24h || 0,
          color: '#ffffff40'
        }))

        const ohlcvData: OHLCVDataPoint[] = apiData.historical.data.quotes.map((quote: HistoricalQuote) => {
          const price = quote.quote.USD.price
          return {
            time: (new Date(quote.timestamp).getTime() / 1000) as Time,
            open: price,
            high: price * 1.005,
            low: price * 0.995,
            close: price,
            volume: quote.quote.USD.volume_24h || 0
          }
        })

        return {
          chartData,
          volumeData,
          ohlcvData,
          performance: {
            dataSource,
            cached,
            staleTime: getStaleTime(activeTimeScale),
            refetchInterval: getRefetchInterval(activeTimeScale),
            cacheHitRate: cached ? 100 : 0
          }
        }
      }
    }

    // Priority 3: Generate fallback data (last resort)
    console.log('🔄 Using fallback data')
    
    const fallbackData = Array.from({ length: 30 }, (_, i) => {
      const time = ((Date.now() - (30 - i) * 24 * 60 * 60 * 1000) / 1000) as Time
      const price = initialData.price * (0.95 + Math.random() * 0.1)
      const volume = initialData.volume_24h * (0.5 + Math.random() * 1.5)
      
      return {
        chart: { time, value: price },
        volume: { time, value: volume, color: '#ffffff40' },
        ohlcv: {
          time,
          open: price,
          high: price * 1.01,
          low: price * 0.99,
          close: price,
          volume
        }
      }
    })
    
    // Add current data point
    fallbackData.push({
      chart: { time: (Date.now() / 1000) as Time, value: initialData.price },
      volume: { time: (Date.now() / 1000) as Time, value: initialData.volume_24h, color: '#ffffff40' },
      ohlcv: {
        time: (Date.now() / 1000) as Time,
        open: initialData.price,
        high: initialData.price * 1.01,
        low: initialData.price * 0.99,
        close: initialData.price,
        volume: initialData.volume_24h
      }
    })

    return {
      chartData: fallbackData.map(d => d.chart),
      volumeData: fallbackData.map(d => d.volume),
      ohlcvData: fallbackData.map(d => d.ohlcv),
      performance: {
        dataSource: 'fallback' as const,
        cached: false,
        staleTime: getStaleTime(activeTimeScale),
        refetchInterval: getRefetchInterval(activeTimeScale),
        cacheHitRate: 0
      }
    }
  }, [chartDataResponse, initialData, activeTimeScale, coinId])

  return { 
    chartData, 
    volumeData, 
    ohlcvData, 
    isLoading, 
    tokenData,
    performance: {
      ...performance,
      dataSource: performance.dataSource as 'convex-cache' | 'api-fresh' | 'convex-stale' | 'fallback'
    }
  }
}

// Helper function to cache API data in Convex
async function cacheApiDataInConvex(
  convex: ReturnType<typeof useConvex>, 
  coinId: string, 
  timeScale: string, 
  apiData: Record<string, unknown>
) {
  try {
    // Cache historical data if available
    if (apiData.ohlcv && 
        typeof apiData.ohlcv === 'object' && 
        apiData.ohlcv !== null &&
        'data' in apiData.ohlcv &&
        typeof apiData.ohlcv.data === 'object' &&
        apiData.ohlcv.data !== null &&
        'quotes' in apiData.ohlcv.data &&
        Array.isArray(apiData.ohlcv.data.quotes) &&
        apiData.ohlcv.data.quotes.length > 0) {
      
      const dataPoints = apiData.ohlcv.data.quotes.map((quote: unknown) => {
        const q = quote as Record<string, unknown>
        const timeClose = q.time_close as string
        const quoteData = q.quote as Record<string, Record<string, unknown>>
        const usdData = quoteData.USD
        
        if (!usdData) throw new Error('Missing USD data')
        
        return {
          timestamp: new Date(timeClose).getTime(),
          price: usdData.close as number,
          volume: usdData.volume as number,
          marketCap: usdData.market_cap as number,
          open: usdData.open as number,
          high: usdData.high as number,
          low: usdData.low as number,
          close: usdData.close as number,
        }
      })

      await convex.mutation(api.historicalData.upsertHistoricalDataIncremental, {
        coinId: Number(coinId),
        timeframe: timeScale,
        dataPoints,
        dataSource: "coinmarketcap"
      })

      console.log(`💾 Cached ${dataPoints.length} OHLCV data points for coin ${coinId}`)
    } else if (apiData.historical && 
               typeof apiData.historical === 'object' && 
               apiData.historical !== null &&
               'data' in apiData.historical &&
               typeof apiData.historical.data === 'object' &&
               apiData.historical.data !== null &&
               'quotes' in apiData.historical.data &&
               Array.isArray(apiData.historical.data.quotes) &&
               apiData.historical.data.quotes.length > 0) {
      
      const dataPoints = apiData.historical.data.quotes.map((quote: unknown) => {
        const q = quote as Record<string, unknown>
        const timestamp = q.timestamp as string
        const quoteData = q.quote as Record<string, Record<string, unknown>>
        const usdData = quoteData.USD
        
        if (!usdData) throw new Error('Missing USD data')
        
        return {
          timestamp: new Date(timestamp).getTime(),
          price: usdData.price as number,
          volume: (usdData.volume_24h as number) || 0,
          marketCap: usdData.market_cap as number,
          open: usdData.price as number,
          high: usdData.price as number,
          low: usdData.price as number,
          close: usdData.price as number,
        }
      })

      await convex.mutation(api.historicalData.upsertHistoricalDataIncremental, {
        coinId: Number(coinId),
        timeframe: timeScale,
        dataPoints,
        dataSource: "coinmarketcap"
      })

      console.log(`💾 Cached ${dataPoints.length} historical data points for coin ${coinId}`)
    }

    // Cache current market data if available
    if (apiData.quote && 
        typeof apiData.quote === 'object' && 
        apiData.quote !== null &&
        'USD' in apiData.quote &&
        typeof apiData.quote.USD === 'object' &&
        apiData.quote.USD !== null) {
      
      const usdData = apiData.quote.USD as Record<string, unknown>
      
      await convex.mutation(api.historicalData.upsertCurrentMarketData, {
        coinId: Number(coinId),
        price: usdData.price as number,
        volume24h: (usdData.volume_24h as number) || 0,
        marketCap: (usdData.market_cap as number) || 0,
        change1h: (usdData.percent_change_1h as number) || undefined,
        change24h: (usdData.percent_change_24h as number) || 0,
        change7d: (usdData.percent_change_7d as number) || undefined,
        change30d: (usdData.percent_change_30d as number) || undefined,
        rank: (apiData.cmc_rank as number) || undefined,
        circulatingSupply: (apiData.circulating_supply as number) || undefined,
        totalSupply: (apiData.total_supply as number) || undefined,
        maxSupply: (apiData.max_supply as number) || undefined,
        dataSource: "coinmarketcap"
      })

      console.log(`💾 Cached current market data for coin ${coinId}`)
    }
  } catch (error) {
    console.warn(`Failed to cache data for ${coinId}:`, error)
  }
} 