'use client'

import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

interface TokenHeaderData {
  id: string
  name: string
  symbol: string
  logoUrl: string
}

export function useTokenHeader() {
  const pathname = usePathname()
  
  // Check if we're on a chart detail page and extract coin ID
  const pathSegments = pathname.split('/').filter(segment => segment !== '')
  
  let isChartDetailPage = false
  let coingeckoId: string | null = null

  // Check for pattern: charts/[id] or [locale]/charts/[id]
  if (pathSegments.length >= 2 && pathSegments.includes('charts')) {
    const chartsIndex = pathSegments.indexOf('charts')
    if (chartsIndex + 1 < pathSegments.length && pathSegments[chartsIndex + 1]) {
      isChartDetailPage = true
      coingeckoId = pathSegments[chartsIndex + 1] || null
    }
  }

  const { data: coinData, isLoading } = useQuery({
    queryKey: ["coingecko-coin", coingeckoId],
    queryFn: async () => {
      const response = await fetch(`/api/internal/coins/coingecko/${coingeckoId}`)
      if (!response.ok) throw new Error("Failed to load coin metadata")
      return await response.json()
    },
    enabled: !!coingeckoId,
    staleTime: 10 * 60 * 1000,
  })

  // Transform CoinGecko data to match expected interface
  const tokenData: TokenHeaderData | null = coinData ? {
    id: coinData.coingeckoId,
    name: coinData.name,
    symbol: coinData.symbol.toUpperCase(),
    logoUrl: coinData.logoUrl
  } : null

  return {
    isChartDetailPage,
    tokenData,
    isLoading
  }
}