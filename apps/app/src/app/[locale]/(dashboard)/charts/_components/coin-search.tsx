'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from "@v1/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@v1/ui/table"
import { Button } from "@v1/ui/button"
import { toast } from "@v1/ui/use-toast"
import { searchCoins, getTopCoins } from '@/lib/coinmarketcap'
import type { Coin } from '@/types/coins'
import debounce from 'lodash.debounce'
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

export function CoinSearch() {
    const { addToWatchlist } = useWatchlist()
    const { user } = useUser()
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<Coin[]>([])
    const [topCoins, setTopCoins] = useState<Coin[]>([])
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

  const handleAddCoin = async (coin: Coin) => {
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add Token to Watchlist</SheetTitle>
          <SheetDescription>
            Search and add tokens to your watchlist
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-6 mt-6">
          <div className="max-w-full">
            <Input
              type="text"
              placeholder="Search for a token"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

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
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                        console.log('Row clicked:', coin)
                        handleAddCoin(coin)
                      }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <img src={coin.logo} alt={coin.name} className="w-6 h-6" />
                        <div>
                          <div className="font-medium">{coin.name}</div>
                          <div className="text-sm text-muted-foreground">{coin.symbol.toUpperCase()}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>${coin.quote.USD.price.toLocaleString()}</TableCell>
                    <TableCell 
                      className={coin.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600'}
                    >
                      {coin.quote.USD.percent_change_24h.toFixed(2)}%
                    </TableCell>
                    {/* <TableCell>${coin.quote.USD.market_cap.toLocaleString()}</TableCell> */}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </div>
      </SheetContent>
    </Sheet>
  )
}

