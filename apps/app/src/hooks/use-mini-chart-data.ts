import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'

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
}

export function useMiniChartData(coinId: string, initialPrice?: number): UseMiniChartDataReturn {
  const [chartData, setChartData] = useState<MiniChartData[]>([])
  const [volumeData, setVolumeData] = useState<MiniVolumeData[]>([])

  // Fetch 90 days of historical data using the same working endpoint as main chart
  const { data: historicalData, isLoading } = useQuery({
    queryKey: ['miniChartData', coinId],
    queryFn: async () => {
      const response = await fetch(`/api/coins/${coinId}?timeScale=90d`)
      if (!response.ok) throw new Error('Failed to fetch mini chart data')
      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch current market data for live price
  const { data: marketData } = useQuery({
    queryKey: ['miniChartMarketData', coinId],
    queryFn: async () => {
      const response = await fetch(`/api/coinmarketcap/quotes?ids=${coinId}`)
      if (!response.ok) throw new Error('Failed to fetch market data')
      const data = await response.json()
      return data.data[coinId]
    },
    staleTime: 30 * 1000, // 30 seconds
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
  }
} 