'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'

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

interface UseWatchlistAggregateChartProps {
  coins: WatchlistCoin[]
  timeScale?: string
}



export function useWatchlistAggregateChart({ 
  coins, 
  timeScale = '30d' 
}: UseWatchlistAggregateChartProps) {
  const [aggregateData, setAggregateData] = useState<AggregateDataPoint[]>([])

  // Get coin IDs for fetching historical data
  const coinIds = useMemo(() => {
    return coins.map(coin => coin.id)
  }, [coins])

  // Optimized: Fetch data using individual coin endpoints for better caching
  const { data: historicalData, isLoading } = useQuery({
    queryKey: ['optimized-watchlist-aggregate', coinIds.sort().join(','), timeScale],
    queryFn: async () => {
      if (!coinIds.length) return null

      try {
        // Use parallel individual API calls for better caching (same as main chart)
        const responses = await Promise.allSettled(
          coinIds.map(async (coinId) => {
            const response = await fetch(`/api/coins/${coinId}?timeScale=${timeScale}`)
            if (!response.ok) throw new Error(`Failed to fetch coin ${coinId}`)
            const data = await response.json()
            return { coinId, data }
          })
        )

        // Transform responses to match existing data structure
        const result: Record<string, { data: { quotes: Array<{ timestamp: string; quote: { USD: { price: number } } }> } }> = {}
        
        responses.forEach((response, index) => {
          if (response.status === 'fulfilled') {
            const coinId = coinIds[index]
            if (!coinId) return
            
                         // Try OHLCV data first (better quality), then fall back to historical
             if (response.value.data.ohlcv?.data?.quotes?.length) {
               result[coinId] = {
                 data: {
                   quotes: response.value.data.ohlcv.data.quotes.map((quote: {
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
            } else if (response.value.data.historical?.data?.quotes?.length) {
              result[coinId] = {
                data: {
                  quotes: response.value.data.historical.data.quotes
                }
              }
            }
          }
        })

        console.log(`📊 Optimized watchlist aggregate: ${Object.keys(result).length}/${coinIds.length} coins fetched`)
        return { data: result }
      } catch (error) {
        console.error('Error fetching optimized watchlist data:', error)
        return { data: {} }
      }
    },
    enabled: coinIds.length > 0,
    staleTime: getStaleTime(timeScale), // Dynamic cache time
    refetchInterval: false,
    placeholderData: (previousData) => previousData,
  })

// Helper function for dynamic cache timing
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

  // Process and aggregate the data
  useEffect(() => {
    if (!historicalData?.data || !coins.length) {
      console.log('No historical data or coins:', { hasData: !!historicalData?.data, coinsCount: coins.length })
      setAggregateData([])
      return
    }

    console.log('Processing aggregate data for coins:', coins.map(c => c.symbol))
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
        
        // Process the optimized data structure
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

      console.log(`Processed aggregate data: ${validAggregateData.length} points for ${coinHistories.length} coins`)
      setAggregateData(validAggregateData)

    } catch (error) {
      console.error('Error processing aggregate chart data:', error)
      setAggregateData([])
    }
  }, [historicalData, coins])

  // Calculate current aggregate performance for display
  const currentAggregateChange = useMemo(() => {
    if (!coins.length) return 0
    
    const totalChange = coins.reduce((sum, coin) => sum + coin.quote.USD.percent_change_24h, 0)
    return totalChange / coins.length
  }, [coins])

  return {
    aggregateData,
    isLoading: isLoading && aggregateData.length === 0,
    currentAggregateChange,
    coinsCount: coins.length
  }
} 