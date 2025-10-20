'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
import { Effect, Schedule } from "effect"
import { ApiRequestError } from "@/lib/effect/watchlist-models"

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

/**
 * Isolated CoinGecko watchlist aggregate chart hook that:
 * 1. Fetches historical data for all coins in the watchlist  
 * 2. Aggregates them into a combined price line
 * 3. Shows the actual combined performance over time
 */
export function useCoinGeckoWatchlistAggregateChartIsolated({ 
  coins,
  timeScale = '7d'
}: UseCoinGeckoWatchlistAggregateChartIsolatedProps): CoinGeckoWatchlistAggregateIsolatedResult {
  const [aggregateData, setAggregateData] = useState<AggregateDataPoint[]>([])

  // Get CoinGecko IDs for fetching historical data
  const coinIds = useMemo(() => {
    const ids = coins.map(coin => coin.id)
    console.log('🎯 Isolated Watchlist Aggregate - Coin IDs:', ids)
    return ids
  }, [coins])

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
  const { data: historicalData, isLoading } = useQuery({
    queryKey: ['watchlist-aggregate-historical', coinIds.sort().join(','), timeScale],
    queryFn: async () => {
      if (!coinIds.length) return { data: {}, performance: { cacheHits: 0, cacheMisses: 0, totalQueries: 0 } }

      try {
        console.log('🔍 Fetching historical data for watchlist aggregate...', { coinIds, timeScale, days })
        
        // Create Effect for each coin fetch
        const fetchEffects = coinIds.map((coinId) =>
          Effect.tryPromise({
            try: async () => {
              const response = await fetch(`/api/coingecko/market-chart?id=${coinId}&days=${days}`)
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
              }
              const result = await response.json()
              return { coinId, data: result.data || null }
            },
            catch: (error) => new ApiRequestError({
              endpoint: `/api/coingecko/market-chart`,
              status: 500,
              message: `Failed to fetch ${coinId}: ${String(error)}`
            })
          }).pipe(
            // Retry failed requests with exponential backoff
            Effect.retry(Schedule.exponential("500 millis", 2)),
            // Timeout individual requests after 8 seconds
            Effect.timeout("8 seconds"),
            // On timeout, return null data instead of failing
            Effect.catchTag("TimeoutException", () => 
              Effect.succeed({ coinId, data: null })
            ),
            // On API errors, return null data instead of failing entire batch
            Effect.catchTag("ApiRequestError", (e) => {
              console.warn(`Failed to fetch ${coinId}:`, e.message)
              return Effect.succeed({ coinId, data: null })
            })
          )
        )
        
        // Execute all fetches with concurrency limit
        const results = await Effect.runPromise(
          Effect.all(fetchEffects, { 
            concurrency: 5,  // Max 5 concurrent requests
            batching: false  // Don't batch requests
          })
        )
        
        // Process results into a map of historical data
        const historicalDataMap: Record<string, CoinHistoricalData[]> = {}
        let successCount = 0
        
        results.forEach(result => {
          if (result.data && result.data.prices && Array.isArray(result.data.prices)) {
            historicalDataMap[result.coinId] = result.data.prices.map((pricePoint: { time: number; value: number }) => ({
              time: pricePoint.time,
              value: pricePoint.value
            }))
            successCount++
          }
        })

        console.log('🔍 Historical data fetched:', {
          requestedCoins: coinIds.length,
          successfulCoins: successCount,
          coinsWithData: Object.keys(historicalDataMap)
        })
        
        return {
          data: historicalDataMap,
          performance: {
            cacheHits: 0,
            cacheMisses: coinIds.length,
            totalQueries: coinIds.length
          }
        }
      } catch (error) {
        console.error('Error fetching watchlist aggregate historical data:', error)
        return { data: {}, performance: { cacheHits: 0, cacheMisses: 0, totalQueries: 1 } }
      }
    },
    enabled: coinIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 15 * 60 * 1000, // 15 minutes
  })

  // Aggregate historical data into a combined price line
  useEffect(() => {
    if (!historicalData?.data || !coins.length) {
      console.log('No historical data or coins for watchlist aggregate')
      setAggregateData([])
      return
    }

    try {
      const coinDataMap = historicalData.data
      const validCoinIds = Object.keys(coinDataMap).filter(coinId => 
        coinDataMap[coinId] && coinDataMap[coinId].length > 0
      )

      if (validCoinIds.length === 0) {
        console.log('No valid coin data for aggregation')
        setAggregateData([])
        return
      }

      console.log('🎯 Aggregating data for coins:', validCoinIds)

      // Find the shortest data series to ensure we have data for all coins at each point
      const minDataLength = Math.min(...validCoinIds.map(coinId => coinDataMap[coinId]?.length || 0))
      console.log('📊 Using', minDataLength, 'data points for aggregation')

      // Create aggregated data points
      const aggregatedPoints: AggregateDataPoint[] = []
      
      // Sample data points evenly to get ~50 points for smooth chart
      const sampleSize = Math.min(50, minDataLength)
      const step = Math.floor(minDataLength / sampleSize)
      
      for (let i = 0; i < sampleSize; i++) {
        const dataIndex = i * step
        let totalPrice = 0
        let validPriceCount = 0
        let timestamp = 0
        
        // Get price from each coin at this index
        validCoinIds.forEach(coinId => {
          const coinData = coinDataMap[coinId]
          if (coinData && coinData[dataIndex]) {
            totalPrice += coinData[dataIndex].value
            validPriceCount++
            if (timestamp === 0) {
              timestamp = coinData[dataIndex].time
            }
          }
        })

        // Calculate average price across all coins
        if (validPriceCount > 0) {
          const averagePrice = totalPrice / validPriceCount
          
          aggregatedPoints.push({
            time: Math.floor(timestamp / 1000) as Time,
            value: averagePrice
          })
        }
      }

      // Sort by time to ensure proper ordering
      aggregatedPoints.sort((a, b) => (a.time as number) - (b.time as number))

      // Convert to percentage changes for better visualization
      if (aggregatedPoints.length > 0 && aggregatedPoints[0]) {
        const baselinePrice = aggregatedPoints[0].value
        const percentageData = aggregatedPoints.map(point => ({
          time: point.time,
          value: baselinePrice > 0 ? ((point.value - baselinePrice) / baselinePrice) * 100 : 0
        }))

        console.log('🎯 Watchlist Aggregate Data Generated:', {
          coinsCount: validCoinIds.length,
          dataPoints: percentageData.length,
          baselinePrice: baselinePrice.toFixed(6),
          finalChange: percentageData[percentageData.length - 1]?.value.toFixed(2) + '%',
          priceRange: {
            min: Math.min(...aggregatedPoints.map(p => p.value)).toFixed(6),
            max: Math.max(...aggregatedPoints.map(p => p.value)).toFixed(6)
          }
        })

        setAggregateData(percentageData)
      } else {
        setAggregateData([])
      }
    } catch (error) {
      console.error('Error processing watchlist aggregate data:', error)
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
    isLoading,
    currentAggregateChange,
    coinsCount: coins.length,
    performance
  }
} 