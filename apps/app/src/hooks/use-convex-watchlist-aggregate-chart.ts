'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Time } from 'lightweight-charts'
import { useRateLimitRecovery } from './use-rate-limit-recovery'

interface WatchlistCoin {
  id: number
  name: string
  symbol: string
  quote: {
    USD: {
      price: number
      percent_change_24h: number
      market_cap: number
      volume_24h: number
    }
  }
}

interface AggregateDataPoint {
  time: Time
  value: number // Aggregate percentage change from baseline
}

interface UseConvexWatchlistAggregateChartProps {
  coins: WatchlistCoin[]
  timeScale?: string
}

interface ConvexWatchlistAggregateResult {
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

// Cache timing functions
function getStaleTime(timeScale: string): number {
  const staleTimeMap = {
    '1d': 2 * 60 * 1000,       // 2 minutes for intraday
    '7d': 5 * 60 * 1000,       // 5 minutes for short-term
    '30d': 60 * 60 * 1000,     // 15 minutes for medium-term
    'max': 60 * 60 * 1000,     // 1 hour for long-term
    '2y': 60 * 60 * 1000,      // 1 hour for long-term
  } as const
  
  return staleTimeMap[timeScale as keyof typeof staleTimeMap] || 2 * 60 * 1000
}

/**
 * Convex-first watchlist aggregate chart hook that:
 * 1. Checks Convex cache first for each coin's historical data
 * 2. Falls back to API only when cache is stale/missing
 * 3. Processes data into aggregate percentage changes
 * 4. Provides same interface as useWatchlistAggregateChart
 */
export function useConvexWatchlistAggregateChart({ 
  coins, 
  timeScale = '30d' 
}: UseConvexWatchlistAggregateChartProps): ConvexWatchlistAggregateResult {
  const convex = useConvex()
  const { fetchWithRecovery } = useRateLimitRecovery()
  const [aggregateData, setAggregateData] = useState<AggregateDataPoint[]>([])

  // Get coin IDs for fetching historical data
  const coinIds = useMemo(() => {
    return coins.map(coin => coin.id)
  }, [coins])

  // Convex-first data fetching
  const { data: historicalData, isLoading } = useQuery({
    queryKey: ['convex-watchlist-aggregate', coinIds.sort().join(','), timeScale],
    queryFn: async () => {
      if (!coinIds.length) return { data: {}, performance: { cacheHits: 0, cacheMisses: 0, totalQueries: 0 } }

      const startTime = Date.now()
      let cacheHits = 0
      let cacheMisses = 0
      const result: Record<string, { data: { quotes: Array<{ timestamp: string; quote: { USD: { price: number } } }> } }> = {}

      try {
        // Check Convex cache for each coin
        const cachePromises = coinIds.map(async (coinId) => {
          try {
            const cachedData = await convex.query(api.historicalData.getHistoricalData, {
              coinId,
              timeframe: timeScale
            })

            if (cachedData.cached && !cachedData.stale && cachedData.data.length > 0) {
              // Fresh cached data available
              console.log(`🚀 Aggregate cache hit for ${coinId} (${timeScale}):`, {
                dataPoints: cachedData.dataPoints,
                lastUpdated: new Date(cachedData.lastUpdated).toLocaleString()
              })
              
              cacheHits++
              // Transform Convex data to match expected format
              result[coinId] = {
                data: {
                  quotes: cachedData.data.map(point => ({
                    timestamp: new Date(point.timestamp).toISOString(),
                    quote: {
                      USD: {
                        price: point.price,
                        volume_24h: point.volume || 0,
                        market_cap: point.marketCap || 0,
                        timestamp: new Date(point.timestamp).toISOString()
                      }
                    }
                  }))
                }
              }
              return true
            } else {
              // Cache miss or stale data
              cacheMisses++
              return false
            }
          } catch (error) {
            console.warn(`Failed to get cached data for coin ${coinId}:`, error)
            cacheMisses++
            return false
          }
        })

        const cacheResults = await Promise.all(cachePromises)
        const missedCoins = coinIds.filter((_, index) => !cacheResults[index])

        // Fetch missing coins from API
        if (missedCoins.length > 0) {
          const apiPromises = missedCoins.map(async (coinId) => {
            try {
              const response = await fetchWithRecovery(`/api/coins/${coinId}?timeScale=${timeScale}`)
              if (!response.ok) {
                // Try to use stale cached data as fallback
                const staleData = await convex.query(api.historicalData.getHistoricalData, {
                  coinId,
                  timeframe: timeScale
                })
                
                if (staleData.data.length > 0) {
                  console.log(`🔄 Aggregate using stale fallback for ${coinId}`)
                  result[coinId] = {
                    data: {
                      quotes: staleData.data.map(point => ({
                        timestamp: new Date(point.timestamp).toISOString(),
                        quote: {
                          USD: {
                            price: point.price,
                            volume_24h: point.volume || 0,
                            market_cap: point.marketCap || 0,
                            timestamp: new Date(point.timestamp).toISOString()
                          }
                        }
                      }))
                    }
                  }
                }
                return
              }
              
              const data = await response.json()
              
              // Cache the fresh data (fire and forget)
              cacheApiDataInConvex(convex, coinId.toString(), timeScale, data)
              
              // Transform API data to match expected format
              if (data.ohlcv?.data?.quotes?.length) {
                result[coinId] = {
                  data: {
                    quotes: data.ohlcv.data.quotes.map((quote: {
                      time_close: string
                      quote: { USD: { close: number } }
                    }) => ({
                      timestamp: quote.time_close,
                      quote: {
                        USD: {
                          price: quote.quote.USD.close,
                          volume_24h: 0,
                          market_cap: 0,
                          timestamp: quote.time_close
                        }
                      }
                    }))
                  }
                }
              } else if (data.historical?.data?.quotes?.length) {
                result[coinId] = {
                  data: {
                    quotes: data.historical.data.quotes
                  }
                }
              }
            } catch (error) {
              console.error(`Failed to fetch data for coin ${coinId}:`, error)
              
              // Try to use stale cached data as last resort
              try {
                const staleData = await convex.query(api.historicalData.getHistoricalData, {
                  coinId,
                  timeframe: timeScale
                })
                
                if (staleData.data.length > 0) {
                  console.log(`🔄 Aggregate using stale fallback for ${coinId}`)
                  result[coinId] = {
                    data: {
                      quotes: staleData.data.map(point => ({
                        timestamp: new Date(point.timestamp).toISOString(),
                        quote: {
                          USD: {
                            price: point.price,
                            volume_24h: point.volume || 0,
                            market_cap: point.marketCap || 0,
                            timestamp: new Date(point.timestamp).toISOString()
                          }
                        }
                      }))
                    }
                  }
                }
              } catch (staleError) {
                console.warn(`Failed to get stale data for coin ${coinId}:`, staleError)
              }
            }
          })

          await Promise.all(apiPromises)
        }

        const endTime = Date.now()
        console.log(`🚀 Convex aggregate fetch completed in ${endTime - startTime}ms:`, {
          totalCoins: coinIds.length,
          cacheHits,
          cacheMisses,
          cacheHitRate: coinIds.length > 0 ? (cacheHits / coinIds.length) * 100 : 0
        })

        return {
          data: result,
          performance: {
            cacheHits,
            cacheMisses,
            totalQueries: coinIds.length
          }
        }
      } catch (error) {
        console.error('Error fetching Convex aggregate data:', error)
        return { 
          data: {},
          performance: {
            cacheHits,
            cacheMisses,
            totalQueries: coinIds.length
          }
        }
      }
    },
    enabled: coinIds.length > 0,
    staleTime: getStaleTime(timeScale),
    refetchInterval: false,
    placeholderData: (previousData) => previousData,
  })

  // Process and aggregate the data
  useEffect(() => {
    if (!historicalData?.data || !coins.length) {
      console.log('No historical data or coins:', { hasData: !!historicalData?.data, coinsCount: coins.length })
      setAggregateData([])
      return
    }

    console.log('Processing Convex aggregate data for coins:', coins.map(c => c.symbol))
    console.log('Historical data keys:', Object.keys(historicalData.data))

    try {
      // Collect all historical data for each coin
      const coinHistories: Array<{
        coinId: number
        quotes: Array<{ timestamp: string; price: number }>
      }> = []

      // Process each coin's historical data
      coins.forEach(coin => {
        const coinData = historicalData.data[coin.id] || historicalData.data[coin.id.toString()]
        
        console.log(`Processing ${coin.symbol} (${coin.id}):`, {
          hasCoinData: !!coinData,
          hasDataProperty: !!coinData?.data,
          hasQuotes: !!coinData?.data?.quotes,
          quotesLength: coinData?.data?.quotes?.length || 0
        })
        
        if (coinData?.data?.quotes?.length) {
          const quotes = coinData.data.quotes
            .map((quote: { timestamp: string; quote: { USD: { price: number } } }) => ({
              timestamp: quote.timestamp,
              price: quote.quote.USD.price || 0
            }))
            .filter((quote: { timestamp: string; price: number }) => quote.price > 0)
            .sort((a: { timestamp: string; price: number }, b: { timestamp: string; price: number }) => 
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            )

          console.log(`${coin.symbol}: Processed ${quotes.length} valid quotes`)

          if (quotes.length > 0) {
            coinHistories.push({
              coinId: coin.id,
              quotes
            })
          }
        } else {
          console.log(`${coin.symbol}: No valid quotes found`)
        }
      })

      if (coinHistories.length === 0) {
        setAggregateData([])
        return
      }

      // Find common time points across all coins
      const allTimestamps = new Set<string>()
      coinHistories.forEach(history => {
        history.quotes.forEach(quote => {
          allTimestamps.add(quote.timestamp)
        })
      })

      const sortedTimestamps = Array.from(allTimestamps).sort()

      // Calculate aggregate performance for each timestamp
      const aggregatePoints: AggregateDataPoint[] = []

      // Get baseline prices (first available price for each coin)
      const baselines = new Map<number, number>()
      coinHistories.forEach(history => {
        if (history.quotes.length > 0 && history.quotes[0]) {
          baselines.set(history.coinId, history.quotes[0].price)
        }
      })

      sortedTimestamps.forEach(timestamp => {
        const timestampMs = new Date(timestamp).getTime()
        let totalPercentChange = 0
        let validCoins = 0

        // For each coin, find the price at this timestamp and calculate % change
        coinHistories.forEach(history => {
          const baseline = baselines.get(history.coinId)
          if (!baseline || baseline <= 0) return

          // Find closest price to this timestamp
          const quote = history.quotes.find(q => q.timestamp === timestamp)
          if (quote && quote.price > 0) {
            const percentChange = ((quote.price - baseline) / baseline) * 100
            totalPercentChange += percentChange
            validCoins++
          }
        })

        // Only add point if we have data for at least half the coins
        if (validCoins >= Math.ceil(coinHistories.length / 2)) {
          const averagePercentChange = totalPercentChange / validCoins
          
          aggregatePoints.push({
            time: (timestampMs / 1000) as Time,
            value: averagePercentChange
          })
        }
      })

      // Sort by time and filter out invalid points
      const validAggregateData = aggregatePoints
        .filter(point => !isNaN(point.value) && isFinite(point.value))
        .sort((a, b) => (a.time as number) - (b.time as number))

      console.log(`Processed Convex aggregate data: ${validAggregateData.length} points for ${coinHistories.length} coins`)
      setAggregateData(validAggregateData)

    } catch (error) {
      console.error('Error processing Convex aggregate chart data:', error)
      setAggregateData([])
    }
  }, [historicalData, coins])

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
    isLoading: isLoading && aggregateData.length === 0,
    currentAggregateChange,
    coinsCount: coins.length,
    performance
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

      console.log(`💾 Aggregate cached ${dataPoints.length} OHLCV data points for coin ${coinId}`)
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

      console.log(`💾 Aggregate cached ${dataPoints.length} historical data points for coin ${coinId}`)
    }
  } catch (error) {
    console.warn(`Aggregate failed to cache data for ${coinId}:`, error)
  }
} 