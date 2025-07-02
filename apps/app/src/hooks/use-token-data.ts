'use client'

import { useQuery } from '@tanstack/react-query'
import { useQuery as useConvexQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { usePathname } from 'next/navigation'
import type { CoinMarketData } from '@/types/coins'

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
  fullData?: CoinMarketData
}

export function useTokenData(coinId?: string) {
  // Get basic coin info from Convex (fast, cached)
  const convexCoin = useConvexQuery(
    api.coins.getCoinByIdString,
    coinId ? { coinId } : "skip"
  )

  // Get detailed market data from API when needed
  const { data: marketData, isLoading: isMarketDataLoading } = useQuery({
    queryKey: ['coin-market-data', coinId],
    queryFn: async () => {
      if (!coinId) return null
      const response = await fetch(`/api/coins/${coinId}`)
      if (!response.ok) throw new Error('Failed to fetch market data')
      return response.json()
    },
    enabled: !!coinId,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 2 * 60 * 1000, // 2 minutes
  })

  const tokenData: TokenData | null = convexCoin ? {
    id: coinId!,
    name: convexCoin.name,
    symbol: convexCoin.symbol,
    logoUrl: convexCoin.logoUrl,
    marketData: marketData?.quote?.USD ? {
      price: marketData.quote.USD.price,
      percent_change_24h: marketData.quote.USD.percent_change_24h,
      market_cap: marketData.quote.USD.market_cap,
      volume_24h: marketData.quote.USD.volume_24h,
    } : undefined,
    fullData: marketData
  } : null

  return {
    data: tokenData,
    isLoading: !convexCoin && !!coinId,
    isMarketDataLoading,
    hasBasicData: !!convexCoin,
    hasMarketData: !!marketData
  }
}

export function useTokenHeader() {
  const pathname = usePathname()
  
  // Extract coin ID from path
  const pathSegments = pathname.split('/').filter(segment => segment !== '')
  let isChartDetailPage = false
  let coinId: string | null = null

  if (pathSegments.length >= 2 && pathSegments.includes('charts')) {
    const chartsIndex = pathSegments.indexOf('charts')
    if (chartsIndex + 1 < pathSegments.length && pathSegments[chartsIndex + 1]) {
      isChartDetailPage = true
      coinId = pathSegments[chartsIndex + 1] || null
    }
  }

  const { data: tokenData, isLoading } = useTokenData(coinId || undefined)

  return {
    isChartDetailPage,
    tokenData,
    isLoading: isLoading && !!coinId
  }
}