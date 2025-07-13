'use client'

import { useQuery } from '@tanstack/react-query'
import type { OHLCDataPoint } from '../app/api/coingecko/ohlc/route'

interface OHLCResponse {
  data: OHLCDataPoint[]
  cached: boolean
  lastUpdated: number
  dataPoints: number
  error?: string
}

interface OHLCOptions {
  vs_currency?: string
  days?: '1' | '7' | '14' | '30' | '90' | '180' | '365' | 'max'
  interval?: 'daily' | 'hourly'
  precision?: string
}

export function useCoinGeckoOHLC(
  coinId: string,
  options: OHLCOptions = {}
) {
  const {
    vs_currency = 'usd',
    days = '7',
    interval,
    precision
  } = options

  const { data, isLoading, error } = useQuery({
    queryKey: ['coingecko-ohlc', coinId, vs_currency, days, interval, precision],
    queryFn: async (): Promise<OHLCResponse> => {
      const params = new URLSearchParams({
        id: coinId,
        vs_currency,
        days,
      })
      
      if (interval) params.set('interval', interval)
      if (precision) params.set('precision', precision)

      const response = await fetch(`/api/coingecko/ohlc?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch OHLC data: ${response.status}`)
      }
      
      return response.json()
    },
    enabled: !!coinId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  })

  return {
    ohlcData: data?.data || [],
    isLoading,
    error: error as Error | null,
    cached: data?.cached || false,
    lastUpdated: data?.lastUpdated,
    dataPoints: data?.dataPoints || 0,
  }
} 