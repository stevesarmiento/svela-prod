'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { MultiPriceChartLightweight } from "./multi-line-lightweight"
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import type { 
  CoinMarketData 
} from '@/types/coins'
import { toast } from "@v1/ui/use-toast"

function ChartsContent() {
  const { watchlist, isInitialized } = useWatchlist()
  const [coins, setCoins] = useState<CoinMarketData[] | null>(null)

  const fetchCoinData = useCallback(async () => {
    if (!isInitialized) return
    
    if (!watchlist.length) {
      setCoins([])
      return
    }
  
    try {
      const [quotesResponse, historicalResponse] = await Promise.all([
        fetch(`/api/coinmarketcap/quotes?ids=${watchlist.join(',')}`, {
          cache: 'no-store'
        }),
        fetch(`/api/coinmarketcap/historical?ids=${watchlist.join(',')}`, {
          cache: 'no-store'
        })
      ])
    
      if (!quotesResponse.ok || !historicalResponse.ok) {
        throw new Error(`API error: ${quotesResponse.status} ${historicalResponse.status}`)
      }
    
      const [quotesData, historicalData] = await Promise.all([
        quotesResponse.json(),
        historicalResponse.json()
      ])
    
      if (quotesData.data) {
        const coinsArray = Object.values(quotesData.data) as CoinMarketData[]
        
        // Set historical data
        coinsArray.forEach(coin => {
          // Try the normal structure first
          const historical = historicalData.data[coin.id] || historicalData.data[coin.id.toString()]
          
          coin.historical = historical
        })

        setCoins(coinsArray)
      }
    } catch (error) {
      console.error('Error fetching coin data:', error)
      toast({
        title: "Error",
        description: "Failed to fetch coin data",
        variant: "destructive",
      })
    }
  }, [isInitialized, watchlist])

  useEffect(() => {
    fetchCoinData()
  }, [watchlist, isInitialized, fetchCoinData])

  if (!coins) return <div>Loading...</div>
  
  return (
    <div className="space-y-6 w-full z-0 p-8">
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
        <MultiPriceChartLightweight coins={coins} />
      </div>
    </div>
  )
}

export function ChartsClient() {
  return (
    <Suspense fallback={<div>Loading charts...</div>}>
        <ChartsContent />
    </Suspense>
  )
}