'use client'

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { CoinMarketData } from '@/types/coins'
import type { Time } from 'lightweight-charts'
import { useRateLimitRecovery } from './use-rate-limit-recovery'

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

interface MultiChartDataPoint {
  time: Time
  value: number
}

interface CoinChartSeries {
  id: string
  name: string
  symbol: string
  data: MultiChartDataPoint[]
  latestValue: number
  hasData: boolean
}

interface ConvexMultiChartData {
  series: CoinChartSeries[]
  isLoading: boolean
  hasData: boolean
  performance: {
    cacheHits: number
    cacheMisses: number
    totalQueries: number
    cacheHitRate: number
  }
}

// Cache timing functions
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

/**
 * Convex-first optimized hook for multi-coin chart data that:
 * 1. Checks Convex cache first for each coin's historical data
 * 2. Falls back to API only when cache is stale/missing
 * 3. Processes data into normalized percentage changes for comparison
 * 4. Provides performance metrics for cache effectiveness
 */
export function useConvexMultiChartData(
  coins: OptimisticCoinMarketData[],
  activeTimeScale: string
): ConvexMultiChartData {
  const convex = useConvex()
  const { fetchWithRecovery } = useRateLimitRecovery()

  // Filter out optimistic coins for data fetching
  const realCoins = useMemo(() => 
    coins.filter(coin => !coin.isOptimistic), 
    [coins]
  )

  // Use React Query to fetch Convex-first chart data for each coin
  const queries = useQueries({
    queries: realCoins.map((coin) => ({
      queryKey: ['convex-multi-chart-data', coin.id, activeTimeScale],
             queryFn: async () => {
         const startTime = Date.now()
         
         try {
          // 1. Check Convex cache first
          const cachedData = await convex.query(api.historicalData.getHistoricalData, {
            coinId: coin.id,
            timeframe: activeTimeScale
          })

                     if (cachedData.cached && !cachedData.stale && cachedData.data.length > 0) {
             // Fresh cached data available
             console.log(`🚀 Multi-chart Convex cache hit for ${coin.symbol} (${coin.id}):`, {
               dataPoints: cachedData.dataPoints,
               lastUpdated: new Date(cachedData.lastUpdated).toLocaleString()
             })
             
             return {
               coinId: coin.id,
               convexData: cachedData.data,
               apiData: null,
               cached: true,
               stale: false,
               dataPoints: cachedData.dataPoints,
               performance: {
                 fetchTime: Date.now() - startTime,
                 cacheHit: true
               }
             }
           } else if (cachedData.cached && cachedData.stale && cachedData.data.length > 0) {
             // Stale data available - use it while we fetch fresh data
             console.log(`⚠️ Multi-chart stale data for ${coin.symbol}, fetching fresh...`)
             
             // Fetch fresh data from API
             const response = await fetchWithRecovery(`/api/coins/${coin.id}?timeScale=${activeTimeScale}`)
             
             if (response.ok) {
               const apiData = await response.json()
               
               // Cache the fresh data (fire and forget)
               cacheApiDataInConvex(convex, coin.id.toString(), activeTimeScale, apiData)
               
               return {
                 coinId: coin.id,
                 convexData: null,
                 apiData,
                 cached: false,
                 stale: false,
                 dataPoints: apiData.ohlcv?.data?.quotes?.length || apiData.historical?.data?.quotes?.length || 0,
                 performance: {
                   fetchTime: Date.now() - startTime,
                   cacheHit: false
                 }
               }
             } else {
               // API failed, use stale data
               console.log(`🔄 Multi-chart API failed, using stale data for ${coin.symbol}`)
               return {
                 coinId: coin.id,
                 convexData: cachedData.data,
                 apiData: null,
                 cached: true,
                 stale: true,
                 dataPoints: cachedData.dataPoints,
                 performance: {
                   fetchTime: Date.now() - startTime,
                   cacheHit: true
                 }
               }
             }
          } else {
            // No cached data, fetch from API
            console.log(`💾 Multi-chart no cache for ${coin.symbol}, fetching from API...`)
            
            const response = await fetchWithRecovery(`/api/coins/${coin.id}?timeScale=${activeTimeScale}`)
            
            if (response.ok) {
              const apiData = await response.json()
              
              // Cache the fresh data (fire and forget)
              cacheApiDataInConvex(convex, coin.id.toString(), activeTimeScale, apiData)
              
              return {
                coinId: coin.id,
                convexData: null,
                apiData,
                cached: false,
                stale: false,
                dataPoints: apiData.ohlcv?.data?.quotes?.length || apiData.historical?.data?.quotes?.length || 0,
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
          console.error(`❌ Multi-chart failed to fetch data for ${coin.symbol}:`, error)
          
          // Try to return any available stale data as last resort
          try {
            const staleData = await convex.query(api.historicalData.getHistoricalData, {
              coinId: coin.id,
              timeframe: activeTimeScale
            })
            
                         if (staleData.data.length > 0) {
               console.log(`🔄 Multi-chart using stale fallback for ${coin.symbol}`)
               return {
                 coinId: coin.id,
                 convexData: staleData.data,
                 apiData: null,
                 cached: true,
                 stale: true,
                 dataPoints: staleData.dataPoints,
                 performance: {
                   fetchTime: Date.now() - startTime,
                   cacheHit: true
                 }
               }
             }
          } catch (staleError) {
            console.warn(`Multi-chart failed to get stale data for ${coin.symbol}:`, staleError)
          }
          
          // Complete failure
          return {
            coinId: coin.id,
            convexData: null,
            apiData: null,
            cached: false,
            stale: false,
            dataPoints: 0,
            performance: {
              fetchTime: Date.now() - startTime,
              cacheHit: false
            }
          }
        }
      },
      staleTime: getStaleTime(activeTimeScale),
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  })

  // Process the data for chart rendering
  const processedData = useMemo((): ConvexMultiChartData => {
    const series: CoinChartSeries[] = []
    const totalQueries = queries.length
    let cacheHits = 0

    queries.forEach((query, index) => {
      const coin = realCoins[index]
      if (!coin || !query.data) return

      const queryData = query.data
      
      // Count cache hits
      if (queryData.performance.cacheHit) {
        cacheHits++
      }

      // Process Convex data if available
      if (queryData.convexData && queryData.convexData.length > 0) {
        const chartData: MultiChartDataPoint[] = []
        const convexData = queryData.convexData
        
        if (convexData.length > 0) {
          const initialPrice = convexData[0]?.price
          
          if (initialPrice && initialPrice > 0) {
            convexData.forEach(point => {
              const currentPrice = point.price
              if (currentPrice && currentPrice > 0) {
                const percentChange = ((currentPrice - initialPrice) / initialPrice) * 100
                chartData.push({
                  time: (point.timestamp / 1000) as Time,
                  value: percentChange,
                })
              }
            })
          }
        }

        // Sort by time to ensure proper ordering
        chartData.sort((a, b) => (a.time as number) - (b.time as number))

        if (chartData.length > 0) {
          series.push({
            id: coin.id.toString(),
            name: coin.name,
            symbol: coin.symbol,
            data: chartData,
            latestValue: chartData[chartData.length - 1]?.value || 0,
            hasData: true,
          })
        }
      }
      // Process API data if available
      else if (queryData.apiData) {
        const apiData = queryData.apiData
        const chartData: MultiChartDataPoint[] = []
        
        // Process OHLCV data first (better quality)
        if (apiData.ohlcv?.data?.quotes?.length) {
          const quotes = apiData.ohlcv.data.quotes
          if (quotes.length > 0) {
            const initialPrice = quotes[0]?.quote?.USD?.close
            
            if (initialPrice && initialPrice > 0) {
              quotes.forEach((quote: { time_close: string; quote: { USD: { close: number } } }) => {
                const currentPrice = quote.quote?.USD?.close
                if (currentPrice && currentPrice > 0) {
                  const percentChange = ((currentPrice - initialPrice) / initialPrice) * 100
                  chartData.push({
                    time: (new Date(quote.time_close).getTime() / 1000) as Time,
                    value: percentChange,
                  })
                }
              })
            }
          }
        }
        // Fallback to historical data  
        else if (apiData.historical?.data?.quotes?.length) {
          const quotes = apiData.historical.data.quotes
          if (quotes.length > 0) {
            const sortedQuotes = quotes
              .filter((quote: { quote?: { USD?: { price?: number } } }) => quote?.quote?.USD?.price)
              .sort((a: { timestamp: string }, b: { timestamp: string }) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              )
            
            if (sortedQuotes.length > 0) {
              const initialPrice = sortedQuotes[0]?.quote?.USD?.price
              
              if (initialPrice && initialPrice > 0) {
                sortedQuotes.forEach((quote: { timestamp: string; quote: { USD: { price: number } } }) => {
                  const currentPrice = quote.quote?.USD?.price
                  if (currentPrice && currentPrice > 0) {
                    const percentChange = ((currentPrice - initialPrice) / initialPrice) * 100
                    chartData.push({
                      time: (new Date(quote.timestamp).getTime() / 1000) as Time,
                      value: percentChange,
                    })
                  }
                })
              }
            }
          }
        }

        // Sort by time to ensure proper ordering
        chartData.sort((a, b) => (a.time as number) - (b.time as number))

        // Filter out invalid data points
        const validData = chartData.filter(
          (item) =>
            item &&
            typeof item.time === "number" &&
            typeof item.value === "number" &&
            !isNaN(item.value) &&
            isFinite(item.value)
        )

        if (validData.length > 0) {
          series.push({
            id: coin.id.toString(),
            name: coin.name,
            symbol: coin.symbol,
            data: validData,
            latestValue: validData[validData.length - 1]?.value || 0,
            hasData: true,
          })
        }
      }
    })

    const isLoading = queries.some(query => query.isLoading)
    const hasData = series.length > 0
    const cacheHitRate = totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0

    console.log(`📊 Multi-chart Convex performance:`, {
      totalQueries,
      cacheHits,
      cacheHitRate: cacheHitRate.toFixed(1) + '%',
      seriesCount: series.length
    })

    return {
      series,
      isLoading,
      hasData,
      performance: {
        cacheHits,
        cacheMisses: totalQueries - cacheHits,
        totalQueries,
        cacheHitRate
      }
    }
  }, [queries, realCoins])

  return processedData
}

// Helper function to cache API data in Convex (simplified version)
async function cacheApiDataInConvex(
  convex: ReturnType<typeof useConvex>,
  coinId: string,
  timeScale: string,
  apiData: Record<string, unknown>
) {
  try {
    // Cache OHLCV data if available
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

      console.log(`💾 Multi-chart cached ${dataPoints.length} OHLCV data points for coin ${coinId}`)
    }
  } catch (error) {
    console.warn(`Multi-chart failed to cache data for ${coinId}:`, error)
  }
} 