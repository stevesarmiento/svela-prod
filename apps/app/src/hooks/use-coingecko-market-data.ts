'use client'

import { useQuery } from '@tanstack/react-query'

interface CoinGeckoMarketData {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number | null
  market_cap: number | null
  market_cap_rank: number | null
  fully_diluted_valuation: number | null
  total_volume: number | null
  high_24h: number | null
  low_24h: number | null
  price_change_24h: number | null
  price_change_percentage_24h: number | null
  market_cap_change_24h: number | null
  market_cap_change_percentage_24h: number | null
  circulating_supply: number | null
  total_supply: number | null
  max_supply: number | null
  ath: number | null
  ath_change_percentage: number | null
  ath_date: string | null
  atl: number | null
  atl_change_percentage: number | null
  atl_date: string | null
  roi: {
    times: number
    currency: string
    percentage: number
  } | null
  last_updated: string
}

interface CoinGeckoMarketResponse {
  data: CoinGeckoMarketData[]
  cached: boolean
  timestamp: number
}

export function useCoinGeckoMarketData(coinGeckoId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['coingecko-market-data', coinGeckoId],
    queryFn: async (): Promise<CoinGeckoMarketData | null> => {
      console.log('🎯 Fetching CoinGecko market data for:', coinGeckoId)

      const response = await fetch(`/api/coingecko/markets?ids=${coinGeckoId}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch market data: ${response.status}`)
      }

      const result: CoinGeckoMarketResponse = await response.json()
      
      if (!result.data || result.data.length === 0) {
        console.warn('⚠️ No market data found for:', coinGeckoId)
        return null
      }

      const marketData = result.data[0]
      if (marketData) {
        console.log('✅ CoinGecko market data fetched:', {
          id: marketData.id,
          price: marketData.current_price,
          rank: marketData.market_cap_rank
        })
      }

      return marketData || null
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 2 * 60 * 1000, // 2 minutes
    enabled: !!coinGeckoId,
    retry: 3,
  })

  return {
    marketData: data || null,
    isLoading,
    error
  }
} 