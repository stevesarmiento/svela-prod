'use client'

import { useState, useMemo, forwardRef, useImperativeHandle, useRef } from 'react'
import { Input } from "@v1/ui/input"
import { Table, TableBody, TableCell, TableRow } from "@v1/ui/table"
import { Button } from "@v1/ui/button"
import { toast } from "@v1/ui/use-toast"
import { useHybridCoinSearch, useHybridTopCoins, type HybridCoinSearchResult } from '@/hooks/use-hybrid-coin-search'
import Image from 'next/image'
import { IconXmarkCircleFill, IconMagnifyingglass, IconBookmarkFill } from 'symbols-react'
import { useWatchlist } from "./watchlist-context"
import { useUser } from '@/hooks/use-user'
import { Skeleton } from "@v1/ui/skeleton"
import { useDebounce } from '@/hooks/use-debounce'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@v1/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@v1/ui/tooltip"
import { Kbd } from "@v1/ui/kbd"

// Skeleton Components
const CoinSearchSkeleton = ({ rowCount = 5 }: { rowCount?: number }) => (
  <Table>
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

export interface CoinSearchRef {
  open: () => void
}

export const CoinSearch = forwardRef<CoinSearchRef>((props, ref) => {
  const { addToWatchlist, addToSelectedGroup, selectedGroup } = useWatchlist()
  const { user } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Expose open function to parent component
  useImperativeHandle(ref, () => ({
    open: () => {
      setIsOpen(true)
      // Focus the input after a short delay to ensure the sheet is open
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }))
  
  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  
  // Use hybrid search hooks (DB + API)
  const { 
    data: searchResults, 
    isLoading: isSearchLoading, 
    error: searchError,
    searchType,
    totalResults
  } = useHybridCoinSearch(debouncedSearchQuery, {
    limit: 50 // Increased limit for better results
  });
  
  const { 
    data: topCoins, 
    isLoading: isTopCoinsLoading, 
    error: topCoinsError 
  } = useHybridTopCoins(25);

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
      description: "Failed to fetch coins",
      variant: "destructive",
    });
  }

  // MIGRATED TO COINGECKO: Now uses CoinGecko string IDs directly
  const handleAddCoin = async (coin: HybridCoinSearchResult) => {
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
      
      // Use CoinGecko string ID directly (e.g., "bitcoin", "ethereum")
      const coingeckoId = coin.id;
      
      // Use group-specific add function if a group is selected
      if (selectedGroup) {
        await addToSelectedGroup(coingeckoId)
      } else {
        await addToWatchlist(coingeckoId)
      }
      
      const targetName = selectedGroup ? selectedGroup.name : "your watchlist"
      toast({
        title: "Success",
        description: `Added ${coin.name} to ${targetName}`,
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

  // Enhanced search info display
  const getSearchInfo = () => {
    if (!debouncedSearchQuery.trim()) {
      return "Top 25 tokens by market cap";
    }
    
    const typeLabel = searchType === 'symbol' ? 'symbol' : 
                     searchType === 'name' ? 'name' : 'smart';
    
    return `${totalResults} results • ${typeLabel} search • sorted by market cap`;
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 pl-2 w-auto gap-2 group rounded-md">
                <IconBookmarkFill className="h-3.5 w-3.5 fill-muted-foreground group-hover:fill-foreground" />
                <span className="text-sm">Add Token</span>
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" className="flex items-center gap-2 p-1 pl-2 rounded-md">
            <span>Add Token</span>
            <Kbd>Shift</Kbd>
            <span>+</span>
            <Kbd>A</Kbd>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SheetContent className="p-0 !z-50 overflow-auto no-scrollbar rounded-[20px] bg-zinc-950 border-zinc-800
                               shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                               dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">

          <SheetHeader className="p-2 sticky top-0 border-b border-zinc-800/50">
            <div className="flex-1 flex items-center w-full">
              <div className="relative min-w-full">
                <div className="relative rounded-[14px] bg-zinc-950/50 focus-within:bg-zinc-950 border border-zinc-800/80 overflow-hidden p-1 transition-colors duration-200">
                  <div className="relative z-10 flex items-center p-0 px-2">
                    <IconMagnifyingglass className="h-4 w-4 fill-white/50 ml-1" />
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="Search by symbol (BTC) or name (Bitcoin)..."
                      className="flex-1 border-0 bg-transparent text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="p-1 rounded-full hover:bg-white/10 transition-colors"
                        type="button"
                      >
                        <IconXmarkCircleFill className="h-4 w-4 fill-white/50 hover:fill-white/70" />
                        <span className="sr-only">Clear search</span>
                      </button>
                    )}
                    <Kbd>ESC</Kbd>
                  </div>
                </div>
              </div>
            </div>
          </SheetHeader>
          
          <div className="space-y-2 p-3 px-2">
            <div className="text-xs text-white/50 ml-3">
              {getSearchInfo()}
            </div>
            {isLoading ? (
              <div className="">
                <CoinSearchSkeleton rowCount={5} />
              </div>
            ) : (
              <div className="overflow-hidden">
                <Table>
                  <TableBody>
                    {coinsToDisplay.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-white/50 py-8">
                          {debouncedSearchQuery.trim() ? 'No coins found' : 'Loading coins...'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      coinsToDisplay.map((coin) => (
                        <TableRow 
                          key={coin.id}
                          className="cursor-pointer border-none hover:bg-zinc-800/50 border-zinc-700/30 font-mono transition-colors group"
                          onClick={() => handleAddCoin(coin)}
                        >
                          <TableCell className="text-white rounded-l-xl">
                            <div className="flex items-center gap-3">
                              <Image
                                src={coin.image?.startsWith('http') || coin.image?.startsWith('/') ? coin.image : '/favicon.ico'}
                                alt={coin.name}
                                className="w-6 h-6 rounded-full"
                                width={24}
                                height={24}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = '/favicon.ico';
                                }}
                              />
                              <div>
                                <div className="font-semibold font-sans text-sm text-white group-hover:text-white/90 mt-1">{coin.name}</div>
                                <div className="text-[11px] text-white/50 -mt-1">{coin.symbol.toUpperCase()}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-white/90">
                            {coin.quote.USD.price > 0 ? (
                              `$${coin.quote.USD.price.toLocaleString()}`
                            ) : (
                              <Skeleton className="h-4 w-16 bg-zinc-700/50" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono rounded-r-xl text-[11px]">
                            {coin.quote.USD.price > 0 ? (
                              <span className={`${coin.quote.USD.percent_change_24h > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {coin.quote.USD.percent_change_24h.toFixed(2)}%
                              </span>
                            ) : (
                              <Skeleton className="h-4 w-12 bg-zinc-700/50" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {isAdding && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 shadow-lg">
                  <p className="text-sm text-white">Adding to watchlist...</p>
                </div>
              </div>
            )}
          </div>
      </SheetContent>
    </Sheet>
  )
})

CoinSearch.displayName = 'CoinSearch'

