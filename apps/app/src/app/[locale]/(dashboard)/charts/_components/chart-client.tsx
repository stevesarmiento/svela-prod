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
import { FundingRates } from './funding-rates'
import { CoinTreemap } from './coin-treemap'

function ChartsContent() {
  const { watchlist, isInitialized } = useWatchlist()
  const [coins, setCoins] = useState<CoinMarketData[] | null>(null)
  const [topCoins, setTopCoins] = useState<Coin[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchCoinData = useCallback(async () => {
    if (!isInitialized) return
    
    if (!watchlist.length) {
      setCoins([])
      return
    }

    try {
      setIsRefreshing(true)

      // Fetch top coins for market overview
      const topResponse = await fetch('/api/coinmarketcap/top', {
        cache: 'no-store'
      })
            
      if (!topResponse.ok) {
        throw new Error('Failed to fetch top coins')
      }
            
      const topData = await topResponse.json()
      setTopCoins(topData.coins)
      
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
        // Get symbols from quotes data
        const symbols = Object.values(quotesData.data)
        .map((coin: any) => {
          const symbol = coin.symbol.toUpperCase()
          // Handle special cases and ensure proper format
          if (symbol === 'BTC') return 'BTCUSDT_PERP.A'
          if (symbol === 'ETH') return 'ETHUSDT_PERP.A'
          // Add more common mappings as needed
          return `${symbol}USDT_PERP.A`
        })
        .join(',')
    
        // Then fetch funding rates with symbols
        const fundingResponse = await fetch(`/api/coinalyze?symbols=${symbols}`, {
          cache: 'no-store'
        })

        console.log('Funding Response:', {
          status: fundingResponse.status,
          symbols,
        })
    
        const fundingData = await fundingResponse.json()
        console.log('Funding Data:', fundingData)
        
        const coinsArray = Object.values(quotesData.data) as CoinMarketData[]
        coinsArray.forEach(coin => {
          coin.historical = historicalData.data[coin.id]
          coin.fundingRate = fundingData[`${coin.symbol.toUpperCase()}USDT_PERP.A`]?.funding_rate || null
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
      <FundingRates coins={coins} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MultiPriceChart coins={coins} />
        <CoinTreemap coins={topCoins} />
      </div>
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