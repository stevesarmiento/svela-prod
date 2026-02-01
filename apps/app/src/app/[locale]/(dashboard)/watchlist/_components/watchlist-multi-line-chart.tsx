'use client'

import React, { useEffect, useRef, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import type { ISeriesApi, LineData, Time } from 'lightweight-charts'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { createRoot } from 'react-dom/client'
import { cn } from "@v1/ui/cn"
import { Spinner } from "@v1/ui/spinner"
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { WatchlistGroupIcon } from '@/components/watchlist-group-icon'
import { useWatchlistGroups } from '@/lib/convex-hooks'
import { useWatchlistByGroup } from '@/lib/convex-hooks'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import { useCoinGeckoWatchlistAggregateChartIsolated } from '@/hooks/use-coingecko-watchlist-aggregate-chart-isolated'
import type { WatchlistGroup } from './watchlist-context'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'

type WatchlistGroupId = WatchlistGroup["_id"]

interface WatchlistMultiLineChartProps {
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
  selectedWatchlists: Set<WatchlistGroupId>
  onSelectWatchlist?: (watchlistId: WatchlistGroupId) => void
}

interface PriceDataPoint {
  time: Time
  value: number
}

interface TooltipWatchlistData {
  name: string
  color: string
  value: number
  icon?: string
}

interface WatchlistSeries {
  id: WatchlistGroupId
  name: string
  icon?: string
  color: string
  data: PriceDataPoint[]
  coinsCount: number
  latestValue: number
}

interface LineSeriesData {
  series: ISeriesApi<"Line">
  watchlistData: WatchlistSeries
}

function useWatchlistSeriesData(group: WatchlistGroup, activeTimeScale: string): WatchlistSeries | null {
  // Get watchlist coins for this group
  const groupWatchlist = useWatchlistByGroup(group._id)
  
  // Transform to array of CoinGecko string IDs
  const coinIds = useMemo(() => {
    if (!groupWatchlist || !Array.isArray(groupWatchlist)) return []
    return groupWatchlist.map(item => item.coinId) // Keep as string for CoinGecko
  }, [groupWatchlist])
  
  // Get coin data using CoinGecko
  const { data: coins } = useCoinGeckoWatchlistCoins(coinIds)
  
  // Get aggregate chart data using isolated CoinGecko hook
  const { aggregateData } = useCoinGeckoWatchlistAggregateChartIsolated({
    coins: coins || [],
    timeScale: activeTimeScale
  })

  const watchlistSeries = useMemo((): WatchlistSeries | null => {
    if (!coins?.length || !aggregateData?.length) {
      return null
    }

    return {
      id: group._id,
      name: group.name,
      icon: group.icon,
      color: '', // Will be set by parent
      data: aggregateData,
      coinsCount: coins.length,
      latestValue: aggregateData[aggregateData.length - 1]?.value || 0
    }
  }, [group._id, group.name, group.icon, coins, aggregateData])

  return watchlistSeries
}

function WatchlistSeriesProvider({ 
  group, 
  activeTimeScale,
  onDataUpdate 
}: { 
  group: WatchlistGroup
  activeTimeScale: string
  onDataUpdate: (groupId: WatchlistGroupId, data: WatchlistSeries | null) => void
}) {
  // Use our custom hook to get series data
  const seriesData = useWatchlistSeriesData(group, activeTimeScale)
  
  // Update parent when data changes
  React.useEffect(() => {
    onDataUpdate(group._id, seriesData)
  }, [group._id, seriesData, onDataUpdate])
  
  return null
}

const TooltipContent = ({
  watchlistData,
  timestamp,
}: {
  watchlistData: TooltipWatchlistData[]
  timestamp: number
}) => {
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="px-4 py-3">
        <div className="mb-3 text-[11px] text-muted-foreground font-medium">
          {new Date(timestamp).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric'
          })}
        </div>
        <div className="w-full h-[1px] mb-3 bg-border/50 scale-125" />
        <div className="flex flex-col gap-2">
          {watchlistData.map((watchlist) => (
            <div key={watchlist.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-1 rounded-full"
                  style={{ backgroundColor: watchlist.color }}
                />
                <WatchlistGroupIcon 
                  icon={watchlist.icon} 
                  className="w-3 h-3 text-muted-foreground"
                  size={12}
                />
                <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                  {watchlist.name}
                </span>
              </div>
              <span className="text-[11px] font-diatype-mono text-foreground font-bold">
                {watchlist.value > 0 ? '+' : ''}{watchlist.value.toFixed(2)}%
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
    { value: "1d", label: "1D" },   // 24h change
    { value: "7d", label: "1W" },   // 7d change  
    { value: "30d", label: "1M" },  // 30d change
    { value: "max", label: "1Y" },  // Longest available
  ]

  return (
    <div className="flex gap-1 dark:bg-zinc-950/10 bg-zinc-950/5 backdrop-blur-xl border dark:border-zinc-800/30 border-zinc-800/10 rounded-[12px] p-1">
      {scales.map((scale) => (
        <button
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "px-2 py-1 text-xs rounded-lg",
            activeTimeScale === scale.value
              ? "dark:bg-zinc-800/50 bg-zinc-950/50 border dark:border-zinc-800/50 border-zinc-800/20  shadow-md dark:shadow-zinc-950/50 shadow-zinc-950/10 text-white"
              : "bg-transparent text-muted-foreground hover:bg-muted/80"
          )}
        >
          {scale.label}
        </button>
      ))}
    </div>
  )
}

export function WatchlistMultiLineChart({ 
  activeTimeScale, 
  setActiveTimeScale,
  selectedWatchlists,
  onSelectWatchlist
}: WatchlistMultiLineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [hoveredWatchlist, setHoveredWatchlist] = useState<WatchlistGroupId | null>(null)
  const lineSeriesMapRef = useRef<Map<WatchlistGroupId, LineSeriesData>>(new Map())
  const [watchlistData, setWatchlistData] = useState<Map<WatchlistGroupId, WatchlistSeries>>(new Map())
  
  // ✅ IMPROVED: Handle theme directly without hydration flag
  // Use next-themes for proper theme detection (handles manual overrides correctly)
  const { resolvedTheme } = useTheme()
  
  // Get theme state from next-themes (this respects manual theme selection)
  // No need for hydration flag - React will handle SSR/CSR differences
  const isDarkMode = resolvedTheme === 'dark'
  
  
  const watchlistGroupsData = useWatchlistGroups() as WatchlistGroup[] | undefined
  
  // Filter to only selected watchlists
  const activeWatchlists = useMemo(() => {
    const groups = watchlistGroupsData || []
    return groups.filter(group => selectedWatchlists.has(group._id))
  }, [watchlistGroupsData, selectedWatchlists])

  const handleDataUpdate = React.useCallback((groupId: WatchlistGroupId, data: WatchlistSeries | null) => {
    setWatchlistData(prev => {
      const newMap = new Map(prev)
      if (data) {
        newMap.set(groupId, data)
      } else {
        newMap.delete(groupId)
      }
      return newMap
    })
  }, [])

  // Create final series data with colors
  const watchlistSeriesData = useMemo((): WatchlistSeries[] => {
    const seriesArray = Array.from(watchlistData.values())
    if (!seriesArray.length) return []

    const colors = generatePastelColors(seriesArray.length)
    
    return seriesArray.map((series, index) => {
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
        color: themeAwareColor
      }
    })
  }, [watchlistData, isDarkMode])

  const latestValues = useMemo(() => {
    return watchlistSeriesData.map(series => ({
      ...series,
      latestValue: series.data[series.data.length - 1]?.value || 0
    }))
  }, [watchlistSeriesData])

  useEffect(() => {
    if (!chartContainerRef.current || !watchlistSeriesData.length) return

    let isCancelled = false
    let cleanup: (() => void) | null = null

    void (async () => {
      const {
        createChart,
        ColorType,
        CrosshairMode,
        LineStyle,
        LineSeries,
        LastPriceAnimationMode,
      } = await loadLightweightCharts()

      if (isCancelled || !chartContainerRef.current || !watchlistSeriesData.length) return

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
            color: isDarkMode ? "#e5e7eb20" : "#00000020",
            style: LineStyle.Dotted,
          },
          horzLines: { 
            visible: false,
            color: isDarkMode ? "#ffffff10" : "#00000010",
            style: LineStyle.Dotted,
          },
        },
        rightPriceScale: {
          borderVisible: false,
          autoScale: true,
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

      // Create line series for each watchlist
      const lineSeriesMap = new Map<WatchlistGroupId, LineSeriesData>()
      
      watchlistSeriesData.forEach((watchlistSeries) => {
        const lineSeries = chart.addSeries(LineSeries, {
          lineWidth: 1,
          lastValueVisible: true,
          visible: true,
          priceLineVisible: false,
          color: watchlistSeries.color,
          lastPriceAnimation: LastPriceAnimationMode.Continuous,
          priceFormat: {
            type: "custom",
            formatter: (price: number) => `${price > 0 ? '+' : ''}${price.toFixed(2)}%`,
          },
        })
        
        lineSeries.setData(watchlistSeries.data)
        lineSeriesMap.set(watchlistSeries.id, { series: lineSeries, watchlistData: watchlistSeries })
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

      // Prefer observing the actual container size (avoids per-chart global resize listeners).
      let resizeObserver: ResizeObserver | null = null
      let resizeRafId: number | null = null
      let unsubscribeWindowResize: (() => void) | null = null

      if (typeof ResizeObserver !== "undefined" && chartContainerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId) cancelAnimationFrame(resizeRafId)
          resizeRafId = requestAnimationFrame(() => handleResize())
        })
        resizeObserver.observe(chartContainerRef.current)
      } else {
        unsubscribeWindowResize = subscribeToWindowResize(handleResize)
      }

      handleResize()

      // Add tooltip
      const tooltipEl = document.createElement("div")
      const tooltipRoot = createRoot(tooltipEl)
      tooltipEl.className = `fixed overflow-hidden text-[11px] rounded-xl w-[220px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl transition-opacity duration-100 ease-out will-change-transform ${
        isDarkMode 
          ? 'text-white bg-zinc-900/95 border border-zinc-700/50' 
          : 'text-gray-900 bg-white/95 border border-gray-200/50'
      }`
      tooltipEl.style.left = "0px"
      tooltipEl.style.top = "0px"
      tooltipEl.style.opacity = "0"
      tooltipEl.style.visibility = "hidden"
      tooltipEl.style.transform = "translate3d(0px, 0px, 0)"
      document.body.appendChild(tooltipEl)
      let isTooltipVisible = false

      // Subscribe to crosshair move
      chart.subscribeCrosshairMove((param) => {
        if (
          param.point === undefined ||
          !param.time ||
          param.point.x < 0 ||
          param.point.y < 0
        ) {
          tooltipEl.style.opacity = "0"
          tooltipEl.style.visibility = "hidden"
          isTooltipVisible = false
          return
        }

        if (!chartContainerRef.current) return
        const chartRect = chartContainerRef.current.getBoundingClientRect()

        const watchlistData: TooltipWatchlistData[] = []
        
        lineSeriesMap.forEach((lineData) => {
          const seriesData = param.seriesData.get(lineData.series) as LineData<Time>
          if (seriesData) {
            watchlistData.push({
              name: lineData.watchlistData.name,
              color: lineData.watchlistData.color,
              value: seriesData.value,
              icon: lineData.watchlistData.icon,
            })
          }
        })

        if (watchlistData.length === 0) {
          tooltipEl.style.opacity = "0"
          tooltipEl.style.visibility = "hidden"
          isTooltipVisible = false
          return
        }

        if (!isTooltipVisible) {
          tooltipEl.style.opacity = "1"
          tooltipEl.style.visibility = "visible"
          isTooltipVisible = true
        }
        tooltipRoot.render(
          <TooltipContent
            watchlistData={watchlistData}
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

        tooltipEl.style.transform = `translate3d(${left}px, ${top}px, 0)`
      })

      cleanup = () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId)
        resizeObserver?.disconnect()
        unsubscribeWindowResize?.()
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
        chart.remove()
        lineSeriesMapRef.current = new Map<WatchlistGroupId, LineSeriesData>()
      }
    })()

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [watchlistSeriesData, isDarkMode, resolvedTheme])

  // Handle hover effects on chart lines
  useEffect(() => {
    if (!lineSeriesMapRef.current.size) return

    lineSeriesMapRef.current.forEach((lineData, watchlistId) => {
      const { series, watchlistData } = lineData
      const isHovered = hoveredWatchlist === watchlistId
      const isOtherHovered = hoveredWatchlist && hoveredWatchlist !== watchlistId

      if (isOtherHovered) {
        // Dim this line
        series.applyOptions({
          color: addOpacityToColor(watchlistData.color, 0.3), // 30% opacity
          lineWidth: 1,
        })
      } else if (isHovered) {
        // Highlight this line
        series.applyOptions({
          color: watchlistData.color,
          lineWidth: 2,
        })
      } else {
        // Reset to normal
        series.applyOptions({
          color: watchlistData.color,
          lineWidth: 1,
        })
      }
    })
  }, [hoveredWatchlist])

  return (
    <div className="grid grid-cols-12 gap-0 rounded-[16px] dark:bg-zinc-950/50 bg-zinc-100/50 border dark:border-zinc-800/20 border-zinc-800/10 overflow-hidden p-1">
      {/* ✅ IMPROVED: Data providers using custom hook */}
      {activeWatchlists.map(group => (
        <WatchlistSeriesProvider
          key={group._id}
          group={group}
          activeTimeScale={activeTimeScale}
          onDataUpdate={handleDataUpdate}
        />
      ))}
      
      {/* Legend */}
      <div className="flex flex-col col-span-3 p-6 pt-6 space-y-2">           
        <div className="flex flex-col gap-2 space-y-3">
          {latestValues.map((watchlist) => (
            <div key={watchlist.id}>
              <div 
                className={cn(
                  "flex overflow-hidden items-center gap-2 cursor-pointer rounded-lg p-0 -m-2 relative group hover:bg-foreground/10",
                  hoveredWatchlist && hoveredWatchlist !== watchlist.id ? "opacity-40" : "opacity-100",
                  hoveredWatchlist === watchlist.id ? "bg-foreground/5" : ""
                )}
                style={{ backgroundColor: addOpacityToColor(watchlist.color, 0.1) }}
                onMouseEnter={() => setHoveredWatchlist(watchlist.id)}
                onMouseLeave={() => setHoveredWatchlist(null)}
                onClick={() => onSelectWatchlist?.(watchlist.id)}
              >
                <div 
                  className="w-1 h-9 rounded-full"
                  style={{ backgroundColor: watchlist.color }}
                />
                <div className="flex flex-row items-center gap-2 flex-1 ml-2">
                  <WatchlistGroupIcon 
                    icon={watchlist.icon} 
                    className="w-4 h-4 text-foreground/70"
                    size={16}
                  />
                  <span className="text-xs font-medium text-foreground">{watchlist.name}</span>
                  <span className="text-xs font-diatype-mono text-muted-foreground">({watchlist.coinsCount})</span>
                </div>
                
                {/* Performance */}
                <div className={cn(
                  "text-xs font-diatype-mono mr-2",
                  watchlist.latestValue > 0 ? 'text-green-500' : 'text-red-500'
                )}>
                  {watchlist.latestValue > 0 ? '+' : ''}{watchlist.latestValue.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
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
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedWatchlists.size} watchlist{selectedWatchlists.size !== 1 ? 's' : ''} comparison
                </span>
                {watchlistSeriesData.length < selectedWatchlists.size && (
                  <span className="text-xs text-muted-foreground/60">(Loading...)</span>
                )}
              </div>
              
              {/* Time Scale Selector */}
              <TimeScaleSelector
                activeTimeScale={activeTimeScale}
                setActiveTimeScale={setActiveTimeScale}
              />
            </CardHeader>
            <CardContent className="pl-8">
              <div className="p-0 relative">
                {/* Show loading message if no chart data yet */}
                {watchlistSeriesData.length === 0 && selectedWatchlists.size > 0 ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center">
                      <Spinner size={24} className="mb-2" />
                      <p className="text-sm text-muted-foreground">Loading watchlist data...</p>
                    </div>
                  </div>
                ) : watchlistSeriesData.length === 0 ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">All watchlists will appear here automatically</p>
                    </div>
                  </div>
                ) : (
                  <div ref={chartContainerRef} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 