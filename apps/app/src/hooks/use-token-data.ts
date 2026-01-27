'use client'

import { useQuery } from "@tanstack/react-query"
import { useCoinGeckoMarketData } from "./use-coingecko-market-data"

interface TokenData {
  id: string
  name: string
  symbol: string
  logoUrl: string
  marketData?: {
    price: number
    percent_change_24h: number
    market_cap: number
    volume_24h: number
  }
  fullData?: Record<string, unknown>
}

export function useTokenData(coinId?: string) {
  const { data: coin, isLoading: isCoinLoading } = useQuery({
    queryKey: ["coingecko-coin", coinId],
    queryFn: async () => {
      const response = await fetch(`/api/internal/coins/coingecko/${coinId}`)
      if (!response.ok) throw new Error("Failed to load coin metadata")
      return await response.json()
    },
    enabled: !!coinId,
    staleTime: 10 * 60 * 1000,
  })

  // Get detailed market data from CoinGecko API
  const { marketData, isLoading: isMarketDataLoading } = useCoinGeckoMarketData(coinId || "")
  
  const tokenData: TokenData | null = coin && marketData ? {
    id: coinId!,
    name: coin.name,
    symbol: coin.symbol,
    logoUrl: coin.logoUrl,
    marketData: {
      price: marketData.current_price || 0,
      percent_change_24h: marketData.price_change_percentage_24h || 0,
      market_cap: marketData.market_cap || 0,
      volume_24h: marketData.total_volume || 0,
    },
    fullData: marketData as unknown as Record<string, unknown>
  } : null

  return {
    data: tokenData,
    isLoading: isCoinLoading,
    isMarketDataLoading,
    hasBasicData: !!coin,
    hasMarketData: !!marketData
  }
}