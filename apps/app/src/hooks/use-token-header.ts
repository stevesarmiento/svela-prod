'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface TokenHeaderData {
  id: string
  name: string
  symbol?: string
}

export function useTokenHeader() {
  const pathname = usePathname()
  const [tokenData, setTokenData] = useState<TokenHeaderData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Check if we're on a chart detail page and extract coin ID
  // Handle both /charts/1 and /en/charts/1 patterns
  const pathSegments = pathname.split('/').filter(segment => segment !== '')
  
  let isChartDetailPage = false
  let coinId: string | null = null

  // Check for pattern: charts/[id] or [locale]/charts/[id]
  if (pathSegments.length >= 2 && pathSegments.includes('charts')) {
    const chartsIndex = pathSegments.indexOf('charts')
    // Check if there's an ID after 'charts'
    if (chartsIndex + 1 < pathSegments.length && pathSegments[chartsIndex + 1]) {
      isChartDetailPage = true
      coinId = pathSegments[chartsIndex + 1] || null
    }
  }

  console.log('useTokenHeader Debug:', { pathname, pathSegments, isChartDetailPage, coinId })

  useEffect(() => {
    if (!coinId || !isChartDetailPage) {
      setTokenData(null)
      return
    }

    const fetchTokenData = async () => {
      setIsLoading(true)
      try {
        console.log('Fetching token data for ID:', coinId)
        const response = await fetch(`/api/coins/${coinId}`)
        const data = await response.json()
        
        console.log('API Response:', data)
        
        if (data && data.name) {
          const tokenInfo = {
            id: coinId,
            name: data.name,
            symbol: data.symbol
          }
          console.log('Setting token data:', tokenInfo)
          setTokenData(tokenInfo)
        } else {
          console.log('No data found for coin ID:', coinId)
          setTokenData({ id: coinId, name: 'Unknown Token' })
        }
      } catch (error) {
        console.error('Failed to fetch token data for header:', error)
        setTokenData({ id: coinId, name: 'Unknown Token' })
      } finally {
        setIsLoading(false)
      }
    }

    fetchTokenData()
  }, [coinId, isChartDetailPage])

  return {
    isChartDetailPage,
    tokenData,
    isLoading
  }
}