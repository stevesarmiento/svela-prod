'use client'

import { usePathname } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

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

  // Use CoinGecko database query to get coin data
  const coinData = useQuery(
    api.coins.getCoinGeckoCoinById,
    coingeckoId ? { coingeckoId } : "skip"
  )

  // Transform CoinGecko data to match expected interface
  const tokenData: TokenHeaderData | null = coinData ? {
    id: coinData.coingeckoId,
    name: coinData.name,
    symbol: coinData.symbol.toUpperCase(),
    logoUrl: coinData.logoUrl
  } : null

  const isLoading = coingeckoId ? coinData === undefined : false

  console.log('useTokenHeader Debug (CoinGecko):', { 
    pathname, 
    pathSegments, 
    isChartDetailPage, 
    coingeckoId,
    tokenData,
    isLoading
  })

  return {
    isChartDetailPage,
    tokenData,
    isLoading
  }
}