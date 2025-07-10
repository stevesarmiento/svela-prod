import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
import { useRateLimitRecovery } from './use-rate-limit-recovery'
import { useRequestThrottle } from './use-request-throttle'

interface MiniChartData {
  time: Time
  value: number
}

interface MiniVolumeData {
  time: Time
  value: number
}

interface HistoricalQuote {
  timestamp: string
  quote?: {
    USD?: {
      price?: number
      volume_24h?: number
    }
  }
}

interface OHLCVQuote {
  time_close: string
  quote: {
    USD: {
      close: number
      volume: number
    }
  }
}

interface UseMiniChartDataReturn {
  chartData: MiniChartData[]
  volumeData: MiniVolumeData[]
  isLoading: boolean
  currentPrice: number
  priceChange24h: number
  isRateLimited: boolean
  rateLimitState: {
    isRateLimited: boolean
    retryAfter: number | null
    lastRateLimitTime: number | null
  }
}

export function useMiniChartData(coinId: string, initialPrice?: number): UseMiniChartDataReturn {
  const [chartData, setChartData] = useState<MiniChartData[]>([])
  const [volumeData, setVolumeData] = useState<MiniVolumeData[]>([])
  
  // Use our rate limiting and throttling hooks
  const { fetchWithRecovery, rateLimitState } = useRateLimitRecovery({
    maxRetries: 2,
    initialDelay: 1000,
    maxDelay: 10000
  })
  const { throttledFetch } = useRequestThrottle({
    delay: 200,
    maxConcurrent: 2,
    debounceTime: 1000
  })

  // Fetch 90 days of historical data using the same working endpoint as main chart
  const { data: historicalData, isLoading } = useQuery({
    queryKey: ['miniChartData', coinId],
    queryFn: async () => {
      try {
        const response = await throttledFetch(`/api/coins/${coinId}?timeScale=90d`)
        if (!response.ok) {
          // Check for rate limiting
          if (response.status === 429) {
            throw new Error('RATE_LIMITED')
          }
          throw new Error(`Failed to fetch mini chart data: ${response.status}`)
        }
        return response.json()
      } catch (error) {
        // Use fallback recovery for rate limited requests
        if (error instanceof Error && error.message === 'RATE_LIMITED') {
          console.warn('🚫 Mini chart data rate limited, using recovery...')
          const recoveryResponse = await fetchWithRecovery(`/api/coins/${coinId}?timeScale=90d`)
          if (!recoveryResponse.ok) throw new Error('Recovery fetch failed')
          return recoveryResponse.json()
        }
        throw error
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry rate limit errors immediately
      if (error instanceof Error && error.message.includes('RATE_LIMITED')) {
        return false
      }
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  // Fetch current market data for live price
  const { data: marketData } = useQuery({
    queryKey: ['miniChartMarketData', coinId],
    queryFn: async () => {
      try {
        const response = await throttledFetch(`/api/coinmarketcap/quotes?ids=${coinId}`)
        if (!response.ok) {
          if (response.status === 429) {
            throw new Error('RATE_LIMITED')
          }
          throw new Error(`Failed to fetch market data: ${response.status}`)
        }
        const data = await response.json()
        return data.data[coinId]
      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMITED') {
          console.warn('🚫 Mini chart market data rate limited, using recovery...')
          const recoveryResponse = await fetchWithRecovery(`/api/coinmarketcap/quotes?ids=${coinId}`)
          if (!recoveryResponse.ok) throw new Error('Recovery fetch failed')
          const data = await recoveryResponse.json()
          return data.data[coinId]
        }
        throw error
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('RATE_LIMITED')) {
        return false
      }
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15000),
  })

  // Process historical data when it arrives (using same logic as main chart)
  useEffect(() => {
    if (!historicalData) return

    try {
      console.log('Processing mini chart data:', historicalData)
      
      const dataSource = historicalData
      let processedChartData: MiniChartData[] = []
      let processedVolumeData: MiniVolumeData[] = []

      // Try OHLCV first (same as main chart)
      if (dataSource?.ohlcv?.data?.quotes?.length) {
        console.log('Using OHLCV data')
        const ohlcvQuotes = dataSource.ohlcv.data.quotes
        
        processedChartData = ohlcvQuotes.map((quote: OHLCVQuote) => ({
          time: new Date(quote.time_close).getTime() / 1000 as Time,
          value: quote.quote?.USD?.close || 0,
        }))

        processedVolumeData = ohlcvQuotes.map((quote: OHLCVQuote) => ({
          time: new Date(quote.time_close).getTime() / 1000 as Time,
          value: quote.quote?.USD?.volume || 0,
        }))
      }
      // Fallback to historical data
      else if (dataSource?.historical?.data?.quotes?.length) {
        console.log('Using historical data')
        const quotes = dataSource.historical.data.quotes
        
        processedChartData = quotes.map((quote: HistoricalQuote) => ({
          time: new Date(quote.timestamp).getTime() / 1000 as Time,
          value: quote.quote?.USD?.price || 0,
        }))

        processedVolumeData = quotes.map((quote: HistoricalQuote) => ({
          time: new Date(quote.timestamp).getTime() / 1000 as Time,
          value: quote.quote?.USD?.volume_24h || 0,
        }))
      }
      else {
        console.log('No valid data structure found:', Object.keys(dataSource))
        return
      }

      // Filter to last 90 days and remove invalid data
      const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000)
      
      processedChartData = processedChartData
        .filter(item => {
          const timestamp = Number(item.time) * 1000
          return timestamp >= ninetyDaysAgo && item.value > 0
        })
        .sort((a, b) => Number(a.time) - Number(b.time))

      processedVolumeData = processedVolumeData
        .filter(item => {
          const timestamp = Number(item.time) * 1000
          return timestamp >= ninetyDaysAgo && item.value > 0
        })
        .sort((a, b) => Number(a.time) - Number(b.time))

      console.log('Processed chart data:', processedChartData.length, 'points')
      console.log('Sample data:', processedChartData.slice(0, 3))
      
      setChartData(processedChartData)
      setVolumeData(processedVolumeData)
    } catch (error) {
      console.error('Error processing mini chart data:', error)
    }
  }, [historicalData])

  // Get current price and 24h change
  const currentPrice = marketData?.quote?.USD?.price || initialPrice || 0
  const priceChange24h = marketData?.quote?.USD?.percent_change_24h || 0

  return {
    chartData,
    volumeData,
    isLoading: isLoading && chartData.length === 0,
    currentPrice,
    priceChange24h,
    isRateLimited: rateLimitState.isRateLimited,
    rateLimitState,
  }
} 