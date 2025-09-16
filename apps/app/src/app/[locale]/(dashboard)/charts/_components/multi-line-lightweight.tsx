'use client'

import React, { useEffect, useRef, useMemo, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  Time,
  LastPriceAnimationMode,
  LineSeries,
  ISeriesApi,
} from 'lightweight-charts'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { createRoot } from "react-dom/client"
import type { CoinMarketData } from '@/types/coins'
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import { cn } from "@v1/ui/cn";
import { IconCircleDottedAndCircle, IconXmarkCircleFill, IconPlus } from 'symbols-react'
import { toast } from "@v1/ui/use-toast"
import Link from 'next/link'
import { useBottomNav } from '@/components/navigation/bottom-nav-context'
import { Button } from '@v1/ui/button'
import { Spinner } from "@v1/ui/spinner"
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { AvatarCircles } from "@v1/ui/token-stacks"
import { useCoinGeckoBulkChartData } from '@/hooks/use-coingecko-bulk-chart-data'

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
  image?: string; // CoinGecko image URL
}

interface MultiPriceChartLightweightProps {
  coins: OptimisticCoinMarketData[]
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
}

interface PriceDataPoint {
  time: Time
  value: number
}

interface TooltipCoinData {
  id: string
  name: string
  color: string
  value: number
  symbol: string
}

interface CoinSeries {
  id: string
  name: string
  symbol: string
  color: string
  data: PriceDataPoint[]
}

interface LineSeriesData {
  series: ISeriesApi<"Line">
  coinData: CoinSeries
}

const TooltipContent = ({
  coinData,
  timestamp,
}: {
  coinData: TooltipCoinData[]
  timestamp: number
}) => {
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="px-4 py-3">
        <div className="mb-3 text-[11px] text-gray-600 dark:text-zinc-400 font-medium">
          {new Date(timestamp).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric'
          })}
        </div>
        <div className="w-full h-[1px] mb-3 bg-gray-300 dark:bg-zinc-700/50 scale-125" />
        <div className="flex flex-col gap-2">
          {coinData.map((coin) => (
            <div key={coin.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-1 rounded-full"
                  style={{ backgroundColor: coin.color }}
                />
                <span className="text-[11px] text-gray-600 dark:text-zinc-400 truncate max-w-[80px]">
                  {coin.symbol.toUpperCase()} <span className="text-gray-500 dark:text-zinc-500">{coin.name}</span>
                </span>
              </div>
              <span className="text-[11px] font-mono text-gray-900 dark:text-white font-bold">
                {coin.value > 0 ? '+' : ''}{coin.value.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}



const TimeScaleSelector = ({ 
  activeTimeScale, 
  setActiveTimeScale 
}: { 
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void 
}) => {
  const scales = [
    { value: "1d", label: "1D" },   // 24h (48 hours of hourly data)
    { value: "7d", label: "1W" },   // 7 days  
    { value: "30d", label: "1Q" },   // 30 days focus with 90 days context
    { value: "max", label: "1Y" },    // 1 year of data
    { value: "2y", label: "Max" },    // Maximum data possible
  ]

  return (
    <div className="flex gap-1 bg-white/95 dark:bg-zinc-950/10 backdrop-blur-xl border border-gray-200/50 dark:border-zinc-800/30 rounded-[12px] p-1">
      {scales.map((scale) => (
        <button
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "px-2 py-1 text-xs rounded-lg",
            activeTimeScale === scale.value
              ? "bg-gray-200 border border-gray-300 shadow-md shadow-gray-500/20 text-gray-900 dark:bg-zinc-800/50 dark:border-zinc-800/50 dark:shadow-zinc-950/50 dark:text-white"
              : "bg-transparent text-muted-foreground hover:bg-muted/80"
          )}
        >
          {scale.label}
        </button>
      ))}
    </div>
  )
}

export function MultiPriceChartLightweight({ 
  coins, 
  activeTimeScale, 
  setActiveTimeScale 
}: MultiPriceChartLightweightProps) {
  const { removeFromWatchlist } = useWatchlist()
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [hoveredCoin, setHoveredCoin] = useState<string | null>(null)
  const [hoveredRemoveId, setHoveredRemoveId] = useState<string | null>(null)
  const lineSeriesMapRef = useRef<Map<string, LineSeriesData>>(new Map())
  
  // Theme detection state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches ||
           document.documentElement.classList.contains('dark')
  })

  // Listen for theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const observer = new MutationObserver(() => {
      setIsDarkMode(
        mediaQuery.matches || document.documentElement.classList.contains('dark')
      )
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    const handleChange = () => {
      setIsDarkMode(
        mediaQuery.matches || document.documentElement.classList.contains('dark')
      )
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      observer.disconnect()
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])
  
  // Use the bottom nav context to trigger contextual command search
  const { openContextualCommandSearch } = useBottomNav()

  // 🚀 OPTIMIZED: Use CoinGecko BULK multi-chart data hook with intelligent caching
  const { series: coinSeriesData, isLoading: chartDataLoading, performance } = useCoinGeckoBulkChartData(coins, activeTimeScale)

  // 🔍 DEBUG: Log bulk performance
  console.log('📊 Bulk multi-line chart:', {
    totalCoins: coins.length,
    seriesCount: coinSeriesData.length,
    bulkApiCalls: performance.bulkApiCalls,
    cacheHitRate: performance.cacheHitRate.toFixed(1) + '%'
  })

  // Generate colors for the series data - theme-aware
  const coinSeriesWithColors = useMemo(() => {
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

  // Create avatar data for coin logos (filter out optimistic coins)
  const avatarData = useMemo(() => {
    return coins.filter(coin => !coin.isOptimistic && coin.image).map((coin) => ({
      imageUrl: coin.image!, // Only use CoinGecko images, skip coins without images
      profileUrl: `/charts/${coin.id}`,
    }))
  }, [coins])

  useEffect(() => {
    if (!chartContainerRef.current || !coinSeriesWithColors.length) return

    // Detect current theme
    const isDarkMode = typeof window !== 'undefined' ? 
      window.matchMedia('(prefers-color-scheme: dark)').matches ||
      document.documentElement.classList.contains('dark') : true

    const chart = createChart(chartContainerRef.current, {
      handleScale: false,
      handleScroll: false,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDarkMode ? "#ffffff50" : "#00000050",
        attributionLogo: false,
      },
      grid: {
        vertLines: { 
          visible: false,
          color: isDarkMode ? "#e5e7eb0" : "#00000020",
          style: LineStyle.Dotted,
        },
        horzLines: { 
          visible: false, // Hide default lines, we'll create gradient ones
          color: isDarkMode ? "#ffffff10" : "#00000010",
          style: LineStyle.Solid,
        },
      },
      rightPriceScale: {
        borderVisible: false,
        autoScale: true,
        visible: true,
        entireTextOnly: true,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          labelVisible: true,
          width: 1,
          color: isDarkMode ? "#d1d5db40" : "#00000040",
          visible: true,
          style: LineStyle.Solid,
        },
        horzLine: {
          visible: false,
          labelVisible: false,
        },
      },
      timeScale: {
        visible: false,
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
      },
    })

    // Create line series for each coin
    const lineSeriesMap = new Map()
    
    coinSeriesWithColors.forEach((coinSeries) => {
      const lineSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        lastValueVisible: true,
        visible: true,
        priceLineVisible: false,
        color: coinSeries.color,
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => `${price > 0 ? '+' : ''}${price.toFixed(2)}%`,
        },
      })
      
      lineSeries.setData(coinSeries.data)
      lineSeriesMap.set(coinSeries.id, { series: lineSeries, coinData: coinSeries })
    })

    // Store the map in ref for hover effects
    lineSeriesMapRef.current = lineSeriesMap

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: 400,
        })
      }
    }

    window.addEventListener("resize", handleResize)
    handleResize()

    // Add tooltip
    const tooltipEl = document.createElement("div")
    const tooltipRoot = createRoot(tooltipEl)
    tooltipEl.className = `fixed hidden overflow-hidden text-[11px] rounded-xl w-[200px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl transition-all duration-100 ease-in-out ${
      isDarkMode 
        ? 'text-white bg-zinc-900/95 border border-zinc-700/50' 
        : 'text-gray-900 bg-white/95 border border-gray-200/50'
    }`
    document.body.appendChild(tooltipEl)

    // Subscribe to crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        tooltipEl.style.display = "none"
        return
      }

      if (!chartContainerRef.current) return
      const chartRect = chartContainerRef.current.getBoundingClientRect()

      const coinData: TooltipCoinData[] = []
      
      // Use coinSeriesWithColors to maintain consistent order in tooltip
      // Always show all coins by finding closest data point for each
      coinSeriesWithColors.forEach((coinSeries) => {
        const lineData = lineSeriesMapRef.current.get(coinSeries.id)
        if (lineData && coinSeries.data.length > 0 && param.time) { // Added param.time check
          // Find the closest data point to the crosshair time
          let closestPoint = coinSeries.data[0]!
          let minDiff = Math.abs((closestPoint.time as number) - (param.time as number))
          
          for (const point of coinSeries.data) {
            const diff = Math.abs((point.time as number) - (param.time as number))
            if (diff < minDiff) {
              minDiff = diff
              closestPoint = point
            }
          }
          
          // DEBUG: Log why coin might be skipped
          console.log(`Tooltip for ${coinSeries.symbol}:`, {
            dataPoints: coinSeries.data.length,
            minDiffSeconds: minDiff,
            minDiffHours: (minDiff / 3600).toFixed(2),
            timeframe: activeTimeScale,
            hasData: coinSeries.data.length > 0,
            closestTime: closestPoint.time,
            crosshairTime: param.time
          })
          
          coinData.push({
            id: coinSeries.id,
            name: coinSeries.name,
            symbol: coinSeries.symbol,
            color: coinSeries.color,
            value: closestPoint.value,
          })
        } else {
          // DEBUG: Log skipped coins
          console.warn(`Skipped coin ${coinSeries.symbol}: no data available`, {
            hasLineData: !!lineData,
            dataLength: coinSeries.data.length
          })
        }
      })

      if (coinData.length === 0) {
        tooltipEl.style.display = "none"
        return
      }

      tooltipEl.style.display = "block"
      tooltipRoot.render(
        <TooltipContent
          coinData={coinData}
          timestamp={Number(param.time) * 1000}
        />
      )

      const tooltipWidth = tooltipEl.offsetWidth
      const tooltipHeight = tooltipEl.offsetHeight

      // Position tooltip
      let left = chartRect.left + param.point.x + 15
      let top = chartRect.top + param.point.y - tooltipHeight / 2

      // Adjust if tooltip goes beyond right edge
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = chartRect.left + param.point.x - tooltipWidth - 15
      }

      // Adjust if tooltip goes beyond bottom edge
      if (top + tooltipHeight > window.innerHeight - 10) {
        top = window.innerHeight - tooltipHeight - 10
      }

      // Adjust if tooltip goes beyond top edge
      if (top < 10) {
        top = 10
      }

      tooltipEl.style.left = `${left}px`
      tooltipEl.style.top = `${top}px`
    })

    return () => {
      window.removeEventListener("resize", handleResize)
      requestAnimationFrame(() => {
        tooltipRoot.unmount()
        document.body.removeChild(tooltipEl)
      })
      chart.remove()
    }
  }, [coinSeriesWithColors, activeTimeScale, isDarkMode])

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
  }, [hoveredCoin])

  // Always show the main UI structure
  return (
    <div className="grid grid-cols-12 gap-0 rounded-[16px] dark:bg-zinc-950/50 bg-zinc-100/50 border dark:border-zinc-800/20 border-zinc-800/10 overflow-hidden p-1">
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
            const realCoin = latestValues.find(c => c.id === coin.id.toString());
            
            return (
              <div key={coin.id}>
                {coin.isOptimistic ? (
                  // Loading state in legend
                  <div className="flex items-center gap-2 opacity-50 rounded-lg p-0 -m-2">
                    <div className="w-1 h-9 rounded-full bg-muted animate-pulse" />
                    <div className="flex flex-row items-center gap-2 flex-1 ml-2">
                      <span className="text-xs font-medium">...</span>
                      <span className="text-xs font-mono text-muted-foreground">Loading...</span>
                    </div>
                  </div>
                ) : realCoin ? (
                  // Real coin in legend
                  <Link 
                    href={`/charts/${coin.id}`}
                    className="block"
                  >
                    <div 
                      className={cn(
                        "flex overflow-hidden items-center gap-2 cursor-pointer transition-opacity duration-200 rounded-lg p-0 -m-2 relative group hover:bg-white/10",
                        hoveredCoin && hoveredCoin !== coin.id.toString() ? "opacity-40" : "opacity-100",
                        hoveredCoin === coin.id.toString() ? "bg-white/5" : ""
                      )}
                      style={{ backgroundColor: addOpacityToColor(realCoin.color, 0.1) }}
                      onMouseEnter={() => setHoveredCoin(coin.id.toString())}
                      onMouseLeave={() => setHoveredCoin(null)}
                    >
                      <div 
                        className="w-1 h-9 rounded-full transition-transform duration-200"
                        style={{ backgroundColor: realCoin.color }}
                      />
                      <div className="flex flex-row items-center gap-2 flex-1 ml-2">
                        <span className="text-xs font-medium">{realCoin.symbol.toUpperCase()}</span>
                        <span className="text-xs font-mono text-muted-foreground">{realCoin.name}</span>
                      </div>
                      
                      {/* Remove Icon - appears on hover */}
                      <div 
                        className={cn(
                          "absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-full hover:bg-red-500/20",
                          hoveredRemoveId === coin.id.toString() ? "bg-red-500/30" : ""
                        )}
                        onMouseEnter={(e) => {
                          e.stopPropagation()
                          setHoveredRemoveId(coin.id.toString())
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation()
                          setHoveredRemoveId(null)
                        }}
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          try {
                            await removeFromWatchlist(coin.id.toString())
                            toast({
                              title: "Removed",
                              description: `${coin.name} removed from watchlist`,
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
                              : "fill-muted-foreground hover:fill-red-400"
                          )}
                        />
                      </div>
                    </div>
                  </Link>
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
                {/* Show loading message if no chart data yet */}
                {chartDataLoading && coins.length > 0 ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center">
                      <Spinner size={24} className="mb-2" />
                      <p className="text-sm text-muted-foreground">Loading chart data...</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Bulk API: {performance.bulkApiCalls} calls | Cache: {performance.cacheHitRate.toFixed(1)}%
                      </p>
                    </div>
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
}