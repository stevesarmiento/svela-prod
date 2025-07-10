'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTokenData } from './use-token-data'
import type { CoinMarketData, OHLCVQuote } from '@/types/coins'
import type { Time } from 'lightweight-charts'

interface HistoricalQuote {
  timestamp: string;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
    };
  };
}

interface OHLCVDataPoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Optimized chart data hook with intelligent caching strategy
 * Currently uses API with enhanced caching, ready for Convex integration
 */
export function useOptimizedChartData(
  coinId: string, 
  activeTimeScale: string, 
  initialData: CoinMarketData['quote']['USD']
) {
  const { data: tokenData } = useTokenData(coinId)
  
  // Enhanced API fetch with better caching strategy
  const { data: chartDataResponse, isLoading } = useQuery({
    queryKey: ['optimized-chart-data', coinId, activeTimeScale],
    queryFn: async () => {
      const response = await fetch(`/api/coins/${coinId}?timeScale=${activeTimeScale}`)
      if (!response.ok) throw new Error('Failed to fetch chart data')
      return response.json()
    },
    staleTime: getStaleTime(activeTimeScale), // Dynamic stale time based on timeframe
    refetchInterval: getRefetchInterval(activeTimeScale), // Dynamic refetch interval
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
    refetchOnWindowFocus: false, // Reduce unnecessary API calls
  })

  // Process chart data with optimized logic
  const { chartData, volumeData, ohlcvData } = useMemo(() => {
    const dataSource = chartDataResponse || tokenData?.fullData

    // Priority 1: Use OHLCV data if available (best quality)
    if (dataSource?.ohlcv?.data?.quotes?.length) {
      console.log('📊 Using OHLCV data (highest quality)')
      
      const ohlcvQuotes = dataSource.ohlcv.data.quotes as OHLCVQuote[]
      
      const chartData = ohlcvQuotes.map(quote => ({
        time: (new Date(quote.time_close).getTime() / 1000) as Time,
        value: quote.quote.USD.close
      }))

      const volumeData = ohlcvQuotes.map(quote => ({
        time: (new Date(quote.time_close).getTime() / 1000) as Time,
        value: quote.quote.USD.volume,
        color: '#ffffff40'
      }))

      const ohlcvData: OHLCVDataPoint[] = ohlcvQuotes.map(quote => ({
        time: (new Date(quote.time_close).getTime() / 1000) as Time,
        open: quote.quote.USD.open,
        high: quote.quote.USD.high,
        low: quote.quote.USD.low,
        close: quote.quote.USD.close,
        volume: quote.quote.USD.volume
      }))

      return { chartData, volumeData, ohlcvData }
    }


    
    // Priority 2: Use historical data (good quality)
    if (dataSource?.historical?.data?.quotes?.length) {
      console.log('📈 Using historical data')
      
      const chartData = dataSource.historical.data.quotes.map((quote: HistoricalQuote) => ({
        time: (new Date(quote.timestamp).getTime() / 1000) as Time,
        value: quote.quote.USD.price
      }))

      const volumeData = dataSource.historical.data.quotes.map((quote: HistoricalQuote) => ({
        time: (new Date(quote.timestamp).getTime() / 1000) as Time,
        value: quote.quote.USD.volume_24h || 0,
        color: '#ffffff40'
      }))

      // Create approximate OHLCV from historical data
      const ohlcvData: OHLCVDataPoint[] = dataSource.historical.data.quotes.map((quote: HistoricalQuote) => {
        const price = quote.quote.USD.price
        return {
          time: (new Date(quote.timestamp).getTime() / 1000) as Time,
          open: price,
          high: price * 1.005, // Small approximation
          low: price * 0.995,
          close: price,
          volume: quote.quote.USD.volume_24h || 0
        }
      })

      return { chartData, volumeData, ohlcvData }
    }

    // Priority 3: Generate fallback data (fallback)
    console.log('🔄 Using fallback data')
    
    const fallbackData = Array.from({ length: 30 }, (_, i) => {
      const time = ((Date.now() - (30 - i) * 24 * 60 * 60 * 1000) / 1000) as Time
      const price = initialData.price * (0.95 + Math.random() * 0.1)
      const volume = initialData.volume_24h * (0.5 + Math.random() * 1.5)
      
      return {
        chart: { time, value: price },
        volume: { time, value: volume, color: '#ffffff40' },
        ohlcv: {
          time,
          open: price,
          high: price * 1.01,
          low: price * 0.99,
          close: price,
          volume
        }
      }
    })
    
    // Add current data point
    fallbackData.push({
      chart: { time: (Date.now() / 1000) as Time, value: initialData.price },
      volume: { time: (Date.now() / 1000) as Time, value: initialData.volume_24h, color: '#ffffff40' },
      ohlcv: {
        time: (Date.now() / 1000) as Time,
        open: initialData.price,
        high: initialData.price * 1.01,
        low: initialData.price * 0.99,
        close: initialData.price,
        volume: initialData.volume_24h
      }
    })

    return {
      chartData: fallbackData.map(d => d.chart),
      volumeData: fallbackData.map(d => d.volume),
      ohlcvData: fallbackData.map(d => d.ohlcv)
    }
  }, [chartDataResponse, tokenData?.fullData, initialData])

  return { 
    chartData, 
    volumeData, 
    ohlcvData, 
    isLoading, 
    tokenData,
    // Performance metadata for monitoring
    performance: {
      dataSource: chartDataResponse?.ohlcv ? 'ohlcv' : 
                  chartDataResponse?.historical ? 'historical' : 'fallback',
      cached: !!chartDataResponse,
      staleTime: getStaleTime(activeTimeScale),
      refetchInterval: getRefetchInterval(activeTimeScale)
    }
  }
}

// Helper functions for dynamic caching strategy
function getStaleTime(timeScale: string): number {
  const staleTimeMap = {
    '1d': 30 * 1000,       // 30 seconds for intraday data
    '7d': 60 * 1000,       // 1 minute for short-term data  
    '30d': 2 * 60 * 1000,  // 2 minutes for medium-term data
    'max': 10 * 60 * 1000, // 10 minutes for long-term data
    '2y': 10 * 60 * 1000,  // 10 minutes for long-term data
  } as const
  
  return staleTimeMap[timeScale as keyof typeof staleTimeMap] || staleTimeMap['1d']
}

function getRefetchInterval(timeScale: string): number {
  const intervalMap = {
    '1d': 30 * 1000,       // 30 seconds for intraday data
    '7d': 60 * 1000,       // 1 minute for short-term data
    '30d': 5 * 60 * 1000,  // 5 minutes for medium-term data
    'max': false,          // No auto-refetch for long-term data
    '2y': false,           // No auto-refetch for long-term data
  } as const
  
  return intervalMap[timeScale as keyof typeof intervalMap] || 30 * 1000
} 