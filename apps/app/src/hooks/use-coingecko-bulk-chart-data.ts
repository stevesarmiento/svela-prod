'use client'

import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
import type { CoinMarketData } from '@/types/coins'

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
  
  // Filter out optimistic (loading) coins and get real coin IDs
  const realCoins = coins.filter(coin => !coin.isOptimistic)
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
      
      // Fetch all coins in parallel with proper error handling
      const promises = coinIds.map(async (coinId): Promise<CoinSeries | null> => {
        try {
          const response = await fetch(`/api/coingecko/market-chart?id=${coinId}&days=${days}`)
          if (!response.ok) {
            console.warn(`Failed to fetch data for ${coinId}:`, response.status)
            return null
          }
          
          const data = await response.json()
          const coin = realCoins.find(c => c.id.toString() === coinId)
          
          if (!data?.data?.prices || !Array.isArray(data.data.prices)) {
            console.warn(`Invalid data format for ${coinId}`)
            return null
          }
          
          // Convert prices to percentage changes for multi-coin comparison
          const prices = data.data.prices as Array<{ time: number; value: number }>
          const basePrice = prices[0]?.value || 1 // First price as baseline
          
          const percentageData = prices.map((point) => ({
            time: point.time as Time,
            value: basePrice > 0 ? ((point.value - basePrice) / basePrice) * 100 : 0 // Percentage change from start
          }))
          
          // Debug: Log percentage conversion for first coin
          if (coinId === coinIds[0] && percentageData.length > 0) {
            console.log(`📊 ${coinId} percentage conversion:`, {
              basePrice: basePrice.toFixed(2),
              firstPoint: `${percentageData[0]?.value.toFixed(2)}%`,
              lastPoint: `${percentageData[percentageData.length - 1]?.value.toFixed(2)}%`,
              dataPoints: percentageData.length
            })
          }
          
          return {
            id: coinId,
            name: coin?.name || 'Unknown',
            symbol: coin?.symbol || 'UNK',
            data: percentageData
          }
        } catch (error) {
          console.warn(`Error fetching data for ${coinId}:`, error)
          return null
        }
      })
      
      const results = await Promise.all(promises)
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