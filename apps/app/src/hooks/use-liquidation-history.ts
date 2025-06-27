'use client'

import { useQuery } from '@tanstack/react-query'

interface LiquidationHistoryItem {
  timestamp: number
  date: string
  longLiquidations: number
  shortLiquidations: number
  totalLiquidations: number
}

interface LiquidationHistoryResponse {
  success: boolean
  data: LiquidationHistoryItem[]
  count: number
  symbol: string
  interval: string
  exchangeList: string
  lastUpdated: string
  coinInfo?: {
    symbol: string
    name: string
    coinId: number
    isSupported: boolean
  }
}

interface UseLiquidationHistoryParams {
  symbol?: string
  interval?: string
  exchangeList?: string
  limit?: number
  startTime?: number
  endTime?: number
}

export function useLiquidationHistory(params: UseLiquidationHistoryParams = {}) {
  const {
    symbol = 'BTC',
    interval = '1d',
    exchangeList = 'Binance',
    limit = 100,
    startTime,
    endTime
  } = params

  return useQuery({
    queryKey: ['liquidation-history', symbol, interval, exchangeList, limit, startTime, endTime],
    queryFn: async (): Promise<LiquidationHistoryResponse> => {
      const searchParams = new URLSearchParams({
        symbol,
        interval,
        exchange_list: exchangeList,
        limit: limit.toString(),
      })

      if (startTime) {
        searchParams.append('start_time', startTime.toString())
      }
      if (endTime) {
        searchParams.append('end_time', endTime.toString())
      }

      const response = await fetch(`/api/coinglass/liquidation/aggregated-history?${searchParams}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch liquidation history')
      }
      
      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  })
}