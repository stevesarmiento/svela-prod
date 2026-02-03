'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import { Spinner } from "@v1/ui/spinner"
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { WatchlistGroupIcon } from '@/components/watchlist-group-icon'
import { useWatchlistGroups } from '@/lib/convex-hooks'
import { useWatchlistByGroup } from '@/lib/convex-hooks'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import { useCoinGeckoWatchlistAggregateChartIsolated } from '@/hooks/use-coingecko-watchlist-aggregate-chart-isolated'
import type { WatchlistGroup } from './watchlist-context'
import { WatchlistMultiLineTimeScaleSelector } from "./watchlist-multi-line-time-scale-selector"
import type { WatchlistSeries } from "./watchlist-multi-line.types"
import { useWatchlistMultiLineLightweightChart } from "./use-watchlist-multi-line-lightweight-chart"

type WatchlistGroupId = WatchlistGroup["_id"]

interface WatchlistMultiLineChartProps {
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
  selectedWatchlists: Set<WatchlistGroupId>
  onSelectWatchlist?: (watchlistId: WatchlistGroupId) => void
}

function getBucketMsFromTimeScale(timeScale: string): number {
  switch (timeScale) {
    case "1d":
      return 15 * 60 * 1000
    case "7d":
      return 2 * 60 * 60 * 1000
    case "30d":
      return 12 * 60 * 60 * 1000
    case "max":
      return 24 * 60 * 60 * 1000
    default:
      return 2 * 60 * 60 * 1000
  }
}

function floorToBucket(timeMs: number, bucketMs: number): number {
  return Math.floor(timeMs / bucketMs) * bucketMs
}

function useWatchlistSeriesData(
  group: WatchlistGroup,
  activeTimeScale: string,
  rangeEndTimeMs: number,
): WatchlistSeries | null {
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
    timeScale: activeTimeScale,
    rangeEndTimeMs,
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
  rangeEndTimeMs,
  onDataUpdate 
}: { 
  group: WatchlistGroup
  activeTimeScale: string
  rangeEndTimeMs: number
  onDataUpdate: (groupId: WatchlistGroupId, data: WatchlistSeries | null) => void
}) {
  // Use our custom hook to get series data
  const seriesData = useWatchlistSeriesData(group, activeTimeScale, rangeEndTimeMs)
  
  // Update parent when data changes
  React.useEffect(() => {
    onDataUpdate(group._id, seriesData)
  }, [group._id, seriesData, onDataUpdate])
  
  return null
}

export function WatchlistMultiLineChart({ 
  activeTimeScale, 
  setActiveTimeScale,
  selectedWatchlists,
  onSelectWatchlist
}: WatchlistMultiLineChartProps) {
  const [hoveredWatchlist, setHoveredWatchlist] = useState<WatchlistGroupId | null>(null)
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

  // Compute a single shared range end so ALL watchlists end together.
  const rangeEndTimeMs = useMemo(() => {
    const bucketMs = getBucketMsFromTimeScale(activeTimeScale)
    return floorToBucket(Date.now(), bucketMs)
  }, [activeTimeScale])

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

  const { chartContainerRef, lineSeriesMapRef } = useWatchlistMultiLineLightweightChart({
    series: watchlistSeriesData,
    isDarkMode,
    height: 400,
  })

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
  }, [hoveredWatchlist, watchlistSeriesData])

  return (
    <div className="grid grid-cols-12 gap-0 rounded-[16px] dark:bg-zinc-950/50 bg-zinc-100/50 border dark:border-zinc-800/20 border-zinc-800/10 overflow-hidden p-1">
      {/* ✅ IMPROVED: Data providers using custom hook */}
      {activeWatchlists.map(group => (
        <WatchlistSeriesProvider
          key={group._id}
          group={group}
          activeTimeScale={activeTimeScale}
          rangeEndTimeMs={rangeEndTimeMs}
          onDataUpdate={handleDataUpdate}
        />
      ))}
      
      {/* Legend */}
      <div className="flex flex-col col-span-3 p-6 pt-6 space-y-2">           
        <div className="flex flex-col gap-2 space-y-3">
          {latestValues.map((watchlist) => (
            <div key={watchlist.id}>
              <button
                type="button"
                className={cn(
                  "relative -m-2 flex w-full items-center gap-2 overflow-hidden rounded-lg p-0 text-left group hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  hoveredWatchlist && hoveredWatchlist !== watchlist.id ? "opacity-40" : "opacity-100",
                  hoveredWatchlist === watchlist.id ? "bg-foreground/5" : ""
                )}
                style={{ backgroundColor: addOpacityToColor(watchlist.color, 0.1) }}
                onMouseEnter={() => setHoveredWatchlist(watchlist.id)}
                onMouseLeave={() => setHoveredWatchlist(null)}
                onFocus={() => setHoveredWatchlist(watchlist.id)}
                onBlur={() => setHoveredWatchlist(null)}
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
              </button>
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
              <WatchlistMultiLineTimeScaleSelector
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