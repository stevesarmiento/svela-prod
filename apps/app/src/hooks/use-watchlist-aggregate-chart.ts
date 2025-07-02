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

interface HistoricalQuote {
  timestamp: string
  quote: {
    USD: {
      price: number
      volume_24h?: number
      market_cap?: number
      timestamp: string
    }
  }
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

  // Fetch historical data for all coins
  const { data: historicalData, isLoading } = useQuery({
    queryKey: ['watchlist-aggregate-chart', coinIds.sort().join(','), timeScale],
    queryFn: async () => {
      if (!coinIds.length) return null

      // Fetch historical data for all coins
      const response = await fetch(`/api/coinmarketcap/historical?ids=${coinIds.join(',')}&timeScale=${timeScale}`)
      if (!response.ok) throw new Error('Failed to fetch historical data')
      
      return response.json()
    },
    enabled: coinIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

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
        
        // The API returns: { data: { [coinId]: { data: { quotes: [...] } } } }
        // NOT: { data: { [coinId]: { historical: { data: { quotes: [...] } } } } }
        if (coinData?.data?.quotes?.length) {
          const quotes = coinData.data.quotes
            .map((quote: HistoricalQuote) => ({
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