'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { WatchlistProvider } from "./watchlist-context"
import { Watchlist } from "./watchlist"
import { MultiPriceChart } from "./multi-line-chart"
import { useWatchlist } from "./watchlist-context"
import type { CoinMarketData } from '@/types/coins'
import { toast } from "@v1/ui/use-toast"
import { Button } from "@v1/ui/button"
import { IconArrowTriangle2Circlepath } from "symbols-react"

function ChartsContent() {
  const { watchlist, isInitialized } = useWatchlist()
  const [coins, setCoins] = useState<CoinMarketData[] | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchCoinData = useCallback(async () => {
    if (!isInitialized) return
    
    if (!watchlist.length) {
      setCoins([])
      return
    }

    try {
      setIsRefreshing(true)
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
        coinsArray.forEach(coin => {
          coin.historical = historicalData.data[coin.id]
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
    } finally {
      setIsRefreshing(false)
    }
  }, [isInitialized, watchlist])

  useEffect(() => {
    fetchCoinData()
  }, [watchlist, isInitialized, fetchCoinData])

  if (!coins) return <div>Loading...</div>
  
  return (
    <div className="space-y-6 w-full z-0 p-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Charts</h1>
        <Button 
          onClick={fetchCoinData} 
          disabled={isRefreshing}
          variant="ghost"
          size="icon"
          className="group"
        >
          <IconArrowTriangle2Circlepath className={`h-5 w-5 fill-muted-foreground group-hover:fill-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <MultiPriceChart coins={coins} />
      <Watchlist />
    </div>
  )
}

export function ChartsClient() {
  return (
    <Suspense fallback={<div>Loading watchlist...</div>}>
      <WatchlistProvider>
        <ChartsContent />
      </WatchlistProvider>
    </Suspense>
  )
}