'use client'

import React, { useEffect, useRef, useMemo, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineData,
  Time,
  LastPriceAnimationMode,
  LineSeries,
  ISeriesApi,
} from 'lightweight-charts'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { createRoot } from "react-dom/client"
import { cn } from "@v1/ui/cn"
import { Spinner } from "@v1/ui/spinner"
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { WatchlistGroupIcon } from '@/components/watchlist-group-icon'
import { useWatchlistGroups } from '@v1/convex/hooks'
import { useWatchlistByGroup } from '@v1/convex/hooks'
import { useWatchlistCoins } from '@/hooks/use-watchlist-coins'
import { useWatchlistAggregateChart } from '@/hooks/use-watchlist-aggregate-chart'

interface WatchlistMultiLineChartProps {
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
  selectedWatchlists: Set<string>
  onSelectWatchlist?: (watchlistId: string) => void
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
  id: string
  name: string
  icon?: string
  color: string
  data: PriceDataPoint[]
  coinsCount: number
}

interface LineSeriesData {
  series: ISeriesApi<"Line">
  watchlistData: WatchlistSeries
}

interface WatchlistGroup {
  _id: string
  name: string
  icon?: string
  color?: string
}

// Component to fetch data for a single watchlist
function WatchlistDataFetcher({ 
  group, 
  timeScale, 
  onDataReady 
}: { 
  group: WatchlistGroup
  timeScale: string
  onDataReady: (data: WatchlistSeries | null) => void 
}) {
  // Get watchlist coins for this group
  const groupWatchlist = useWatchlistByGroup(group._id)
  
  // Transform to array of coin IDs
  const coinIds = useMemo(() => {
    if (!groupWatchlist || !Array.isArray(groupWatchlist)) return []
    return groupWatchlist.map(item => Number(item.coinId))
  }, [groupWatchlist])
  
  // Get coin data
  const { data: coins } = useWatchlistCoins(coinIds)
  
  // Get aggregate chart data
  const { aggregateData } = useWatchlistAggregateChart({
    coins: coins || [],
    timeScale
  })

  // Update parent when data changes
  useEffect(() => {
    if (!coins?.length || !aggregateData?.length) {
      onDataReady(null)
      return
    }

    const watchlistSeries: WatchlistSeries = {
      id: group._id,
      name: group.name,
      icon: group.icon,
      color: '', // Will be set by parent
      data: aggregateData,
      coinsCount: coins.length
    }

    onDataReady(watchlistSeries)
  }, [group._id, group.name, group.icon, coins, aggregateData, onDataReady])

  return null // This component doesn't render anything
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
        <div className="mb-3 text-[11px] text-zinc-400 font-medium">
          {new Date(timestamp).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric'
          })}
        </div>
        <div className="w-full h-[1px] mb-3 bg-zinc-700/50 scale-125" />
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
                  className="w-3 h-3 text-zinc-400"
                  size={12}
                />
                <span className="text-[11px] text-zinc-400 truncate max-w-[120px]">
                  {watchlist.name}
                </span>
              </div>
              <span className="text-[11px] font-mono text-white font-bold">
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
    { value: "7d", label: "1D" },
    { value: "30d", label: "1W" },
    { value: "max", label: "1Y" },
    { value: "2y", label: "2Y" },
  ]

  return (
    <div className="flex gap-1 bg-zinc-950/10 backdrop-blur-xl border border-zinc-800/30 rounded-[12px] p-1">
      {scales.map((scale) => (
        <button
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "px-2 py-1 text-xs rounded-lg",
            activeTimeScale === scale.value
              ? "bg-zinc-800/50 border border-zinc-800/50  shadow-md shadow-zinc-950/50 text-white"
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
  const [hoveredWatchlist, setHoveredWatchlist] = useState<string | null>(null)
  const lineSeriesMapRef = useRef<Map<string, LineSeriesData>>(new Map())
  const [watchlistData, setWatchlistData] = useState<Map<string, WatchlistSeries>>(new Map())
  
  const watchlistGroupsData = useWatchlistGroups()
  
  // Filter to only selected watchlists
  const activeWatchlists = useMemo(() => {
    const groups = watchlistGroupsData || []
    return groups.filter(group => selectedWatchlists.has(group._id))
  }, [watchlistGroupsData, selectedWatchlists])

  // Handle data updates from individual fetchers
  const handleDataUpdate = useMemo(() => {
    const handlers = new Map<string, (data: WatchlistSeries | null) => void>()
    
    activeWatchlists.forEach(group => {
      handlers.set(group._id, (data: WatchlistSeries | null) => {
        setWatchlistData(prev => {
          const newMap = new Map(prev)
          if (data) {
            newMap.set(group._id, data)
          } else {
            newMap.delete(group._id)
          }
          return newMap
        })
      })
    })
    
    return handlers
  }, [activeWatchlists])

  // Create final series data with colors
  const watchlistSeriesData = useMemo((): WatchlistSeries[] => {
    const seriesArray = Array.from(watchlistData.values())
    if (!seriesArray.length) return []

    const colors = generatePastelColors(seriesArray.length)
    
    return seriesArray.map((series, index) => ({
      ...series,
      color: colors[index] || `hsl(${Math.random() * 360}, 40%, 75%)`
    }))
  }, [watchlistData])

  const latestValues = useMemo(() => {
    return watchlistSeriesData.map(series => ({
      ...series,
      latestValue: series.data[series.data.length - 1]?.value || 0
    }))
  }, [watchlistSeriesData])

  useEffect(() => {
    if (!chartContainerRef.current || !watchlistSeriesData.length) return

    const chart = createChart(chartContainerRef.current, {
      handleScale: false,
      handleScroll: false,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#ffffff50",
        attributionLogo: false,
      },
      grid: {
        vertLines: { 
          visible: false,
          color: "#e5e7eb0",
          style: LineStyle.Dotted,
        },
        horzLines: { 
          visible: false,
          color: "#f5f5f50",
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
          color: "#d1d5db40",
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
    const lineSeriesMap = new Map()
    
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

    window.addEventListener("resize", handleResize)
    handleResize()

    // Add tooltip
    const tooltipEl = document.createElement("div")
    const tooltipRoot = createRoot(tooltipEl)
    tooltipEl.className = "fixed hidden overflow-hidden text-[11px] text-white rounded-xl w-[220px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl bg-zinc-900/95 border border-zinc-700/50 transition-all duration-100 ease-in-out"
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
        tooltipEl.style.display = "none"
        return
      }

      tooltipEl.style.display = "block"
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
  }, [watchlistSeriesData])

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
    <div className="grid grid-cols-12 gap-0 rounded-[16px] bg-zinc-950/50 border border-zinc-800/20 overflow-hidden p-1">
      {/* Data fetchers - render components that fetch data for each watchlist */}
      {activeWatchlists.map(group => (
        <WatchlistDataFetcher
          key={group._id}
          group={group}
          timeScale={activeTimeScale}
          onDataReady={handleDataUpdate.get(group._id) || (() => {})}
        />
      ))}
      
      {/* Legend */}
      <div className="flex flex-col col-span-3 p-6 pt-6 space-y-2">           
        <div className="flex flex-col gap-2 space-y-3">
          {latestValues.map((watchlist) => (
            <div key={watchlist.id}>
              <div 
                className={cn(
                  "flex overflow-hidden items-center gap-2 cursor-pointer transition-opacity duration-200 rounded-lg p-0 -m-2 relative group hover:bg-white/10",
                  hoveredWatchlist && hoveredWatchlist !== watchlist.id ? "opacity-40" : "opacity-100",
                  hoveredWatchlist === watchlist.id ? "bg-white/5" : ""
                )}
                style={{ backgroundColor: addOpacityToColor(watchlist.color, 0.05) }}
                onMouseEnter={() => setHoveredWatchlist(watchlist.id)}
                onMouseLeave={() => setHoveredWatchlist(null)}
                onClick={() => onSelectWatchlist?.(watchlist.id)}
              >
                <div 
                  className="w-1 h-9 rounded-full transition-transform duration-200"
                  style={{ backgroundColor: watchlist.color }}
                />
                <div className="flex flex-row items-center gap-2 flex-1 ml-2">
                  <WatchlistGroupIcon 
                    icon={watchlist.icon} 
                    className="w-4 h-4 text-zinc-300"
                    size={16}
                  />
                  <span className="text-xs font-medium">{watchlist.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">({watchlist.coinsCount})</span>
                </div>
                
                {/* Performance */}
                <div className={cn(
                  "text-xs font-mono mr-2",
                  watchlist.latestValue > 0 ? 'text-green-500' : 'text-red-500'
                )}>
                  {watchlist.latestValue > 0 ? '+' : ''}{watchlist.latestValue.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="col-span-9 border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
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