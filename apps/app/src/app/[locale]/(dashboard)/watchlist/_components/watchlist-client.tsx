'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { WatchlistProvider } from "./watchlist-context"
import { Watchlist } from "./watchlist"
import { useWatchlist } from "./watchlist-context"
import type { CoinMarketData } from '@/types/coins'
import { toast } from "@v1/ui/use-toast"
import { Button } from "@v1/ui/button"
import { IconArrowtriangleUpCircle } from "symbols-react"

function WatchlistContent() {
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
      
      // First fetch quotes and historical data
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
          coin.historical = historicalData.data[coin.id]
        })
  
        // Try to fetch funding rates separately
        try {
          const symbols = coinsArray
            .map((coin: CoinMarketData) => {
              const symbol = coin.symbol.toUpperCase()
              if (symbol === 'BTC') return 'BTCUSDT_PERP.A'
              if (symbol === 'ETH') return 'ETHUSDT_PERP.A'
              return `${symbol}USDT_PERP.A`
            })
            .join(',')
  
          const fundingResponse = await fetch(`/api/coinalyze?symbols=${symbols}`, {
            cache: 'no-store'
          })
  
          if (fundingResponse.ok) {
            const fundingData = await fundingResponse.json()
            coinsArray.forEach(coin => {
              coin.fundingRate = fundingData[`${coin.symbol.toUpperCase()}USDT_PERP.A`]?.funding_rate || null
            })
          }
        } catch (fundingError) {
          console.warn('Failed to fetch funding rates:', fundingError)
        }
  
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
        <h1 className="text-3xl font-bold">Watchlist</h1>
        <Button 
          onClick={fetchCoinData} 
          disabled={isRefreshing}
          variant="ghost"
          size="icon"
          className="group"
        >
          <IconArrowtriangleUpCircle className={`h-5 w-5 fill-muted-foreground group-hover:fill-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      <Watchlist />
    </div>
  )
}

export function WatchlistClient() {
  return (
    <Suspense fallback={<div>Loading watchlist...</div>}>
      <WatchlistProvider>
        <WatchlistContent />
      </WatchlistProvider>
    </Suspense>
  )
}