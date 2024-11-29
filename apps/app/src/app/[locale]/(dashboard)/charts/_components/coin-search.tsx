'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from "@v1/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@v1/ui/table"
import { Button } from "@v1/ui/button"
import { toast } from "@v1/ui/use-toast"
import { searchCoins, getTopCoins } from '@/lib/coinmarketcap'
import type { CoinMarketData } from '@/types/coins'
import debounce from 'lodash.debounce'
import Image from 'next/image'
import { IconPlusCircleFill } from 'symbols-react'
import { useWatchlist } from "./watchlist-context"
import { useUser } from '@/hooks/use-user'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@v1/ui/sheet"
import { IconMagnifyingglass } from 'symbols-react'

export function CoinSearch() {
    const { addToWatchlist } = useWatchlist()
    const { user } = useUser()
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<CoinMarketData[]>([])
    const [topCoins, setTopCoins] = useState<CoinMarketData[]>([])
    const [loading, setLoading] = useState(false)
  
    useEffect(() => {
        async function fetchTopCoins() {
          try {
            const coins = await getTopCoins()
            setTopCoins(coins)
          } catch (error) {
            console.error('Error fetching top coins:', error)
            toast({
              title: "Error",
              description: "Failed to fetch top coins",
              variant: "destructive",
            })
          }
        }
        fetchTopCoins()
      }, [])
  
      const debouncedSearch = useCallback(
        debounce(async (query: string) => {
          if (query.trim() === '') {
            setSearchResults([])
            return
          }
          setLoading(true)
          try {
            const results = await searchCoins(query)
            setSearchResults(results)
          } catch (error) {
            console.error('Error searching coins:', error)
            toast({
              title: "Error",
              description: error instanceof Error ? error.message : "Failed to search coins",
              variant: "destructive",
            })
          } finally {
            setLoading(false)
          }
        }, 300),
        []
      )

  useEffect(() => {
    debouncedSearch(searchQuery)
    return () => {
      debouncedSearch.cancel()
    }
  }, [searchQuery, debouncedSearch])

  const handleAddCoin = async (coin: CoinMarketData) => {
    if (!user) {
      toast({
        title: "Error",
        description: "Please sign in to add coins to your watchlist",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)
      await addToWatchlist(Number(coin.id))
      
      toast({
        title: "Success",
        description: `Added ${coin.name} to your watchlist`,
      })
      setSearchQuery('')
      setSearchResults([])
      setIsOpen(false)
    } catch (error) {
      console.error('Error adding coin:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add coin",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <IconPlusCircleFill className="h-5 w-5 fill-foreground/20 hover:fill-foreground/50" />
          <span className="sr-only">Add Token</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="p-0 bg-background !z-50">
        <SheetHeader className="sticky top-0 bg-background/90 backdrop-blur-xl z-50 p-3 w-full">
          <SheetTitle className="font-mono">Add Token to Watchlist</SheetTitle>
          <SheetDescription>
            Search and add tokens to your watchlist
          </SheetDescription>
          <div className="flex-1 flex items-center w-full">
            <div className="relative min-w-full">
              <IconMagnifyingglass className="absolute left-2 top-2.5 h-4 w-4 fill-muted-foreground" />
              <Input
                type="text"
                placeholder="Search for a token"
                className="pl-8 w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          </div>
        </SheetHeader>
        
        <div className="space-y-6 p-3">
          {loading && <p className="text-center">Searching...</p>}

          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>24h</TableHead>
                  {/* <TableHead>Market Cap</TableHead> */}
                </TableRow>
              </TableHeader>
              <TableBody>
              {(searchQuery ? searchResults : topCoins).map((coin) => (
                <TableRow 
                  key={coin.id}
                  className="cursor-pointer hover:bg-primary/5 font-mono"
                  onClick={() => handleAddCoin(coin)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
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
                    </div>
                  </TableCell>
                  <TableCell>${coin.quote.USD.price.toLocaleString()}</TableCell>
                  <TableCell 
                    className={coin.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600'}
                  >
                    {coin.quote.USD.percent_change_24h.toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
        </div>
      </SheetContent>
    </Sheet>
  )
}

