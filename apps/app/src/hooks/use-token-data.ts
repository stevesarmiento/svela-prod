'use client'

import { useQuery as useConvexQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
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
  // Get basic coin info from Convex (fast, cached)
  const convexCoin = useConvexQuery(
    api.coins.getCoinGeckoCoinById,
    coinId ? { coingeckoId: coinId } : "skip"
  )

  // Get detailed market data from CoinGecko API
  const { marketData, isLoading: isMarketDataLoading } = useCoinGeckoMarketData(coinId || "")
  
  // Debug logging
  console.log('🔍 Token Data Debug:', {
    coinId,
    convexCoin,
    marketData,
    isMarketDataLoading
  })

  const tokenData: TokenData | null = convexCoin && marketData ? {
    id: coinId!,
    name: convexCoin.name,
    symbol: convexCoin.symbol,
    logoUrl: convexCoin.logoUrl,
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
    isLoading: !convexCoin && !!coinId,
    isMarketDataLoading,
    hasBasicData: !!convexCoin,
    hasMarketData: !!marketData
  }
}