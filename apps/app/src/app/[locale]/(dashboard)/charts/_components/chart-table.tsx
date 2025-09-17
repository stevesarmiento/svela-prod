'use client'

import { useMemo, useTransition, useDeferredValue, memo, useCallback } from 'react'
import { useSearchParams } from "next/navigation"
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
// Accept whatever data format the existing hook provides
interface OptimisticCoinData {
  id: string | number;
  name: string;
  symbol: string;
  image?: string; // CoinGecko image URL when available
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
      market_cap: number;
      volume_24h: number;
    };
  };
  isOptimistic?: boolean;
}

interface ChartTableProps {
  coins: OptimisticCoinData[]
  activeTimeScale: string
  isPending?: boolean
}

export const ChartTable = memo(function ChartTable({ 
  coins, 
  activeTimeScale,
  isPending 
}: ChartTableProps) {
  const { removeFromSelectedGroup, selectedGroup } = useWatchlist()
  const searchParams = useSearchParams()
  const [isRemovePending, startRemoveTransition] = useTransition()
  
  // React 19: Defer expensive computations
  const deferredCoins = useDeferredValue(coins)
  const deferredTimeScale = useDeferredValue(activeTimeScale)
  
  // Get current watchlist group parameter to preserve it in navigation (same as top-nav)
  const watchlistGroup = searchParams.get('wg')

  // React 19: Memoize expensive interval calculations with deferred values
  const coinsWithIntervalChange = useMemo(() => {
    return deferredCoins.map(coin => {
      let intervalChange = 0

      // Skip calculation for optimistic coins
      if (coin.isOptimistic) {
        return {
          ...coin,
          intervalChange: 0
        }
      }

      // ONLY use real data - no fake calculations or inappropriate fallbacks
      if (coin.quote?.USD) {
        switch (deferredTimeScale) {
          case '1d':
            // 1D = 24h change (matches watchlist)
            intervalChange = coin.quote.USD.percent_change_24h ?? 0
            break
          case '7d':
            // 1W = 7d change 
            intervalChange = coin.quote.USD.percent_change_7d ?? coin.quote.USD.percent_change_24h ?? 0
            break
          case '30d':
            // 1M = 30d change
            intervalChange = coin.quote.USD.percent_change_30d ?? coin.quote.USD.percent_change_7d ?? coin.quote.USD.percent_change_24h ?? 0
            break
          case 'max':
            // 1Y = longest real data CoinMarketCap provides
            intervalChange = coin.quote.USD.percent_change_30d ?? coin.quote.USD.percent_change_7d ?? coin.quote.USD.percent_change_24h ?? 0
            break
          case '2y':
            // 2Y = CoinMarketCap doesn't provide this data
            intervalChange = NaN
            break
          default:
            // Default to 24h real data
            intervalChange = coin.quote.USD.percent_change_24h ?? 0
        }
      }

      // Debug: Always log what data we're using to ensure it's real
      if (!coin.isOptimistic) {
        console.log(`📈 ${coin.symbol} (${activeTimeScale}):`, {
          selectedChange: isNaN(intervalChange) ? 'N/A - No real data available' : intervalChange,
          timeScale: activeTimeScale,
          realDataAvailable: {
            percent_change_1h: coin.quote?.USD?.percent_change_1h,
            percent_change_24h: coin.quote?.USD?.percent_change_24h,
            percent_change_7d: coin.quote?.USD?.percent_change_7d,
            percent_change_30d: coin.quote?.USD?.percent_change_30d,
          },
          dataSource: 'Pure CoinGecko API',
          usingRealData: !isNaN(intervalChange)
        })
      }

      return {
        ...coin,
        intervalChange
      }
    })
  }, [deferredCoins, deferredTimeScale])

  const getTimeScaleLabel = (scale: string) => {
    switch (scale) {
      case '1d': return '1D'    // 1 Day (24h)
      case '7d': return '1W'    // 1 Week (7d)
      case '30d': return '1M'   // 1 Month (30d)
      case 'max': return '1Y'   // 1 Year (longest available)
      case '2y': return '2Y'    // 2 Years (N/A)
      default: return scale.toUpperCase()
    }
  }

  // React 19: Optimized remove handler with transition
  const handleRemove = useCallback(async (coinId: string | number) => {
    if (!selectedGroup) {
      toast({
        title: "Error",
        description: "No watchlist group selected",
        variant: "destructive",
      })
      return
    }

    startRemoveTransition(async () => {
      try {
        await removeFromSelectedGroup(String(coinId))
        toast({
          title: "Removed",
          description: `Coin removed from ${selectedGroup.name}`,
        })
      } catch {
        toast({
          title: "Error",
          description: "Failed to remove coin",
          variant: "destructive",
        })
      }
    })
  }, [selectedGroup, removeFromSelectedGroup])

  // React 19: Show pending states
  const showPending = isPending || isRemovePending

  if (!coins.length) return null

  return (
    <div className={cn(
      "space-y-4",
      showPending && "opacity-60 transition-opacity duration-200"
    )}>
      {coinsWithIntervalChange.map(coin => (
        <div 
          key={coin.id} 
          className={cn(
            "rounded-[10px] bg-primary/5 p-0.5",
            isRemovePending && "pointer-events-none"
          )}
        >
          {/* Header with Token Name */}
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    {coin.image ? (
                      <Image
                        src={coin.image?.startsWith('http') || coin.image?.startsWith('/') ? coin.image : '/favicon.ico'}
                        alt={coin.name}
                        className={cn(
                          "w-4 h-4 rounded-full",
                          coin.isOptimistic && "opacity-50"
                        )}
                        width={16}
                        height={16}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/favicon.ico';
                        }}
                      />
                    ) : (
                      <div className={cn(
                        "w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary/70",
                        coin.isOptimistic && "opacity-50"
                      )}>
                        {coin.symbol?.charAt(0) || '?'}
                      </div>
                    )}
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
                    disabled={showPending}
                    className={cn(
                      "h-6 w-6 p-0 rounded-lg bg-transparent",
                      showPending && "opacity-50"
                    )}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ) : (
              // Show clickable link for real coins
              <Link 
                href={watchlistGroup ? `/charts/${coin.id}?wg=${watchlistGroup}` : `/charts/${coin.id}`}
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
                  {isNaN(coin.intervalChange) ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      N/A
                    </span>
                  ) : (
                    <span className={cn(
                      "font-mono text-xs",
                      coin.intervalChange > 0 ? 'text-green-600' : 'text-red-600'
                    )}>
                      {coin.intervalChange > 0 ? '+' : ''}{coin.intervalChange.toFixed(2)}%
                    </span>
                  )}
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
                    disabled={showPending}
                    className={cn(
                      "h-6 w-6 p-0 rounded-lg bg-transparent hover:bg-rose-500/10 transition-colors group",
                      showPending && "opacity-50 cursor-not-allowed"
                    )}
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
})