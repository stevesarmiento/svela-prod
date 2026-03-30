'use client'

import { useState, useEffect, useMemo } from 'react'
import type { CoinMarketData } from '@/types/coins'
import type { Time } from 'lightweight-charts'
import { getAlignedPriceFromChartPoints } from '@/lib/aligned-price'

interface PriceDataPoint {
  time: Time
  value: number
}

interface TokenData {
  marketData?: {
    price: number
  }
}

export function usePriceCalculations(
  chartData: PriceDataPoint[], 
  tokenData: TokenData | null, 
  initialData: CoinMarketData['quote']['USD'],
  activeTimeScale?: string
) {
  const [activePrice, setActivePrice] = useState<number | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const alignedChartPrice = useMemo(() => getAlignedPriceFromChartPoints(chartData), [chartData])
  const displayPrice =
    activePrice ??
    alignedChartPrice ??
    tokenData?.marketData?.price ??
    initialData.price
  
  const calculatePercentageChange = useMemo(() => {
    if (!isHydrated) {
      return initialData.percent_change_24h || 0
    }
    
    // Use real CoinMarketCap percentage changes instead of calculating from chart data
    if (activeTimeScale && initialData) {
      switch (activeTimeScale) {
        case '1d':
          // 1D = 24h change (matches watchlist)
          return initialData.percent_change_24h ?? 0
        case '7d':
          // 1W = 7d change
          return initialData.percent_change_7d ?? initialData.percent_change_24h ?? 0
        case '30d':
          // 1M = 30d change
          return initialData.percent_change_30d ?? initialData.percent_change_7d ?? initialData.percent_change_24h ?? 0
        case 'max':
          // 1Y = longest real data CoinMarketCap provides
          return initialData.percent_change_30d ?? initialData.percent_change_7d ?? initialData.percent_change_24h ?? 0
        case '2y':
          // 2Y = CoinMarketCap doesn't provide this data
          return Number.NaN
        default:
          return initialData.percent_change_24h ?? 0
      }
    }
    
    // Fallback to 24h change
    return initialData.percent_change_24h || 0;
  }, [isHydrated, initialData, activeTimeScale]);

  return {
    displayPrice,
    calculatePercentageChange,
    setActivePrice
  }
}