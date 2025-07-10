'use client'

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { CoinMarketData } from '@/types/coins'
import type { Time } from 'lightweight-charts'

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

interface MultiChartData {
  series: CoinChartSeries[]
  isLoading: boolean
  hasData: boolean
  performance: {
    cacheHits: number
    cacheMisses: number
    totalQueries: number
  }
}

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}



/**
 * Optimized hook for multi-coin chart data with intelligent caching
 * Uses the same optimized API endpoints as main chart for consistency
 */
export function useMultiChartData(
  coins: OptimisticCoinMarketData[],
  activeTimeScale: string
): MultiChartData {
  // Filter out optimistic coins for data fetching
  const realCoins = useMemo(() => 
    coins.filter(coin => !coin.isOptimistic), 
    [coins]
  )

  // Use React Query to fetch optimized chart data for each coin
  const queries = useQueries({
    queries: realCoins.map((coin) => ({
      queryKey: ['multi-chart-data', coin.id, activeTimeScale],
      queryFn: async () => {
        try {
          // Use the same optimized API endpoint as the main chart
          const response = await fetch(`/api/coins/${coin.id}?timeScale=${activeTimeScale}`)
          if (!response.ok) {
            console.warn(`API request failed for coin ${coin.id}:`, response.status)
            throw new Error('API request failed')
          }
          
          const data = await response.json()
          return {
            coinId: coin.id,
            data,
            cached: false, // API handles caching internally
            stale: false,
            dataPoints: data.ohlcv?.data?.quotes?.length || data.historical?.data?.quotes?.length || 0,
          }
        } catch (error) {
          console.error(`Failed to fetch data for coin ${coin.id}:`, error)
          return {
            coinId: coin.id,
            data: null,
            cached: false,
            stale: false,
            dataPoints: 0,
          }
        }
      },
      staleTime: getStaleTime(activeTimeScale), // Dynamic cache time
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  })

// Helper function for dynamic cache timing (same as main chart)
function getStaleTime(timeScale: string): number {
  const staleTimeMap = {
    '1d': 30 * 1000,       // 30 seconds for intraday
    '7d': 60 * 1000,       // 1 minute for short-term
    '30d': 2 * 60 * 1000,  // 2 minutes for medium-term
    'max': 10 * 60 * 1000, // 10 minutes for long-term
    '2y': 10 * 60 * 1000,  // 10 minutes for long-term
  } as const
  
  return staleTimeMap[timeScale as keyof typeof staleTimeMap] || 2 * 60 * 1000
}

  // Process the data for chart rendering
  const processedData = useMemo((): MultiChartData => {
    const series: CoinChartSeries[] = []
    const totalQueries = queries.length

    queries.forEach((query, index) => {
      const coin = realCoins[index]
      if (!coin || !query.data?.data) return

      const apiData = query.data.data
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
          hasData: validData.length > 0,
        })
      }
    })

    const isLoading = queries.some(query => query.isLoading)
    const hasData = series.length > 0

    return {
      series,
      isLoading,
      hasData,
      performance: {
        cacheHits: 0, // Simplified version - actual caching handled by API
        cacheMisses: totalQueries,
        totalQueries,
      }
    }
  }, [queries, realCoins])

  return processedData
} 