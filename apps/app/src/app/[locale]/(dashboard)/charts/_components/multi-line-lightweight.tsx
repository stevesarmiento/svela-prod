'use client'

import React, { useMemo, useTransition, useDeferredValue, useCallback, memo, useEffect, useState } from 'react'
import { useIsomorphicTheme } from '@/hooks/use-isomorphic-theme'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import type { CoinMarketData } from '@/types/coins'
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import { cn } from "@v1/ui/cn";
import { IconCircleDottedAndCircle, IconXmarkCircleFill, IconPlus } from 'symbols-react'
import { toast } from "@v1/ui/use-toast"
import Link from 'next/link'
import { useBottomNav } from '@/components/navigation/bottom-nav-context'
import { Button } from '@v1/ui/button'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { AvatarCircles } from "@v1/ui/token-stacks"
import { getTokenLogoURL } from "@/lib/logo-overrides"
import { ChartLoadingSkeleton } from "@/components/charts/chart-loading-skeleton"
import { useCoinGeckoBulkChartData } from '@/hooks/use-coingecko-bulk-chart-data'
import { TimeScaleSelector } from "./multi-line-lightweight-time-scale-selector"
import type { CoinSeries } from "./multi-line-lightweight.types"
import { useMultiLineLightweightChart } from "./use-multi-line-lightweight-chart"

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
  image?: string; // CoinGecko image URL
}

interface MultiPriceChartLightweightProps {
  coins: OptimisticCoinMarketData[]
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
  isPending?: boolean
}

export const MultiPriceChartLightweight = memo(function MultiPriceChartLightweight({ 
  coins, 
  activeTimeScale, 
  setActiveTimeScale,
  isPending 
}: MultiPriceChartLightweightProps) {
  const { removeFromSelectedGroup, removeFromWatchlist, selectedGroup } = useWatchlist()
  const [hoveredCoin, setHoveredCoin] = useState<string | null>(null)
  const [hoveredRemoveId, setHoveredRemoveId] = useState<string | null>(null)
  
  // React 19: Add concurrent features
  const [isChartPending, startChartTransition] = useTransition()
  
  // React 19: Defer expensive computations
  const deferredCoins = useDeferredValue(coins)
  const deferredTimeScale = useDeferredValue(activeTimeScale)
  
  // Use isomorphic theme hook - eliminates hydration mismatch
  const { isDarkMode } = useIsomorphicTheme()
  
  
  // Use the bottom nav context to trigger contextual command search
  const { openContextualCommandSearch } = useBottomNav()

  // 🚀 OPTIMIZED: Use CoinGecko BULK multi-chart data hook with intelligent caching
  const { 
    series: coinSeriesData, 
    isLoading: isChartLoading, 
  } = useCoinGeckoBulkChartData(deferredCoins, deferredTimeScale)

  // React 19: Memoize expensive color generation with deferred data
  const coinSeriesWithColors = useMemo((): CoinSeries[] => {
    if (!coinSeriesData.length) return []
    
    const colors = generatePastelColors(coinSeriesData.length)
    
    return coinSeriesData.map((series, index) => {
      const baseColor = colors[index] || `hsl(${Math.random() * 360}, 40%, 75%)`
      // For light mode, make colors darker and more saturated
      const themeAwareColor = isDarkMode 
        ? baseColor 
        : baseColor.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, (_, h, s, l) => {
            // Increase saturation and decrease lightness for light mode
            return `hsl(${h}, ${Math.min(100, parseInt(s) + 20)}%, ${Math.max(30, parseInt(l) - 40)}%)`
          })
      
      return {
        ...series,
        color: themeAwareColor,
      }
    })
  }, [coinSeriesData, isDarkMode])

  const latestValues = useMemo(() => {
    return coinSeriesWithColors.map(series => ({
      ...series,
      latestValue: series.data[series.data.length - 1]?.value || 0
    }))
  }, [coinSeriesWithColors])

  const latestValuesById = useMemo(() => {
    const map = new Map<string, (CoinSeries & { latestValue: number })>()
    for (const series of latestValues) {
      map.set(series.id, series)
    }
    return map
  }, [latestValues])

  // React 19: Use callback for hover handlers
  const handleCoinHover = useCallback((coinId: string | null) => {
    startChartTransition(() => {
      setHoveredCoin(coinId)
    })
  }, [])

  const handleRemoveHover = useCallback((coinId: string | null) => {
    setHoveredRemoveId(coinId)
  }, [])

  // Create avatar data for coin logos (filter out optimistic coins) - using deferred coins
  const avatarData = useMemo(() => {
    return deferredCoins
      .filter((coin) => !coin.isOptimistic)
      .map((coin) => {
        const logoUrl = getTokenLogoURL(coin.symbol, coin.image)
        if (!logoUrl) return null
        return {
          imageUrl: logoUrl,
          profileUrl: `/charts/${coin.id}`,
        }
      })
      .filter((item): item is { imageUrl: string; profileUrl: string } => item !== null)
  }, [deferredCoins])

  const { chartContainerRef, lineSeriesMapRef } = useMultiLineLightweightChart({
    series: coinSeriesWithColors,
    isDarkMode,
    height: 400,
  })

  // Handle hover effects on chart lines
  useEffect(() => {
    if (!lineSeriesMapRef.current.size) return

    lineSeriesMapRef.current.forEach((lineData, coinId) => {
      const { series, coinData } = lineData
      const isHovered = hoveredCoin === coinId
      const isOtherHovered = hoveredCoin && hoveredCoin !== coinId

      if (isOtherHovered) {
        // Dim this line
        series.applyOptions({
          color: addOpacityToColor(coinData.color, 0.3), // 30% opacity
          lineWidth: 1,
        })
      } else if (isHovered) {
        // Highlight this line
        series.applyOptions({
          color: coinData.color,
          lineWidth: 2,
        })
      } else {
        // Reset to normal
        series.applyOptions({
          color: coinData.color,
          lineWidth: 1,
        })
      }
    })
  }, [hoveredCoin, coinSeriesWithColors, lineSeriesMapRef])

  // React 19: Show pending states
  const showPending = isPending || isChartPending || isChartLoading

  // Always show the main UI structure
  return (
    <div className={cn(
      "grid grid-cols-12 gap-0 rounded-[16px] dark:bg-zinc-950/50 bg-zinc-100/50 border dark:border-zinc-800/50 border-zinc-800/10 overflow-hidden p-1",
      showPending && "opacity-60 transition-opacity duration-200"
    )}>
      {/* Legend */}
      <div className="flex flex-col col-span-3 p-6 pt-2 space-y-2">   
        <div className="flex flex-row items-center justify-between gap-2 mb-3"> 
          <IconCircleDottedAndCircle className="size-6 fill-primary/40" />
          {/* Add Coin Button - triggers chart contextual command search */}
          <Button
            variant="outline"
            onClick={() => openContextualCommandSearch('charts')}
            className="group w-full border-zinc-800/0 dark:hover:border-zinc-800/80 bg-transparent hover:bg-transparent flex items-center gap-2 justify-between p-3 rounded-lg"
          >
            <span className="text-muted-foreground font-normal text-sm group-hover:text-primary">Add to comparison</span>
            <IconPlus className="group-hover:fill-primary group-hover:rotate-90 transition-all duration-200 size-3 fill-muted-foreground" />
          </Button>
        </div> 
        
        <div className="flex flex-col gap-2 space-y-3">
          {/* Show loading coins in legend */}
          {coins.map((coin) => {
            const realCoin = latestValuesById.get(coin.id.toString())
            
            return (
              <div key={coin.id}>
                {coin.isOptimistic ? (
                  // Loading state in legend
                  <div className="flex items-center gap-2 opacity-50 rounded-lg p-0 -m-2">
                    <div className="w-1 h-9 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
                    <div className="flex flex-row items-center gap-2 flex-1 ml-2">
                      <span className="text-xs font-medium">...</span>
                      <span className="text-xs font-diatype-mono text-muted-foreground">Loading...</span>
                    </div>
                  </div>
                ) : realCoin ? (
                  // Real coin in legend
                  <div
                    className={cn(
                      "relative flex items-center gap-2 overflow-hidden rounded-lg p-0 -m-2 group hover:bg-white/10",
                      hoveredCoin && hoveredCoin !== coin.id.toString() ? "opacity-40" : "opacity-100",
                      hoveredCoin === coin.id.toString() ? "bg-white/5" : "",
                    )}
                    style={{ backgroundColor: addOpacityToColor(realCoin.color, 0.1) }}
                    onMouseEnter={() => handleCoinHover(coin.id.toString())}
                    onMouseLeave={() => handleCoinHover(null)}
                  >
                    <Link
                      href={`/charts/${coin.id}`}
                      className="flex flex-1 items-center gap-2 overflow-hidden"
                    >
                      <div className="h-9 w-1 rounded-full" style={{ backgroundColor: realCoin.color }} />
                      <div className="ml-2 flex flex-1 flex-row items-center gap-2 overflow-hidden">
                        <span className="text-xs font-medium">{realCoin.symbol.toUpperCase()}</span>
                        <span className="truncate text-xs font-diatype-mono text-muted-foreground">
                          {realCoin.name}
                        </span>
                      </div>
                    </Link>

                    <button
                      type="button"
                      aria-label={`Remove ${realCoin.name} from watchlist`}
                      className={cn(
                        "absolute right-2 rounded-full p-1 opacity-0 transition-opacity duration-200 hover:bg-red-500/20 group-hover:opacity-100 group-focus-within:opacity-100",
                        hoveredRemoveId === coin.id.toString() ? "bg-red-500/30" : "",
                      )}
                      onMouseEnter={() => {
                        handleRemoveHover(coin.id.toString())
                      }}
                      onMouseLeave={() => {
                        handleRemoveHover(null)
                      }}
                      onFocus={() => {
                        handleRemoveHover(coin.id.toString())
                      }}
                      onBlur={() => {
                        handleRemoveHover(null)
                      }}
                      onClick={async () => {
                        try {
                          if (selectedGroup) {
                            await removeFromSelectedGroup(coin.id.toString())
                          } else {
                            await removeFromWatchlist(coin.id.toString())
                          }

                          const targetName = selectedGroup ? selectedGroup.name : "watchlist"
                          toast({
                            title: "Removed",
                            description: `${coin.name} removed from ${targetName}`,
                          })
                        } catch {
                          toast({
                            title: "Error",
                            description: "Failed to remove from watchlist",
                            variant: "destructive",
                          })
                        }
                      }}
                    >
                      <IconXmarkCircleFill
                        className={cn(
                          "size-4 transition-colors duration-200",
                          hoveredRemoveId === coin.id.toString()
                            ? "fill-red-400"
                            : "fill-muted-foreground hover:fill-red-400",
                        )}
                      />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="col-span-9 dark:bg-zinc-950/50 bg-white border dark:border-zinc-800/30 border-zinc-800/20 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        {/* Chart Content */}
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader className="flex flex-row items-center justify-between">
              {/* Coin Avatar Stacks */}
              {avatarData.length > 0 && (
                <AvatarCircles
                  avatarUrls={avatarData}
                  className="scale-75 -ml-2"
                />
              )}
              
              {/* Time Scale Selector */}
              <TimeScaleSelector
                activeTimeScale={activeTimeScale}
                setActiveTimeScale={setActiveTimeScale}
              />
            </CardHeader>
            <CardContent className="pl-8">
              <div className="p-0 relative">
                {coins.length > 0 && coinSeriesWithColors.length === 0 ? (
                  <div className="relative h-[400px]">
                    <ChartLoadingSkeleton
                      height={400}
                      lines={Math.max(1, coins.length)}
                      className="opacity-80"
                    />
                  </div>
                ) : coinSeriesWithColors.length === 0 ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">No coins to display</p>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Custom gradient grid lines overlay */}
                    <div 
                      className="absolute inset-0 pointer-events-none z-10"
                      style={{
                        backgroundImage: `
                          repeating-linear-gradient(
                            to bottom,
                            transparent 0px,
                            transparent 79px,
                            linear-gradient(to right, transparent 0%, rgba(255, 255, 255, 0.06) 50%, transparent 100%) 80px,
                            transparent 81px,
                            transparent 160px
                          )
                        `
                      }}
                    />
                    <div ref={chartContainerRef} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
})