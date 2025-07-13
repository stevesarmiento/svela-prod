'use client'

import { useQuery } from '@tanstack/react-query'
import type { Time } from 'lightweight-charts'
import type { CoinMarketData } from '@/types/coins'
import { useCoinGeckoOHLC } from './use-coingecko-ohlc'

// Map time scales to CoinGecko days parameter
const TIME_SCALE_DAYS = {
  '1d': '1',
  '7d': '7', 
  '30d': '30',
  'max': '365',
  '2y': '730'
}

interface ChartDataPoint {
  time: number
  value: number
}

interface OHLCVDataPoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface CoinGeckoChartDataResult {
  chartData: Array<{ time: Time; value: number }>
  volumeData: Array<{ time: Time; value: number; color: string }>
  ohlcvData: OHLCVDataPoint[]
  ohlcData: Array<{ time: Time; open: number; high: number; low: number; close: number }>
  isLoading: boolean
  tokenData: null // Can add later
  performance: {
    dataSource: 'coingecko-cache' | 'coingecko-fresh' | 'coingecko-stale' | 'fallback'
    cached: boolean
    cacheHitRate: number
  }
}

export function useCoinGeckoChartData(
  coinId: string,
  activeTimeScale: string,
  initialData: CoinMarketData['quote']['USD']
): CoinGeckoChartDataResult {
  const days = TIME_SCALE_DAYS[activeTimeScale as keyof typeof TIME_SCALE_DAYS] || '7'
  
  // Fetch OHLC data
  const { ohlcData: rawOhlcData, isLoading: isOhlcLoading } = useCoinGeckoOHLC(coinId, { 
    days: days as '1' | '7' | '14' | '30' | '90' | '180' | '365' | 'max'
  })
  
  // Transform OHLC data for chart usage, with fallback to line chart data
  const ohlcData = rawOhlcData.length > 0 
    ? rawOhlcData.map(point => ({
        time: (point.timestamp / 1000) as Time,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      }))
    : []
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['coingecko-chart-data', coinId, activeTimeScale],
    queryFn: async () => {
      console.log('🎯 Fetching CoinGecko chart data:', { coinId, days, timeScale: activeTimeScale })
      
      const response = await fetch(`/api/coingecko/market-chart?id=${coinId}&days=${days}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch chart data: ${response.status}`)
      }
      
      return response.json()
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: !!coinId,
    retry: 2,
  })

  // Transform data for charts
  const chartData = data?.data?.prices?.map((point: ChartDataPoint) => ({
    time: point.time as Time,
    value: point.value
  })) || []

  const volumeData = data?.data?.volumes?.map((point: ChartDataPoint) => ({
    time: point.time as Time,
    value: point.value,
    color: '#ffffff40'
  })) || []

  // Generate realistic OHLCV for candlestick charts
  const ohlcvData: OHLCVDataPoint[] = chartData.map((point: { time: Time; value: number }, index: number) => {
    const price = point.value
    const prevPrice = index > 0 ? chartData[index - 1]?.value || price : price
    const volatility = Math.abs(price - prevPrice) * 0.05 + price * 0.002 // 0.5% + 0.2% base volatility
    
    const open = prevPrice
    const close = price
    const spread = volatility * 0.6
    
    return {
      time: point.time,
      open: open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread, 
      close: close,
      volume: volumeData[index]?.value || 0
    }
  })

  // Fallback data if no response
  if (error || (!isLoading && chartData.length === 0)) {
    console.log('🔄 Using fallback data for chart')
    
    const fallbackData = Array.from({ length: 30 }, (_, i) => {
      const time = ((Date.now() - (30 - i) * 24 * 60 * 60 * 1000) / 1000) as Time
      const price = initialData.price * (0.95 + Math.random() * 0.1)
      const volume = initialData.volume_24h * (0.5 + Math.random() * 1.5)
      
      return {
        chart: { time, value: price },
        volume: { time, value: volume, color: '#ffffff40' },
        ohlcv: {
          time,
          open: price * 0.998,
          high: price * 1.002,
          low: price * 0.997,
          close: price,
          volume
        }
      }
    })
    
    return {
      chartData: fallbackData.map(d => d.chart),
      volumeData: fallbackData.map(d => d.volume),
      ohlcvData: fallbackData.map(d => d.ohlcv),
      ohlcData,
      isLoading: isOhlcLoading,
      tokenData: null,
      performance: {
        dataSource: 'fallback',
        cached: false,
        cacheHitRate: 0
      }
    }
  }

  // Determine data source for performance tracking
  const dataSource = data?.status?.data_source || 'coingecko-fresh'
  const cached = data?.status?.cached || false

  return {
    chartData,
    volumeData,
    ohlcvData,
    ohlcData,
    isLoading: isLoading || isOhlcLoading,
    tokenData: null,
    performance: {
      dataSource: dataSource as 'coingecko-cache' | 'coingecko-fresh' | 'coingecko-stale' | 'fallback',
      cached,
      cacheHitRate: cached ? 100 : 0
    }
  }
} 