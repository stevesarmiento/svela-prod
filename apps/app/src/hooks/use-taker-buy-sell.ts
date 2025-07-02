import { useQuery } from '@tanstack/react-query'

interface ExchangeData {
  exchange: string
  buyRatio: number
  sellRatio: number
  buyVolumeUsd: number
  sellVolumeUsd: number
  totalVolumeUsd: number
}

interface OverallData {
  buyRatio: number
  sellRatio: number
  buyVolumeUsd: number
  sellVolumeUsd: number
  totalVolumeUsd: number
}

interface TakerBuySellData {
  symbol: string
  overall: OverallData
  exchanges: ExchangeData[]
}

interface TakerBuySellResponse {
  success: boolean
  data: TakerBuySellData
  range: string
  symbol: string
  originalInput: string
  coinInfo?: {
    symbol: string
    name: string
    coinId: number
    isSupported: boolean
  }
  lastUpdated: string
}

interface UseTakerBuySellProps {
  symbol: string
  range?: string
}

export function useTakerBuySell({
  symbol,
  range = '24h',
}: UseTakerBuySellProps) {
  return useQuery({
    queryKey: ['takerBuySell', symbol, range],
    queryFn: async (): Promise<TakerBuySellResponse> => {
      const params = new URLSearchParams({
        symbol,
        range,
      })

      const response = await fetch(
        `/api/coinglass/taker-buy-sell/exchange-list?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch taker buy/sell data: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch taker buy/sell data')
      }

      return data
    },
    enabled: !!symbol,
    refetchInterval: 60 * 1000, // Refetch every minute (data updates every second)
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
  })
}