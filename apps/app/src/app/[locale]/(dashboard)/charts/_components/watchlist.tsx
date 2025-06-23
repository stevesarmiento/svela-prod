'use client'

import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Button } from "@v1/ui/button"
import { X, Coins, TrendingUp, DollarSign, BarChart3, Percent } from "lucide-react"
import { useWatchlist } from "./watchlist-context"
import { useCoinQuotes } from "@/hooks/use-coin-quotes"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { CoinSearch } from "./coin-search"
import { toast } from "@v1/ui/use-toast"

// Skeleton Components
const WatchlistSkeleton = ({ rowCount = 3 }: { rowCount?: number }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <div>
        <h4 className="font-medium">Watchlist</h4>
        <p className="text-sm text-muted-foreground">Track your favorite cryptocurrencies</p>
      </div>
      <CoinSearch />
    </div>
    
    <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
      {/* Header */}
      <div className="px-3 py-2">
        <div className="grid grid-cols-7 gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="text-left flex items-center gap-1">
            <Coins className="w-3 h-3" />
            Token
          </div>
          <div className="text-left flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Price
          </div>
          <div className="text-left flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            24h Change
          </div>
          <div className="text-left flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            Volume 24h
          </div>
          <div className="text-left flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            Market Cap
          </div>
          <div className="text-left flex items-center gap-1">
            <Percent className="w-3 h-3" />
            Funding Rate
          </div>
          <div className="text-right flex items-center justify-end gap-1">
            <X className="w-3 h-3" />
            Remove
          </div>
        </div>
      </div>

      {/* Skeleton Rows */}
      <div className="bg-white dark:bg-primary/5 border border-border/50 rounded-lg shadow-sm overflow-hidden">
        {Array.from({ length: rowCount }).map((_, index) => (
          <WatchlistRowSkeleton key={index} isLast={index === rowCount - 1} />
        ))}
      </div>
    </div>
  </div>
);

const WatchlistRowSkeleton = ({ isLast }: { isLast: boolean }) => (
  <div className={`grid grid-cols-7 gap-4 px-4 py-3 ${!isLast ? 'border-b' : ''}`}>
    {/* Token */}
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-6 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
    
    {/* Price */}
    <div className="flex items-center">
      <Skeleton className="h-4 w-16" />
    </div>
    
    {/* 24h Change */}
    <div className="flex items-center">
      <Skeleton className="h-4 w-12" />
    </div>
    
    {/* Volume 24h */}
    <div className="flex items-center">
      <Skeleton className="h-4 w-16" />
    </div>
    
    {/* Market Cap */}
    <div className="flex items-center">
      <Skeleton className="h-4 w-16" />
    </div>
    
    {/* Funding Rate */}
    <div className="flex items-center">
      <Skeleton className="h-4 w-14" />
    </div>
    
    {/* Remove Button */}
    <div className="flex items-center justify-end">
      <Skeleton className="h-8 w-8 rounded" />
    </div>
  </div>
);

export function Watchlist() {
  const { watchlist, removeFromWatchlist, isLoading: isWatchlistLoading, isInitialized } = useWatchlist()
  
  // Use TanStack Query to fetch coin data
  const { 
    data: coins, 
    isLoading: isCoinsLoading, 
    error,
    isRefetching 
  } = useCoinQuotes(watchlist);

  // Handle errors
  if (error) {
    toast({
      title: "Error",
      description: "Failed to fetch coin data",
      variant: "destructive",
    });
  }

  // Show loading skeleton while initializing or loading data
  if (!isInitialized || isWatchlistLoading || isCoinsLoading) {
    return <WatchlistSkeleton rowCount={3} />
  }

  if (!watchlist.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="font-medium">Watchlist</h4>
            <p className="text-sm text-muted-foreground">Track your favorite cryptocurrencies</p>
          </div>
          <CoinSearch />
        </div>
        
        <div className="py-6 border border-dashed border-border rounded-lg">
          <div className="flex flex-col items-center justify-center gap-3">
            <Coins className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-medium">No coins in watchlist</h3>
              <p className="text-sm text-muted-foreground">Add coins to track their performance</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="font-medium">Watchlist</h4>
          <p className="text-sm text-muted-foreground">
            Track your favorite cryptocurrencies
            {isRefetching && <span className="text-xs ml-2 text-blue-500">Refreshing...</span>}
          </p>
        </div>
        <CoinSearch />
      </div>
      
      <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
        {/* Header */}
        <div className="px-3 py-2">
          <div className="grid grid-cols-7 gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="text-left flex items-center gap-1">
              <Coins className="w-3 h-3" />
              Token
            </div>
            <div className="text-left flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Price
            </div>
            <div className="text-left flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              24h Change
            </div>
            <div className="text-left flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              Volume 24h
            </div>
            <div className="text-left flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              Market Cap
            </div>
            <div className="text-left flex items-center gap-1">
              <Percent className="w-3 h-3" />
              Funding Rate
            </div>
            <div className="text-right flex items-center justify-end gap-1">
              <X className="w-3 h-3" />
              Remove
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
          {coins?.map((coin) => (
            <div 
              key={coin.id}
              className="grid grid-cols-7 gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-primary/[0.02] transition-colors"
            >
              {/* Token */}
              <div className="flex items-center gap-2">
                <Link 
                  href={`/charts/${coin.id}`}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <Image
                    src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`}
                    alt={coin.name}
                    className="w-6 h-6 rounded-full"
                    width={24}
                    height={24}
                  />
                  <div>
                    <div className="font-semibold text-sm">{coin.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{coin.symbol.toUpperCase()}</div>
                  </div>
                </Link>
              </div>

              {/* Price */}
              <div className="flex items-center">
                <span className="font-mono text-sm">
                  ${coin.quote.USD.price.toLocaleString()}
                </span>
              </div>

              {/* 24h Change */}
              <div className="flex items-center">
                <span className={cn(
                  "font-mono text-sm",
                  coin.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {coin.quote.USD.percent_change_24h.toFixed(2)}%
                </span>
              </div>

              {/* Volume 24h */}
              <div className="flex items-center">
                <span className="font-mono text-sm">
                  ${formatLargeNumber(coin.quote.USD.volume_24h)}
                </span>
              </div>

              {/* Market Cap */}
              <div className="flex items-center">
                <span className="font-mono text-sm">
                  ${formatLargeNumber(coin.quote.USD.market_cap)}
                </span>
              </div>

              {/* Funding Rate */}
              <div className="flex items-center">
                <span className={cn(
                  "font-mono text-sm",
                  {
                    'text-green-500': coin.fundingRate && coin.fundingRate > 0,
                    'text-red-500': coin.fundingRate && coin.fundingRate < 0,
                    'text-muted-foreground': !coin.fundingRate
                  }
                )}>
                  {coin.fundingRate !== null && coin.fundingRate !== undefined
                    ? `${(coin.fundingRate * 100).toFixed(4)}%` 
                    : 'N/A'}
                </span>
              </div>

              {/* Remove Button */}
              <div className="flex items-center justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFromWatchlist(coin.id)}
                  className="h-8 w-8 p-0 bg-transparent hover:bg-rose-500/10 transition-colors group"
                >
                  <X className="h-4 w-4 text-muted-foreground group-hover:text-rose-500 transition-colors" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}