'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@v1/ui/table"
import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Button } from "@v1/ui/button"
import { X } from "lucide-react"
import { useWatchlist } from "./watchlist-context"
import { CoinMarketData } from "@/types/coins"
import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { Skeleton } from "@v1/ui/skeleton"
import { CoinSearch } from "./coin-search"
import { toast } from "@v1/ui/use-toast"

export function Watchlist() {
  const { watchlist, removeFromWatchlist, isLoading: isWatchlistLoading, isInitialized } = useWatchlist()
  const [coins, setCoins] = useState<CoinMarketData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const refreshInterval = setInterval(fetchCoinData, 60000)
  
    async function fetchCoinData() {
      if (!isInitialized) return
      
      if (!watchlist.length) {
        if (isMounted) {
          setIsLoading(false)
          setCoins([])
        }
        return
      }

      try {
        const response = await fetch(`/api/coinmarketcap/quotes?ids=${watchlist.join(',')}`)
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const contentType = response.headers.get('content-type')
        if (!contentType?.includes('application/json')) {
          throw new Error('Invalid response format')
        }
        
        const data = await response.json()
        
        if (isMounted && data.data) {
          const coinsArray = Object.values(data.data) as CoinMarketData[]
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
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchCoinData()

    return () => { 
      isMounted = false
      clearInterval(refreshInterval)
    }
  }, [watchlist, isInitialized])

  // Show loading skeleton while initializing or loading data
  if (!isInitialized || isWatchlistLoading || isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex w-full justify-between items-center gap-2">
              <Skeleton className="h-6 w-24" />
              <CoinSearch />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!watchlist.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex w-full justify-between items-center gap-2">
              Watchlist
              <CoinSearch />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No coins added to watchlist yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex w-full justify-between items-center gap-2 font-medium font-mono">
            Watchlist
            <CoinSearch />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>24h Change</TableHead>
              <TableHead>Volume 24h</TableHead>
              <TableHead>Market Cap</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coins.map((coin) => (
              <TableRow key={coin.id} className="hover:bg-primary/5 font-mono">
                <TableCell>
                  <Link 
                    href={`/charts/${coin.id}`}
                    className="flex items-center gap-2 hover:opacity-80"
                  >
                    <Image
                      src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`}
                      alt={coin.name}
                      className="w-6 h-6 rounded-full"
                      width={24}
                      height={24}
                    />
                    <div>
                      <div className="font-semibold">{coin.name}</div>
                      <div className="text-xs text-muted-foreground">{coin.symbol.toUpperCase()}</div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>${coin.quote.USD.price.toLocaleString()}</TableCell>
                <TableCell 
                  className={coin.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600'}
                >
                  {coin.quote.USD.percent_change_24h.toFixed(2)}%
                </TableCell>
                <TableCell>${formatLargeNumber(coin.quote.USD.volume_24h)}</TableCell>
                <TableCell>${formatLargeNumber(coin.quote.USD.market_cap)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromWatchlist(coin.id)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}