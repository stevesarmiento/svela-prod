'use client'

import { useState, useMemo } from 'react'
import { Input } from "@v1/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@v1/ui/table"
import { Button } from "@v1/ui/button"
import { toast } from "@v1/ui/use-toast"
import { useCoinSearch, useTopCoins } from '@/hooks/use-coin-search'
import type { CoinMarketData } from '@/types/coins'
import Image from 'next/image'
import { IconPlusCircleFill, IconXmarkCircleFill, IconMagnifyingglass } from 'symbols-react'
import { useWatchlist } from "./watchlist-context"
import { useUser } from '@/hooks/use-user'
import { Skeleton } from "@v1/ui/skeleton"
import { useDebounce } from '@/hooks/use-debounce'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@v1/ui/sheet"

// Skeleton Components
const CoinSearchSkeleton = ({ rowCount = 5 }: { rowCount?: number }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Token</TableHead>
        <TableHead>Price</TableHead>
        <TableHead>24h</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {Array.from({ length: rowCount }).map((_, index) => (
        <TableRow key={index}>
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export function CoinSearch() {
  const { addToWatchlist } = useWatchlist()
  const { user } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  
  // Debounce search query to avoid too many API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  
  // TanStack Query hooks
  const { 
    data: searchResults, 
    isLoading: isSearchLoading, 
    error: searchError 
  } = useCoinSearch(debouncedSearchQuery);
  
  const { 
    data: topCoins, 
    isLoading: isTopCoinsLoading, 
    error: topCoinsError 
  } = useTopCoins();

  // Determine which coins to display
  const coinsToDisplay = useMemo(() => {
    if (debouncedSearchQuery.trim()) {
      return searchResults || [];
    }
    return topCoins || [];
  }, [debouncedSearchQuery, searchResults, topCoins]);

  // Determine loading state
  const isLoading = useMemo(() => {
    if (debouncedSearchQuery.trim()) {
      return isSearchLoading;
    }
    return isTopCoinsLoading;
  }, [debouncedSearchQuery, isSearchLoading, isTopCoinsLoading]);

  // Handle errors
  const error = debouncedSearchQuery.trim() ? searchError : topCoinsError;
  if (error) {
    toast({
      title: "Error",
      description: error instanceof Error ? error.message : "Failed to fetch coins",
      variant: "destructive",
    });
  }

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
      setIsAdding(true)
      await addToWatchlist(Number(coin.id))
      
      toast({
        title: "Success",
        description: `Added ${coin.name} to your watchlist`,
      })
      setSearchQuery('')
      setIsOpen(false)
    } catch (error) {
      console.error('Error adding coin:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add coin",
        variant: "destructive",
      })
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 group">
          <IconPlusCircleFill className="h-5 w-5 fill-muted-foreground group-hover:fill-foreground" />
          <span className="sr-only">Add Token</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="p-0 bg-background !z-50 overflow-auto no-scrollbar">
        <SheetHeader className="sticky top-0 bg-background/90 backdrop-blur-xl z-50 p-4 w-full">
          <SheetTitle className="font-mono">Add Token to Watchlist</SheetTitle>
          <SheetDescription>
            Search and add tokens to your watchlist
            {isLoading && <span className="text-xs ml-2 text-blue-500">Loading...</span>}
          </SheetDescription>
          <div className="flex-1 flex items-center w-full">
            <div className="relative min-w-full">
              <IconMagnifyingglass className="absolute left-2 top-2.5 h-4 w-4 fill-muted-foreground" />
              <Input
                type="text"
                placeholder="Search for a token"
                className="pl-8 pr-8 w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2.5 p-0.5 rounded-full hover:bg-muted/50"
                  type="button"
                >
                  <IconXmarkCircleFill className="h-4 w-4 fill-muted-foreground" />
                  <span className="sr-only">Clear search</span>
                </button>
              )}
            </div>
          </div>
        </SheetHeader>
        
        <div className="space-y-6 p-4">
          {isLoading ? (
            <CoinSearchSkeleton rowCount={5} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>24h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coinsToDisplay.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      {debouncedSearchQuery.trim() ? 'No coins found' : 'No coins available'}
                    </TableCell>
                  </TableRow>
                ) : (
                  coinsToDisplay.map((coin) => (
                    <TableRow 
                      key={coin.id}
                      className="cursor-pointer hover:bg-primary/5 font-mono transition-colors"
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
                      <TableCell className="font-mono">
                        ${coin.quote.USD.price.toLocaleString()}
                      </TableCell>
                      <TableCell 
                        className={`font-mono ${coin.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {coin.quote.USD.percent_change_24h.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          
          {isAdding && (
            <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
              <div className="bg-background border rounded-lg p-4 shadow-lg">
                <p className="text-sm">Adding to watchlist...</p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

