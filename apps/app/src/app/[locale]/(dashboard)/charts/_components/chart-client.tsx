'use client'

import { useEffect, useState } from 'react'
import { WatchlistProvider } from "./watchlist-context"
import { Watchlist } from "./watchlist"
import { MultiPriceChart } from "./multi-line-chart"
import { useWatchlist } from "./watchlist-context"
import type { CoinMarketData } from '@/types/coins'
import { toast } from "@v1/ui/use-toast"

function ChartsContent() {
  const { watchlist } = useWatchlist()
  const [coins, setCoins] = useState<CoinMarketData[]>([])

  useEffect(() => {
    let isMounted = true

    async function fetchCoinData() {
      if (!watchlist.length) {
        if (isMounted) {
          setCoins([])
        }
        return
      }

      try {
        const [quotesResponse, historicalResponse] = await Promise.all([
          fetch(`/api/coinmarketcap/quotes?ids=${watchlist.join(',')}`),
          fetch(`/api/coinmarketcap/historical?ids=${watchlist.join(',')}`)
        ])

        if (!quotesResponse.ok || !historicalResponse.ok) {
          throw new Error(`API error: ${quotesResponse.status} ${historicalResponse.status}`)
        }

        const [quotesData, historicalData] = await Promise.all([
          quotesResponse.json(),
          historicalResponse.json()
        ])

        if (isMounted && quotesData.data) {
          const coinsArray = Object.values(quotesData.data) as CoinMarketData[]
          // Attach historical data to each coin
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
      }
    }

    fetchCoinData()
    return () => { isMounted = false }
  }, [watchlist])
  
  return (
    <div className="space-y-6 w-full z-0 p-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Charts</h1>
      </div>
      <MultiPriceChart coins={coins} />
      <Watchlist />
    </div>
  )
}

export function ChartsClient() {
  return (
    <WatchlistProvider>
      <ChartsContent />
    </WatchlistProvider>
  )
}