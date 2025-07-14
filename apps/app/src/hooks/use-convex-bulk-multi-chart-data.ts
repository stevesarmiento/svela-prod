'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { CoinMarketData } from '@/types/coins'
import type { Time } from 'lightweight-charts'
import { useRateLimitRecovery } from './use-rate-limit-recovery'

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

interface OHLCVQuote {
  time_close: string
  quote: {
    USD: {
      open: number
      high: number
      low: number
      close: number
      volume: number
      market_cap: number
    }
  }
}

interface HistoricalQuote {
  timestamp: string
  quote: {
    USD: {
      price: number
      volume_24h: number
      market_cap: number
    }
  }
}

interface ApiData {
  ohlcv?: {
    data?: {
      quotes?: OHLCVQuote[]
    }
  }
  historical?: {
    data?: {
      quotes?: HistoricalQuote[]
    }
  }
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

interface ConvexBulkMultiChartData {
  series: CoinChartSeries[]
  isLoading: boolean
  hasData: boolean
  performance: {
    cacheHits: number
    cacheMisses: number
    totalQueries: number
    cacheHitRate: number
    bulkApiCalls: number
  }
}

// Cache timing functions
function getStaleTime(timeScale: string): number {
  const staleTimeMap = {
    '1d': 5 * 60 * 1000,       // 5 minutes for intraday (increased)
    '7d': 15 * 60 * 1000,      // 15 minutes for short-term (increased)
    '30d': 60 * 60 * 1000,     // 30 minutes for medium-term (increased)
    'max': 2 * 60 * 60 * 1000, // 2 hours for long-term (increased)
    '2y': 2 * 60 * 60 * 1000,  // 2 hours for long-term (increased)
  } as const
  
  return staleTimeMap[timeScale as keyof typeof staleTimeMap] || 5 * 60 * 1000
}

/**
 * Bulk Convex-first optimized hook for multi-coin chart data that:
 * 1. Checks Convex cache first for each coin's historical data
 * 2. Groups cache misses into bulk API calls (max 10 coins per call)
 * 3. Dramatically reduces API rate limit usage
 * 4. Provides performance metrics for cache effectiveness
 */
export function useConvexBulkMultiChartData(
  coins: OptimisticCoinMarketData[],
  activeTimeScale: string
): ConvexBulkMultiChartData {
  const convex = useConvex()
  const { fetchWithRecovery } = useRateLimitRecovery()

  // Filter out optimistic coins for data fetching
  const realCoins = useMemo(() => 
    coins.filter(coin => !coin.isOptimistic), 
    [coins]
  )

  // Use React Query to fetch bulk Convex-first chart data
  const { data: bulkResponse, isLoading } = useQuery({
    queryKey: ['convex-bulk-multi-chart-data', realCoins.map(c => c.id).sort().join(','), activeTimeScale],
    queryFn: async () => {
      if (!realCoins.length) return { series: [], performance: { cacheHits: 0, cacheMisses: 0, totalQueries: 0, cacheHitRate: 0, bulkApiCalls: 0 } }

      const startTime = Date.now()
      let cacheHits = 0
      let cacheMisses = 0
      let bulkApiCalls = 0
      const series: CoinChartSeries[] = []
      const missedCoins: OptimisticCoinMarketData[] = []

      // Phase 1: Check Convex cache for all coins
      console.log(`🚀 Bulk multi-chart: Checking cache for ${realCoins.length} coins`)
      
      const cachePromises = realCoins.map(async (coin) => {
        try {
          const cachedData = await convex.query(api.historicalData.getHistoricalData, {
            coinId: typeof coin.id === 'string' ? parseInt(coin.id) || 0 : coin.id,
            timeframe: activeTimeScale
          })

          if (cachedData.cached && !cachedData.stale && cachedData.data.length > 0) {
            // Fresh cached data available
            cacheHits++
            
            const chartData: MultiChartDataPoint[] = []
            const convexData = cachedData.data
            
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
            
            return { cached: true, coin }
          } else {
            // Cache miss or stale data
            cacheMisses++
            missedCoins.push(coin)
            return { cached: false, coin }
          }
        } catch (error) {
          console.warn(`Failed to get cached data for coin ${coin.id}:`, error)
          cacheMisses++
          missedCoins.push(coin)
          return { cached: false, coin }
        }
      })

      await Promise.all(cachePromises)

      // Phase 2: Bulk fetch missed coins (max 10 per request to stay within API limits)
      if (missedCoins.length > 0) {
        console.log(`📦 Bulk multi-chart: Fetching ${missedCoins.length} missed coins via bulk API`)
        
                 // Split into smaller chunks of 3 coins to reduce API load and rate limiting
         const chunks = []
         for (let i = 0; i < missedCoins.length; i += 3) {
           chunks.push(missedCoins.slice(i, i + 3))
         }

                 const bulkPromises = chunks.map(async (chunk, chunkIndex) => {
           try {
             // Add delay between chunks to avoid overwhelming the API
             if (chunkIndex > 0) {
               const chunkDelay = chunkIndex * 1000 // 1 second between chunks
               await new Promise(resolve => setTimeout(resolve, chunkDelay))
             }
             
             bulkApiCalls++
             const coinIds = chunk.map(c => c.id).join(',')
             console.log(`📦 Bulk chunk ${chunkIndex + 1}/${chunks.length}: Fetching ${chunk.length} coins`)
             
             const response = await fetchWithRecovery(`/api/coins/bulk?coinIds=${coinIds}&timeScale=${activeTimeScale}`)
             
             if (response.ok) {
               const bulkData = await response.json()
               
               // Process each coin in the bulk response
               if (bulkData.success && bulkData.data) {
                 let processedCount = 0
                 for (const coinData of bulkData.data) {
                   const coin = chunk.find(c => c.id === coinData.coinId)
                   if (!coin || coinData.error) continue

                   // Cache the fresh data (fire and forget)
                   if (coinData.ohlcv?.data?.quotes?.length || coinData.historical?.data?.quotes?.length) {
                     cacheApiDataInConvex(convex, coinData.coinId.toString(), activeTimeScale, coinData)
                   }

                   // Process into chart series
                   const chartData = processApiDataToChart(coinData)
                   
                   if (chartData.length > 0) {
                     series.push({
                       id: coin.id.toString(),
                       name: coin.name,
                       symbol: coin.symbol,
                       data: chartData,
                       latestValue: chartData[chartData.length - 1]?.value || 0,
                       hasData: true,
                     })
                     processedCount++
                   }
                 }
                 console.log(`✅ Bulk chunk ${chunkIndex + 1}: Processed ${processedCount}/${chunk.length} coins`)
               }
             } else if (response.status === 429) {
               console.warn(`🚫 Bulk API rate limited for chunk ${chunkIndex + 1}, using stale data`)
               // Rate limited - aggressively use stale cached data
               for (const coin of chunk) {
                 try {
                   const staleData = await convex.query(api.historicalData.getHistoricalData, {
                     coinId: typeof coin.id === 'string' ? parseInt(coin.id) || 0 : coin.id,
                     timeframe: activeTimeScale
                   })
                   
                   if (staleData.data.length > 0) {
                     console.log(`🔄 Using stale data for ${coin.symbol} (rate limited)`)
                     const chartData = processConvexDataToChart(staleData.data)
                     
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
                 } catch (staleError) {
                   console.warn(`Failed to get stale data for coin ${coin.id}:`, staleError)
                 }
               }
             } else {
               console.warn(`❌ Bulk API request failed for chunk ${chunkIndex + 1}:`, response.status)
               // Try to use stale cached data for this chunk
               for (const coin of chunk) {
                 try {
                   const staleData = await convex.query(api.historicalData.getHistoricalData, {
                     coinId: typeof coin.id === 'string' ? parseInt(coin.id) || 0 : coin.id,    
                     timeframe: activeTimeScale
                   })
                   
                   if (staleData.data.length > 0) {
                     console.log(`🔄 Bulk using stale fallback for ${coin.symbol}`)
                     const chartData = processConvexDataToChart(staleData.data)
                     
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
                 } catch (staleError) {
                   console.warn(`Failed to get stale data for coin ${coin.id}:`, staleError)
                 }
               }
             }
          } catch (error) {
            console.error(`Bulk API chunk failed:`, error)
          }
        })

        await Promise.all(bulkPromises)
      }

      const endTime = Date.now()
      const totalQueries = realCoins.length
      const cacheHitRate = totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0

      console.log(`🚀 Bulk multi-chart completed in ${endTime - startTime}ms:`, {
        totalCoins: totalQueries,
        cacheHits,
        cacheMisses,
        bulkApiCalls,
        cacheHitRate: cacheHitRate.toFixed(1) + '%',
        seriesCount: series.length,
        rateLimitSavings: `${realCoins.length - bulkApiCalls} API calls saved`
      })

                   return {
        series,
        performance: {
          cacheHits,
          cacheMisses,
          totalQueries,
          cacheHitRate: Number(cacheHitRate) || 0,
          bulkApiCalls
        }
      }
    },
    staleTime: getStaleTime(activeTimeScale),
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: realCoins.length > 0,
  })

  return {
    series: bulkResponse?.series || [],
    isLoading: isLoading,
    hasData: (bulkResponse?.series || []).length > 0,
    performance: bulkResponse?.performance || {
      cacheHits: 0,
      cacheMisses: 0,
      totalQueries: 0,
      cacheHitRate: 0,
      bulkApiCalls: 0
    }
  }
}

// Helper function to process Convex data into chart format with validation
function processConvexDataToChart(convexData: Array<{ timestamp: number; price: number }>): MultiChartDataPoint[] {
  if (!convexData.length) return []
  
  // Filter and validate data points before processing
  const validData = convexData.filter(point => 
    point.timestamp &&
    typeof point.price === 'number' &&
    point.price > 0 &&
    !isNaN(point.price) &&
    isFinite(point.price)
  ).sort((a, b) => a.timestamp - b.timestamp) // Sort by timestamp
  
  if (!validData.length) return []
  
  const chartData: MultiChartDataPoint[] = []
  const initialPrice = validData[0]?.price
  
  if (initialPrice && initialPrice > 0) {
    validData.forEach(point => {
      const currentPrice = point.price
      const percentChange = ((currentPrice - initialPrice) / initialPrice) * 100
      
      // Additional validation for chart data
      if (typeof percentChange === 'number' && !isNaN(percentChange) && isFinite(percentChange)) {
        chartData.push({
          time: (point.timestamp / 1000) as Time,
          value: percentChange,
        })
      }
    })
  }
  
  return chartData
}

// Helper function to process API data into chart format
function processApiDataToChart(apiData: ApiData): MultiChartDataPoint[] {
  const chartData: MultiChartDataPoint[] = []
  
  // Try OHLCV data first (better quality)
  if (apiData.ohlcv?.data?.quotes?.length) {
    const quotes = apiData.ohlcv.data.quotes
    if (quotes.length > 0) {
      const initialPrice = quotes[0]?.quote?.USD?.close
      
      if (initialPrice && initialPrice > 0) {
        quotes.forEach((quote: OHLCVQuote) => {
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
        .filter((quote: HistoricalQuote) => quote?.quote?.USD?.price)
        .sort((a: HistoricalQuote, b: HistoricalQuote) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
      
      if (sortedQuotes.length > 0) {
        const initialPrice = sortedQuotes[0]?.quote?.USD?.price
        
        if (initialPrice && initialPrice > 0) {
          sortedQuotes.forEach((quote: HistoricalQuote) => {
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

  return chartData.sort((a, b) => (a.time as number) - (b.time as number))
}

// Helper function to cache API data in Convex
async function cacheApiDataInConvex(
  convex: ReturnType<typeof useConvex>,
  coinId: string,
  timeScale: string,
  apiData: ApiData
) {
  try {
    // Cache OHLCV data if available
    if (apiData.ohlcv?.data?.quotes?.length) {
      const dataPoints = apiData.ohlcv.data.quotes.map((quote: OHLCVQuote) => {
        const usdData = quote.quote?.USD
        if (!usdData) throw new Error('Missing USD data')
        
        return {
          timestamp: new Date(quote.time_close).getTime(),
          price: usdData.close,
          volume: usdData.volume,
          marketCap: usdData.market_cap,
          open: usdData.open,
          high: usdData.high,
          low: usdData.low,
          close: usdData.close,
        }
      })

      await convex.mutation(api.historicalData.upsertHistoricalDataIncremental, {
        coinId: Number(coinId),
        timeframe: timeScale,
        dataPoints,
        dataSource: "coinmarketcap"
      })

      console.log(`💾 Bulk cached ${dataPoints.length} OHLCV data points for coin ${coinId}`)
    } else if (apiData.historical?.data?.quotes?.length) {
      const dataPoints = apiData.historical.data.quotes.map((quote: HistoricalQuote) => {
        const usdData = quote.quote?.USD
        if (!usdData) throw new Error('Missing USD data')
        
        return {
          timestamp: new Date(quote.timestamp).getTime(),
          price: usdData.price,
          volume: usdData.volume_24h || 0,
          marketCap: usdData.market_cap,
          open: usdData.price,
          high: usdData.price,
          low: usdData.price,
          close: usdData.price,
        }
      })

      await convex.mutation(api.historicalData.upsertHistoricalDataIncremental, {
        coinId: Number(coinId),
        timeframe: timeScale,
        dataPoints,
        dataSource: "coinmarketcap"
      })

      console.log(`💾 Bulk cached ${dataPoints.length} historical data points for coin ${coinId}`)
    }
  } catch (error) {
    console.warn(`Bulk failed to cache data for ${coinId}:`, error)
  }
} 