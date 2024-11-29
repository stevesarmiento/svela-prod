'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@v1/ui/table"
import { Button } from "@v1/ui/button"
import { X } from "lucide-react"
import { useWatchlist } from "./watchlist-context"
import { CoinData } from "@/types/coins"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Skeleton } from "@v1/ui/skeleton"

export function Watchlist() {
    const { watchlist, removeFromWatchlist, isLoading: isWatchlistLoading } = useWatchlist()
    const [coins, setCoins] = useState<CoinData[]>([])
    const [isLoading, setIsLoading] = useState(true)
  
    useEffect(() => {
      let isMounted = true
  
      async function fetchCoinData() {
        if (!watchlist.length) {
          if (isMounted) {
            setIsLoading(false)
            setCoins([])
          }
          return
        }
  
        try {
          const responses = await Promise.all(
            watchlist.map(id => 
              fetch(`/api/coins/${id}`)
                .then(res => res.ok ? res.json() : Promise.reject(`Failed to fetch coin ${id}`))
                .catch(error => {
                  console.error(error)
                  return null
                })
            )
          )
  
          if (isMounted) {
            setCoins(responses.filter(Boolean))
            setIsLoading(false)
          }
        } catch (error) {
          console.error('Error fetching coin data:', error)
          if (isMounted) {
            setIsLoading(false)
          }
        }
      }
  
      fetchCoinData()
      return () => { isMounted = false }
    }, [watchlist])
  
    if (isWatchlistLoading || isLoading) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Favorites</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      )
    }

  if (!watchlist.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Favorites</CardTitle>
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
        <CardTitle>Favorites</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>24h Change</TableHead>
              <TableHead>Market Cap</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coins.map((coin) => (
              <TableRow key={coin.id}>
                <TableCell>
                  <Link 
                    href={`/charts/${coin.id}`}
                    className="flex items-center gap-2 hover:opacity-80"
                  >
                    <img src={coin.image.small} alt={coin.name} className="w-6 h-6" />
                    <div>
                      <div className="font-medium">{coin.name}</div>
                      <div className="text-sm text-muted-foreground">{coin.symbol.toUpperCase()}</div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>${coin.market_data.current_price.usd.toLocaleString()}</TableCell>
                <TableCell 
                  className={coin.market_data.price_change_percentage_24h > 0 ? 'text-green-600' : 'text-red-600'}
                >
                  {coin.market_data.price_change_percentage_24h.toFixed(2)}%
                </TableCell>
                <TableCell>${coin.market_data.market_cap.usd.toLocaleString()}</TableCell>
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