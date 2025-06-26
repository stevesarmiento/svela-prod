'use client'

import { useState, useEffect, useMemo } from 'react'
import type { CoinMarketData } from '@/types/coins'
import type { Time } from 'lightweight-charts'

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
  initialData: CoinMarketData['quote']['USD']
) {
  const [activePrice, setActivePrice] = useState<number | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const displayPrice = activePrice ?? (tokenData?.marketData?.price || initialData.price)
  
  const calculatePercentageChange = useMemo(() => {
    if (!isHydrated) {
      return initialData.percent_change_24h || 0
    }
    
    const currentPrice = displayPrice;
    const oldestPrice = chartData[0]?.value;
    if (!oldestPrice) return initialData.percent_change_24h || 0;
    
    return ((currentPrice - oldestPrice) / oldestPrice) * 100;
  }, [displayPrice, chartData, isHydrated, initialData.percent_change_24h]);

  return {
    displayPrice,
    calculatePercentageChange,
    setActivePrice
  }
}