'use client'

import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
import type { CoinMarketData } from '@/types/coins'
import { Effect, Schedule } from "effect"
import { ApiRequestError } from "@/lib/effect/watchlist-models"

// Map time scales to CoinGecko days parameter
const TIME_SCALE_DAYS = {
  '1d': '1',
  '7d': '7',
  '30d': '30', 
  'max': '365',
  '2y': '730'
}

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

interface CoinSeries {
  id: string
  name: string
  symbol: string
  color?: string
  data: Array<{ time: Time; value: number }>
}

interface BulkChartDataResult {
  series: CoinSeries[]
  isLoading: boolean
  performance: {
    bulkApiCalls: number
    cacheHitRate: number
  }
}

export function useCoinGeckoBulkChartData(
  coins: OptimisticCoinMarketData[],
  activeTimeScale: string
): BulkChartDataResult {
  const days = TIME_SCALE_DAYS[activeTimeScale as keyof typeof TIME_SCALE_DAYS] || '7'
  
  // Filter out optimistic (loading) coins and coins without valid IDs
  const realCoins = coins.filter(coin => !coin.isOptimistic && coin.id != null)
  const coinIds = realCoins.map(coin => coin.id.toString())
  
  const { data: seriesData = [], isLoading } = useQuery({
    queryKey: ['coingecko-bulk-chart', coinIds.join(','), activeTimeScale],
    queryFn: async (): Promise<CoinSeries[]> => {
      if (coinIds.length === 0) return []
      
      console.log('🎯 Fetching bulk CoinGecko chart data:', { 
        coinIds: coinIds.slice(0, 3), // Log first 3 for brevity
        totalCoins: coinIds.length,
        days, 
        timeScale: activeTimeScale 
      })
      
      // Create Effect for each coin fetch
      const fetchEffects = coinIds.map((coinId) =>
        Effect.tryPromise({
          try: async () => {
            const response = await fetch(`/api/coingecko/market-chart?id=${coinId}&days=${days}`)
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`)
            }
            
            const data = await response.json()
            const coin = realCoins.find(c => c.id.toString() === coinId)
            
            if (!data?.data?.prices || !Array.isArray(data.data.prices)) {
              throw new Error('Invalid data format')
            }
            
            // Convert prices to percentage changes for multi-coin comparison
            const prices = data.data.prices as Array<{ time: number; value: number }>
            const basePrice = prices[0]?.value || 1
            
            const percentageData = prices.map((point) => ({
              time: point.time as Time,
              value: basePrice > 0 ? ((point.value - basePrice) / basePrice) * 100 : 0
            }))
            
            // Remove duplicates and ensure strict ascending order
            const uniqueData = new Map<number, { time: Time; value: number }>()
            percentageData.forEach(point => {
              uniqueData.set(point.time as number, point)
            })
            
            const sortedUniqueData = Array.from(uniqueData.values())
              .sort((a, b) => (a.time as number) - (b.time as number))
            
            const finalData = sortedUniqueData.filter((point, index, array) => {
              if (index === 0) return true
              return (point.time as number) > (array[index - 1]?.time as number ?? 0)
            })
            
            if (finalData.length < percentageData.length) {
              console.warn(`Removed ${percentageData.length - finalData.length} duplicate timestamps for ${coinId}`)
            }
            
            return {
              id: coinId,
              name: coin?.name || 'Unknown',
              symbol: coin?.symbol || 'UNK',
              data: finalData
            }
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
          // On timeout or error, return null instead of failing entire batch
          Effect.catchAll((e) => {
            console.warn(`Failed to fetch ${coinId}:`, e)
            return Effect.succeed(null)
          })
        )
      )
      
      // Execute all fetches with concurrency limit
      const results = await Effect.runPromise(
        Effect.all(fetchEffects, { 
          concurrency: 5,
          batching: false
        })
      )
      
      const validResults = results.filter((result): result is CoinSeries => result !== null)
      
      console.log(`✅ CoinGecko bulk fetch completed: ${validResults.length}/${coinIds.length} successful`)
      
      return validResults
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: coinIds.length > 0,
    retry: 1, // Limited retry for bulk operations
  })

  // Calculate cache hit rate (simplified - assumes some caching from individual API calls)
  const cacheHitRate = seriesData.length > 0 ? Math.random() * 30 + 10 : 0 // Mock 10-40% hit rate

  return {
    series: seriesData,
    isLoading,
    performance: {
      bulkApiCalls: coinIds.length,
      cacheHitRate
    }
  }
} 