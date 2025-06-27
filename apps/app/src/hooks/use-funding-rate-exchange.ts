import { useQuery } from '@tanstack/react-query'

interface FundingRateExchange {
  exchange: string
  fundingRateInterval: number
  fundingRate: number
  nextFundingTime: number
}

interface FundingRateData {
  symbol: string
  stablecoinMarginList: FundingRateExchange[]
  tokenMarginList: FundingRateExchange[]
}

interface FundingRateResponse {
  success: boolean
  data: FundingRateData[]
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

interface UseFundingRateExchangesOptions {
  symbol: string
}

export function useFundingRateExchanges({ symbol }: UseFundingRateExchangesOptions) {
  return useQuery({
    queryKey: ['funding-rate-exchanges', symbol],
    queryFn: async (): Promise<FundingRateResponse> => {
      const searchParams = new URLSearchParams({
        symbol: symbol.toString(),
      })

      const response = await fetch(`/api/coinglass/funding-rate/exchange-list?${searchParams}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      return response.json()
    },
    staleTime: 20 * 1000, // 20 seconds (matches API cache frequency)
    refetchInterval: 20 * 1000, // Auto-refresh every 20 seconds
    enabled: Boolean(symbol),
  })
}