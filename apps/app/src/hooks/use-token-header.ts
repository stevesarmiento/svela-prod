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
  let coinId: string | null = null

  // Check for pattern: charts/[id] or [locale]/charts/[id]
  if (pathSegments.length >= 2 && pathSegments.includes('charts')) {
    const chartsIndex = pathSegments.indexOf('charts')
    if (chartsIndex + 1 < pathSegments.length && pathSegments[chartsIndex + 1]) {
      isChartDetailPage = true
      coinId = pathSegments[chartsIndex + 1] || null
    }
  }

  // Use Convex query to get coin data
  const coinData = useQuery(
    api.coins.getCoinByIdString,
    coinId ? { coinId } : "skip"
  )

  // Transform Convex data to match expected interface
  const tokenData: TokenHeaderData | null = coinData ? {
    id: coinData.coinId.toString(),
    name: coinData.name,
    symbol: coinData.symbol,
    logoUrl: coinData.logoUrl
  } : null

  const isLoading = coinId ? coinData === undefined : false

  console.log('useTokenHeader Debug:', { 
    pathname, 
    pathSegments, 
    isChartDetailPage, 
    coinId,
    tokenData,
    isLoading
  })

  return {
    isChartDetailPage,
    tokenData,
    isLoading
  }
}