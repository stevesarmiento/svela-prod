'use client'

import { useMemo } from 'react'
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { Button } from "@v1/ui/button"
import { X } from "lucide-react"
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@v1/ui/cn"
import { toast } from "@v1/ui/use-toast"
import { Skeleton } from "@v1/ui/skeleton"
import { Spinner } from "@v1/ui/spinner"
import type { CoinMarketData } from '@/types/coins'

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

interface ChartTableProps {
  coins: OptimisticCoinMarketData[]
  activeTimeScale: string
}

export function ChartTable({ coins, activeTimeScale }: ChartTableProps) {
  const { removeFromWatchlist } = useWatchlist()

  // Calculate interval-based price changes
  const coinsWithIntervalChange = useMemo(() => {
    return coins.map(coin => {
      let intervalChange = 0

      // Skip calculation for optimistic coins
      if (coin.isOptimistic) {
        return {
          ...coin,
          intervalChange: 0
        }
      }

      if (coin.historical?.data?.quotes && coin.historical.data.quotes.length > 0) {
        const quotes = coin.historical.data.quotes.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )

        // Filter based on activeTimeScale
        const now = Date.now()
        const timeFilters = {
          '1d': 30 * 24 * 60 * 60 * 1000,     // Last 30 days
          '7d': 90 * 24 * 60 * 60 * 1000,     // Last 90 days
          'max': Infinity                      // All data
        }
        
        const timeLimit = timeFilters[activeTimeScale as keyof typeof timeFilters] || Infinity
        
        let filteredQuotes = quotes
        if (timeLimit !== Infinity) {
          const cutoffTime = now - timeLimit
          filteredQuotes = quotes.filter(quote => 
            new Date(quote.timestamp).getTime() >= cutoffTime
          )
        }

        if (filteredQuotes.length > 0) {
          const initialPrice = filteredQuotes[0]?.quote?.USD?.price
          const latestPrice = filteredQuotes[filteredQuotes.length - 1]?.quote?.USD?.price
          
          if (initialPrice && latestPrice && initialPrice > 0) {
            intervalChange = ((latestPrice - initialPrice) / initialPrice) * 100
          }
        }
      }

      return {
        ...coin,
        intervalChange
      }
    })
  }, [coins, activeTimeScale])

  const getTimeScaleLabel = (scale: string) => {
    switch (scale) {
      case '1d': return '30D'
      case '7d': return '90D' 
      case 'max': return '1Y'
      default: return scale.toUpperCase()
    }
  }

  const handleRemove = async (coinId: number) => {
    try {
      await removeFromWatchlist(coinId)
      toast({
        title: "Removed",
        description: "Coin removed from watchlist",
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove coin",
        variant: "destructive",
      })
    }
  }

  if (!coins.length) return null

  return (
    <div className="space-y-4">
      {coinsWithIntervalChange.map(coin => (
        <div key={coin.id} className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
          {/* Header with Token Name */}
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Image
                      src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`}
                      alt={coin.name}
                      className={cn(
                        "w-4 h-4 rounded-full",
                        coin.isOptimistic && "opacity-50"
                      )}
                      width={16}
                      height={16}
                    />
                    {coin.isOptimistic && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Spinner size={12} />
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground/70">
                    {coin.isOptimistic ? "Loading..." : coin.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 justify-end">
                  Volume 24h
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {getTimeScaleLabel(activeTimeScale)} Change
                </div>
                <div className="flex items-center justify-end gap-1">
                  Action
                </div>
              </div>
            </div>
          </div>

          {/* Table Body */}
          <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
            {coin.isOptimistic ? (
              // Show non-clickable loading state for optimistic coins
              <div className="grid grid-cols-4 gap-4 px-4 py-2 pr-2 opacity-60">
                {/* Price */}
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-8 rounded-full" />
                  <span className="text-primary/40 text-xs">price is currently</span>
                  <Skeleton className="h-3 w-16 rounded-full" />
                </div>

                {/* 24h Volume */}
                <div className="flex items-center justify-end">
                  <Skeleton className="h-3 w-12 rounded-full" />
                </div>

                {/* Interval Change */}
                <div className="flex items-center justify-end">
                  <Skeleton className="h-3 w-10 rounded-full" />
                </div>

                {/* Remove */}
                <div className="flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled
                    className="h-6 w-6 p-0 rounded-lg bg-transparent opacity-50"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ) : (
              // Show clickable link for real coins
              <Link 
                href={`/charts/${coin.id}`}
                className="grid grid-cols-4 gap-4 px-4 py-2 pr-2 hover:bg-primary/[0.02] transition-colors duration-200 cursor-pointer"
              >
                {/* Price */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs">{coin.symbol.toUpperCase()}</span>
                  <span className="text-primary/40 text-xs">price is currently</span>
                  <span className="font-mono text-xs font-semibold">
                    ${coin.quote.USD.price.toLocaleString()}
                  </span>
                </div>

                {/* 24h Volume */}
                <div className="flex items-center justify-end">
                  <span className="font-mono text-xs">
                    ${formatLargeNumber(coin.quote.USD.volume_24h || 0)}
                  </span>
                </div>

                {/* Interval Change */}
                <div className="flex items-center justify-end">
                  <span className={cn(
                    "font-mono text-xs",
                    coin.intervalChange > 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {coin.intervalChange > 0 ? '+' : ''}{coin.intervalChange.toFixed(2)}%
                  </span>
                </div>

                {/* Remove */}
                <div 
                  className="flex items-center justify-end"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleRemove(coin.id)
                    }}
                    className="h-6 w-6 p-0 rounded-lg bg-transparent hover:bg-rose-500/10 transition-colors group"
                  >
                    <X className="h-4 w-4 text-muted-foreground group-hover:text-rose-500 transition-colors" />
                  </Button>
                </div>
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}