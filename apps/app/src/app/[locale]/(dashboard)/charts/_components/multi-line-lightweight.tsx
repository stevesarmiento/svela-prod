'use client'

import React, { useMemo, useTransition, useDeferredValue, useCallback, memo, useEffect, useRef, useState } from 'react'
import { createRoot } from "react-dom/client"
import { useIsomorphicTheme } from '@/hooks/use-isomorphic-theme'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import type { CoinMarketData } from '@/types/coins'
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import { cn } from "@v1/ui/cn";
import { useMediaQuery } from "@v1/ui/hooks"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v1/ui/dropdown-menu"
import { IconXmarkCircleFill, IconPlus } from 'symbols-react'
import { ChevronDown } from "lucide-react"
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
import type { TooltipCoinData } from "./multi-line-lightweight.types"
import { TooltipContent } from "./multi-line-lightweight-tooltip"
import { Liveline } from "liveline"
import type { LivelinePoint, LivelineSeries } from "liveline"
import type { Time as LightweightTime } from "lightweight-charts"

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

function toUnixSeconds(time: LightweightTime): number | null {
  if (typeof time === "number") return Number.isFinite(time) ? time : null

  if (typeof time === "string") {
    const [year, month, day] = time.split("-").map((part) => Number(part))
    if (!year || !month || !day) return null
    return Math.floor(Date.UTC(year, month - 1, day) / 1000)
  }

  if (typeof time === "object" && time) {
    const maybe = time as { year?: unknown; month?: unknown; day?: unknown }
    const year = typeof maybe.year === "number" ? maybe.year : null
    const month = typeof maybe.month === "number" ? maybe.month : null
    const day = typeof maybe.day === "number" ? maybe.day : null
    if (!year || !month || !day) return null
    return Math.floor(Date.UTC(year, month - 1, day) / 1000)
  }

  return null
}

function findClosestPoint(
  data: Array<LivelinePoint>,
  targetTimeSec: number,
): LivelinePoint | null {
  if (data.length === 0) return null

  let low = 0
  let high = data.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midTime = data[mid]?.time
    if (midTime === undefined) break
    if (midTime === targetTimeSec) return data[mid] ?? null
    if (midTime < targetTimeSec) low = mid + 1
    else high = mid - 1
  }

  const right = data[low]
  const left = data[low - 1]
  if (!left) return right ?? null
  if (!right) return left ?? null

  const leftDiff = Math.abs(left.time - targetTimeSec)
  const rightDiff = Math.abs(right.time - targetTimeSec)
  return leftDiff <= rightDiff ? left : right
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
  const isCompactLayout = useMediaQuery("(max-width: 767px)")
  const isMediumLayout = useMediaQuery("(max-width: 1023px)")
  
  const chartHeight = isCompactLayout ? 280 : isMediumLayout ? 340 : 400
  
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
            return `hsl(${h}, ${Math.min(100, Number.parseInt(s) + 20)}%, ${Math.max(30, Number.parseInt(l) - 40)}%)`
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

  const handleRemoveCoin = useCallback(
    async (coin: OptimisticCoinMarketData) => {
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
    },
    [removeFromSelectedGroup, removeFromWatchlist, selectedGroup],
  )

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

  const livelineSeries = useMemo((): LivelineSeries[] => {
    const isHovering = Boolean(hoveredCoin)

    return coinSeriesWithColors
      .map((row): LivelineSeries | null => {
        const data: LivelinePoint[] = []
        for (const point of row.data) {
          const time = toUnixSeconds(point.time)
          if (time === null) continue
          if (!Number.isFinite(point.value)) continue
          data.push({ time, value: point.value })
        }

        const latestValue = data[data.length - 1]?.value
        if (typeof latestValue !== "number") return null

        const isDimmed = isHovering && hoveredCoin !== row.id
        const color = isDimmed ? addOpacityToColor(row.color, 0.25) : row.color

        const latestPctText = `${latestValue > 0 ? "+" : ""}${latestValue.toFixed(2)}%`
        const compactLabel = row.symbol.toUpperCase()

        return {
          id: row.id,
          data,
          value: latestValue,
          color,
          // Render the latest % directly on the line endpoint.
          label: isCompactLayout ? compactLabel : `${compactLabel} ${latestPctText}`,
        }
      })
      .filter((row): row is LivelineSeries => row !== null)
  }, [coinSeriesWithColors, hoveredCoin, isCompactLayout])

  const tooltipSeries = useMemo(() => {
    return coinSeriesWithColors
      .map((row) => {
        const data: LivelinePoint[] = []
        for (const point of row.data) {
          const time = toUnixSeconds(point.time)
          if (time === null) continue
          if (!Number.isFinite(point.value)) continue
          data.push({ time, value: point.value })
        }

        return {
          id: row.id,
          name: row.name,
          symbol: row.symbol,
          color: row.color,
          data,
        }
      })
      .filter((row) => row.data.length > 0)
  }, [coinSeriesWithColors])

  const windowSecs = useMemo(() => {
    let min: number | null = null
    let max: number | null = null

    for (const s of livelineSeries) {
      const first = s.data[0]?.time
      const last = s.data[s.data.length - 1]?.time
      if (typeof first !== "number" || typeof last !== "number") continue
      if (min === null || first < min) min = first
      if (max === null || last > max) max = last
    }

    if (min === null || max === null) return 30
    return Math.max(30, max - min)
  }, [livelineSeries])

  const tooltipClassName = useMemo(
    () =>
      `fixed overflow-hidden text-[11px] rounded-xl w-[200px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl transition-opacity duration-100 ease-out ${
        isDarkMode
          ? "text-white bg-zinc-900/95 border border-zinc-700/50"
          : "text-gray-900 bg-white/95 border border-gray-200/50"
      }`,
    [isDarkMode],
  )

  const chartWrapperRef = useRef<HTMLDivElement | null>(null)
  const tooltipElRef = useRef<HTMLDivElement | null>(null)
  const tooltipRootRef = useRef<ReturnType<typeof createRoot> | null>(null)
  const isTooltipVisibleRef = useRef(false)
  const lastTooltipTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const tooltipEl = document.createElement("div")
    const tooltipRoot = createRoot(tooltipEl)
    tooltipElRef.current = tooltipEl
    tooltipRootRef.current = tooltipRoot

    tooltipEl.className = tooltipClassName
    tooltipEl.style.left = "0px"
    tooltipEl.style.top = "0px"
    tooltipEl.style.opacity = "0"
    tooltipEl.style.visibility = "hidden"
    tooltipEl.style.transform = "translate3d(0px, 0px, 0)"
    document.body.appendChild(tooltipEl)

    return () => {
      isTooltipVisibleRef.current = false
      lastTooltipTimeRef.current = null
      tooltipElRef.current = null
      tooltipRootRef.current = null

      requestAnimationFrame(() => {
        try {
          tooltipRoot.unmount()
        } catch {
          // noop
        }
        if (document.body.contains(tooltipEl)) {
          document.body.removeChild(tooltipEl)
        }
      })
    }
  }, [])

  useEffect(() => {
    const tooltipEl = tooltipElRef.current
    if (tooltipEl) tooltipEl.className = tooltipClassName
  }, [tooltipClassName])

  const handleLivelineHover = useCallback(
    (hover: { time: number; value: number; x: number; y: number } | null) => {
      const tooltipEl = tooltipElRef.current
      const tooltipRoot = tooltipRootRef.current
      const container = chartWrapperRef.current
      if (!tooltipEl || !tooltipRoot || !container) return

      if (!hover) {
        if (isTooltipVisibleRef.current) {
          tooltipEl.style.opacity = "0"
          tooltipEl.style.visibility = "hidden"
          isTooltipVisibleRef.current = false
          lastTooltipTimeRef.current = null
        }
        return
      }

      const primary = tooltipSeries[0]
      const closestPrimary = primary ? findClosestPoint(primary.data, Math.round(hover.time)) : null
      const timeSec = closestPrimary?.time ?? Math.round(hover.time)
      const timestampMs = timeSec * 1000

      const coinData: TooltipCoinData[] = []
      for (const row of tooltipSeries) {
        const closest = findClosestPoint(row.data, timeSec)
        if (!closest) continue
        coinData.push({
          id: row.id,
          name: row.name,
          symbol: row.symbol,
          color: row.color,
          value: closest.value,
        })
      }

      if (coinData.length === 0) {
        if (isTooltipVisibleRef.current) {
          tooltipEl.style.opacity = "0"
          tooltipEl.style.visibility = "hidden"
          isTooltipVisibleRef.current = false
          lastTooltipTimeRef.current = null
        }
        return
      }

      if (!isTooltipVisibleRef.current) {
        tooltipEl.style.opacity = "1"
        tooltipEl.style.visibility = "visible"
        isTooltipVisibleRef.current = true
      }

      if (lastTooltipTimeRef.current !== timeSec) {
        lastTooltipTimeRef.current = timeSec
        tooltipRoot.render(<TooltipContent coinData={coinData} timestamp={timestampMs} />)
      }

      const chartRect = container.getBoundingClientRect()
      const tooltipWidth = tooltipEl.offsetWidth || 200
      const tooltipHeight = tooltipEl.offsetHeight || 120

      // Pin tooltip to a stable position (top-right of chart) so it doesn't jump while scrubbing.
      let left = chartRect.right - tooltipWidth - 12
      let top = chartRect.top + 12

      // Clamp into viewport.
      if (left < 10) left = 10
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10
      }

      if (top + tooltipHeight > window.innerHeight - 10) {
        top = window.innerHeight - tooltipHeight - 10
      }

      if (top < 10) top = 10

      tooltipEl.style.transform = `translate3d(${left}px, ${top}px, 0)`
    },
    [tooltipSeries],
  )

  // React 19: Show pending states
  const showPending = isPending || isChartPending || isChartLoading

  // Always show the main UI structure
  return (
    <div className={cn(
      "grid grid-cols-1 gap-1 rounded-[16px] dark:bg-zinc-950/50 bg-zinc-100/50 border dark:border-zinc-800/50 border-zinc-800/10 overflow-hidden p-1 lg:grid-cols-12 lg:gap-0",
      showPending && "opacity-60 transition-opacity duration-200"
    )}>
      {/* Legend */}
      <div className="col-span-1 flex min-w-0 flex-col p-2 space-y-2 lg:col-span-3 lg:p-3 lg:pt-2">
        <div className="flex items-center gap-2 lg:hidden">
          <Button
            variant="outline"
            onClick={() => openContextualCommandSearch('charts')}
            className="group flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border-zinc-800/50 bg-transparent p-3 hover:bg-transparent dark:hover:border-zinc-800"
          >
            <span className="truncate text-sm font-normal text-muted-foreground group-hover:text-primary">Add to comparison</span>
            <IconPlus className="group-hover:fill-primary group-hover:rotate-90 transition-all duration-200 size-3 fill-muted-foreground" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                aria-label="Manage comparison tokens"
                className="flex shrink-0 items-center gap-1.5 rounded-lg border-zinc-800/50 bg-transparent px-3 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-primary dark:hover:border-zinc-800"
              >
                Tokens
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-[min(70dvh,24rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border-zinc-800/10 p-1.5 dark:border-zinc-800/60"
            >
              <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
                Remove from chart
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {coins.map((coin) => {
                const realCoin = latestValuesById.get(coin.id.toString())
                const color = realCoin?.color ?? "currentColor"

                return (
                  <DropdownMenuItem
                    key={coin.id}
                    disabled={coin.isOptimistic}
                    onSelect={() => {
                      void handleRemoveCoin(coin)
                    }}
                    className="flex items-center gap-2 rounded-lg px-2 py-2"
                  >
                    <span
                      className="h-6 w-1.5 shrink-0 rounded-full border border-black/40"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 text-xs font-medium">
                        {coin.symbol.toUpperCase()}
                      </span>
                      <span className="truncate text-xs font-berkeley-mono text-muted-foreground">
                        {coin.isOptimistic ? "Loading..." : coin.name}
                      </span>
                    </span>
                    <IconXmarkCircleFill className="size-4 shrink-0 fill-muted-foreground" />
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-3 hidden flex-row items-center justify-between gap-2 lg:flex">
          <Button
            variant="outline"
            onClick={() => openContextualCommandSearch('charts')}
            className="group flex w-full items-center justify-between gap-2 rounded-lg border-zinc-800/50 bg-transparent p-3 hover:bg-transparent dark:hover:border-zinc-800"
          >
            <span className="truncate text-sm font-normal text-muted-foreground group-hover:text-primary">Add to comparison</span>
            <IconPlus className="group-hover:fill-primary group-hover:rotate-90 transition-all duration-200 size-3 fill-muted-foreground" />
          </Button>
        </div>

        <div className="hidden flex-col gap-2 p-3 space-y-3 lg:flex">
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
                      <span className="text-xs font-berkeley-mono text-muted-foreground">Loading...</span>
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
                      className="flex h-8 flex-1 items-center gap-2 overflow-hidden border border-zinc-200 dark:border-zinc-800/70 rounded-lg"
                    >
                      <div className="absolute left-1.5 h-3 w-1.5 rounded-full border border-black" style={{ backgroundColor: realCoin.color }} />
                      <div className="flex flex-1 flex-row items-center gap-2 overflow-hidden">
                        <span className="ml-4.5 text-xs font-medium">{realCoin.symbol.toUpperCase()}</span>
                        <span className="truncate text-xs font-berkeley-mono text-muted-foreground">
                          {realCoin.name}
                        </span>
                      </div>
                    </Link>

                    <button
                      type="button"
                      aria-label={`Remove ${realCoin.name} from watchlist`}
                      className={cn(
                        "absolute right-2 rounded-full p-1 opacity-0 transition-all duration-200 hover:bg-red-500/20 group-hover:opacity-100 group-focus-within:opacity-100",
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
                        await handleRemoveCoin(coin)
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
      
      <div className="col-span-1 min-w-0 dark:bg-zinc-950/50 bg-white border dark:border-zinc-800/30 border-zinc-800/20 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)] lg:col-span-9">
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
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3 sm:p-6">
              {/* Coin Avatar Stacks */}
              <div className="min-w-0 flex-1 overflow-hidden">
                {avatarData.length > 0 && (
                  <AvatarCircles
                    avatarUrls={avatarData}
                    className="-ml-2 origin-left scale-75"
                  />
                )}
              </div>
              
              {/* Time Scale Selector */}
              <TimeScaleSelector
                activeTimeScale={activeTimeScale}
                setActiveTimeScale={setActiveTimeScale}
              />
            </CardHeader>
            <CardContent className="px-2 pb-2 pt-0 sm:px-6 lg:pl-8">
              <div className="p-0 relative">
                {coins.length > 0 && coinSeriesWithColors.length === 0 ? (
                  <div className="relative" style={{ height: chartHeight }}>
                    <ChartLoadingSkeleton
                      height={chartHeight}
                      lines={Math.max(1, coins.length)}
                      className="opacity-80"
                    />
                  </div>
                ) : coinSeriesWithColors.length === 0 ? (
                  <div className="flex items-center justify-center" style={{ height: chartHeight }}>
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
                    <div ref={chartWrapperRef} className="w-full" style={{ height: chartHeight }}>
                      <Liveline
                        data={[]}
                        value={0}
                        series={livelineSeries}
                        theme={isDarkMode ? "dark" : "light"}
                        color={isDarkMode ? "#e5e7eb" : "#0f172a"}
                        lineWidth={1}
                        window={windowSecs}
                        grid={false}
                        fill={false}
                        pulse={false}
                        badge={false}
                        momentum={false}
                        scrub
                        tooltipY={-9999}
                        tooltipOutline={false}
                        onHover={handleLivelineHover}
                        formatTime={() => ""}
                        formatValue={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}
                        padding={{ top: 12, right: 12, bottom: 12, left: 12 }}
                        className="size-full"
                      />
                    </div>
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
