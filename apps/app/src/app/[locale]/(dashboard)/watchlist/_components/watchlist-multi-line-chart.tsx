'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from "react-dom/client"
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import { Eye, EyeOff } from "lucide-react"
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { adjustOklch } from '@/lib/oklch'
import { WatchlistGroupIcon } from '@/components/watchlist-group-icon'
import { useWatchlistByGroup } from '@/lib/convex-hooks'
import { useCoinGeckoWatchlistCoins } from '@/hooks/use-coingecko-watchlist-coins'
import { useCoinGeckoWatchlistAggregateChartIsolated } from '@/hooks/use-coingecko-watchlist-aggregate-chart-isolated'
import { ChartLoadingSkeleton } from "@/components/charts/chart-loading-skeleton"
import { useWatchlist, type WatchlistGroup } from './watchlist-context'
import { WatchlistMultiLineTimeScaleSelector } from "./watchlist-multi-line-time-scale-selector"
import type { TooltipWatchlistDataRow, WatchlistSeries } from "./watchlist-multi-line.types"
import { WatchlistMultiLineTooltipContent } from "./watchlist-multi-line-tooltip"
import { Liveline } from "liveline"
import type { LivelinePoint, LivelineSeries } from "liveline"
import type { Time as LightweightTime } from "lightweight-charts"

type WatchlistGroupId = WatchlistGroup["_id"]

interface WatchlistMultiLineChartProps {
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
  selectedWatchlists: Set<WatchlistGroupId>
  onSelectWatchlist?: (watchlistId: WatchlistGroupId) => void
  /**
   * 'horizontal' (default): legend sidebar left, chart right (12-col grid).
   * 'vertical': chart on top, legend stacked below — for narrow columns.
   */
  layout?: 'horizontal' | 'vertical'
  /** Hide the in-card selector when the page renders its own (e.g. comparison header). */
  showTimeScaleSelector?: boolean
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
  const { data: rawCoins } = useCoinGeckoWatchlistCoins(coinIds)

  // Stable reference while loading: `rawCoins || []` inline would create a new
  // array every render and re-trigger the aggregate hook's layout effect.
  const coins = useMemo(() => rawCoins ?? [], [rawCoins])

  // Get aggregate chart data using isolated CoinGecko hook
  const { aggregateData } = useCoinGeckoWatchlistAggregateChartIsolated({
    coins,
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

/**
 * Content equality for series payloads. `seriesData` gets a new object identity
 * whenever the coins list refreshes (every quote refetch / window focus) even
 * when the chart data itself is unchanged — compare by content so we only
 * propagate meaningful updates.
 */
function isSameWatchlistSeries(
  a: WatchlistSeries | null | undefined,
  b: WatchlistSeries | null | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.icon === b.icon &&
    a.coinsCount === b.coinsCount &&
    // `data` comes from the aggregate hook's state, which already bails out on
    // deep-equal recomputes — reference equality is a reliable content check.
    a.data === b.data
  )
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

  // Track the last payload we sent so unstable identities (new object, same
  // content) don't re-notify the parent — that setState → render → new
  // identity cycle is what previously spun "maximum update depth exceeded".
  const lastSentRef = useRef<WatchlistSeries | null | undefined>(undefined)

  // Update parent when data changes
  React.useEffect(() => {
    const prev = lastSentRef.current
    if (prev !== undefined && isSameWatchlistSeries(prev, seriesData)) return
    lastSentRef.current = seriesData
    onDataUpdate(group._id, seriesData)
  }, [group._id, seriesData, onDataUpdate])

  return null
}

export function WatchlistMultiLineChart({
  activeTimeScale,
  setActiveTimeScale,
  selectedWatchlists,
  layout = 'horizontal',
  showTimeScaleSelector = true
}: WatchlistMultiLineChartProps) {
  const isVertical = layout === 'vertical'
  const [hoveredWatchlist, setHoveredWatchlist] = useState<WatchlistGroupId | null>(null)
  const [hiddenWatchlists, setHiddenWatchlists] = useState<Set<WatchlistGroupId>>(new Set())
  const [watchlistData, setWatchlistData] = useState<Map<WatchlistGroupId, WatchlistSeries>>(new Map())
  const { watchlistGroups: watchlistGroupsData } = useWatchlist()

  const isDarkMode = true

  // Filter to only selected watchlists
  const activeWatchlists = useMemo(() => {
    return watchlistGroupsData.filter(group => selectedWatchlists.has(group._id))
  }, [watchlistGroupsData, selectedWatchlists])

  // Compute a single shared range end so ALL watchlists end together.
  const rangeEndTimeMs = useMemo(() => {
    const bucketMs = getBucketMsFromTimeScale(activeTimeScale)
    return floorToBucket(Date.now(), bucketMs)
  }, [activeTimeScale])

  const toggleWatchlistVisibility = useCallback((watchlistId: WatchlistGroupId) => {
    setHiddenWatchlists(prev => {
      const next = new Set(prev)
      if (next.has(watchlistId)) {
        next.delete(watchlistId)
      } else {
        next.add(watchlistId)
      }
      return next
    })
  }, [])

  const handleDataUpdate = React.useCallback((groupId: WatchlistGroupId, data: WatchlistSeries | null) => {
    setWatchlistData(prev => {
      // Bail out (return `prev`) when nothing actually changed: React skips
      // the re-render entirely, which hard-stops any update loop driven by
      // unstable upstream identities (e.g. focus-refetch storms).
      if (!data) {
        if (!prev.has(groupId)) return prev
        const newMap = new Map(prev)
        newMap.delete(groupId)
        return newMap
      }

      if (isSameWatchlistSeries(prev.get(groupId), data)) return prev

      const newMap = new Map(prev)
      newMap.set(groupId, data)
      return newMap
    })
  }, [])

  // Create final series data with colors
  const watchlistSeriesData = useMemo((): WatchlistSeries[] => {
    const seriesArray = Array.from(watchlistData.values())
    if (!seriesArray.length) return []

    const colors = generatePastelColors(seriesArray.length)
    
    return seriesArray.map((series, index) => {
      const baseColor = colors[index] || `oklch(0.8 0.06 ${Math.round(Math.random() * 360)})`
      // For light mode, make colors darker and more saturated
      // (was hsl s+20 / l-40; equivalent perceptual shift in OKLCH).
      const themeAwareColor = isDarkMode
        ? baseColor
        : adjustOklch(baseColor, { dl: -0.4, dc: 0.05 })
      
      return {
        ...series,
        color: themeAwareColor
      }
    })
  }, [watchlistData, isDarkMode])

  const livelineSeries = useMemo((): LivelineSeries[] => {
    const isHovering = hoveredWatchlist !== null && !hiddenWatchlists.has(hoveredWatchlist)

    return watchlistSeriesData
      .filter(row => !hiddenWatchlists.has(row.id))
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

        const isDimmed = isHovering && hoveredWatchlist !== row.id
        const color = isDimmed ? addOpacityToColor(row.color, 0.25) : row.color
        const latestPctText = `${latestValue > 0 ? "+" : ""}${latestValue.toFixed(2)}%`

        return {
          id: row.id,
          data,
          value: latestValue,
          color,
          label: latestPctText,
        }
      })
      .filter((row): row is LivelineSeries => row !== null)
  }, [watchlistSeriesData, hoveredWatchlist, hiddenWatchlists])

  const tooltipSeries = useMemo(() => {
    return watchlistSeriesData
      .filter(row => !hiddenWatchlists.has(row.id))
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
          color: row.color,
          icon: row.icon,
          data,
        }
      })
      .filter((row) => row.data.length > 0)
  }, [watchlistSeriesData, hiddenWatchlists])

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

  // Matches the overview performance chart's time-axis formatting.
  const formatTime = useMemo(() => {
    let first: number | null = null
    let last: number | null = null

    for (const s of livelineSeries) {
      const f = s.data[0]?.time
      const l = s.data[s.data.length - 1]?.time
      if (typeof f === "number" && (first === null || f < first)) first = f
      if (typeof l === "number" && (last === null || l > last)) last = l
    }

    const spanSec = first !== null && last !== null ? last - first : 0
    const includeYear = spanSec > 180 * 24 * 60 * 60

    return (epochSeconds: number) => {
      const dt = new Date(epochSeconds * 1000)
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        ...(includeYear ? { year: "numeric" as const } : {}),
      }).format(dt)
    }
  }, [livelineSeries])

  const tooltipClassName = useMemo(
    () =>
      `fixed overflow-hidden text-[11px] rounded-xl w-[220px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl transition-opacity duration-100 ease-out ${
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

      const rows: TooltipWatchlistDataRow[] = []
      for (const row of tooltipSeries) {
        const closest = findClosestPoint(row.data, timeSec)
        rows.push({
          name: row.name,
          color: row.color,
          value: closest?.value ?? null,
          icon: row.icon,
        })
      }

      const hasAnyValue = rows.some((row) => row.value !== null)
      if (!hasAnyValue) {
        if (isTooltipVisibleRef.current) {
          tooltipEl.style.opacity = "0"
          tooltipEl.style.visibility = "hidden"
          isTooltipVisibleRef.current = false
          lastTooltipTimeRef.current = null
        }
        return
      }

      rows.sort((a, b) => a.name.localeCompare(b.name))

      if (!isTooltipVisibleRef.current) {
        tooltipEl.style.opacity = "1"
        tooltipEl.style.visibility = "visible"
        isTooltipVisibleRef.current = true
      }

      if (lastTooltipTimeRef.current !== timeSec) {
        lastTooltipTimeRef.current = timeSec
        tooltipRoot.render(
          <WatchlistMultiLineTooltipContent watchlistData={rows} timestamp={timestampMs} />,
        )
      }

      const chartRect = container.getBoundingClientRect()
      const tooltipWidth = tooltipEl.offsetWidth || 220
      const tooltipHeight = tooltipEl.offsetHeight || 120

      // Pin tooltip to a stable position (top-right of chart) so it doesn't jump while scrubbing.
      let left = chartRect.right - tooltipWidth - 12
      let top = chartRect.top + 12

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

  return (
    <div
      className={cn(
        isVertical ? "flex flex-col" : "grid grid-cols-12",
      )}
    >
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
      <div
        className={cn(
          "flex flex-col space-y-2",
          isVertical ? "order-2 p-3" : "col-span-3 p-4",
        )}
      >
        <div
          className={cn(
            isVertical ? "grid grid-cols-3 gap-1.5" : "flex flex-col gap-1",
          )}
        >
          {watchlistSeriesData.map((watchlist) => {
            const isHidden = hiddenWatchlists.has(watchlist.id)
            return (
              <div key={watchlist.id}>
                <div
                  className={cn(
                    "relative flex h-8 w-full flex-1 items-center gap-1 overflow-hidden border border-zinc-200 dark:border-zinc-800/70 rounded-lg",
                    hoveredWatchlist && hoveredWatchlist !== watchlist.id ? "opacity-40" : "opacity-100",
                    hoveredWatchlist === watchlist.id ? "bg-foreground/5" : "",
                    isHidden ? "opacity-40" : ""
                  )}
                  style={{ backgroundColor: addOpacityToColor(watchlist.color, isHidden ? 0.03 : 0.1) }}
                  onMouseEnter={() => setHoveredWatchlist(watchlist.id)}
                  onMouseLeave={() => setHoveredWatchlist(null)}
                >
                  {/* Whole row toggles chart visibility */}
                  <button
                    type="button"
                    className="relative flex h-full min-w-0 flex-1 items-center gap-1"
                    onFocus={() => setHoveredWatchlist(watchlist.id)}
                    onBlur={() => setHoveredWatchlist(null)}
                    onClick={() => toggleWatchlistVisibility(watchlist.id)}
                    title={isHidden ? "Show on chart" : "Hide from chart"}
                    aria-label={isHidden ? `Show ${watchlist.name} on chart` : `Hide ${watchlist.name} from chart`}
                    aria-pressed={isHidden}
                  >
                    <div
                      className={cn(
                        "absolute left-1.5 h-3 w-1.5 rounded-full border border-black",
                        isHidden && "opacity-30"
                      )}
                      style={{ backgroundColor: watchlist.color }}
                    />

                    <div className="flex flex-row items-center gap-2 flex-1 min-w-0 ml-6">
                      <WatchlistGroupIcon
                        icon={watchlist.icon}
                        className="w-4 h-4 text-foreground/70"
                        size={16}
                      />
                      <span className={cn(
                        "text-xs font-medium truncate",
                        isHidden ? "text-muted-foreground" : "text-foreground"
                      )}>{watchlist.name}</span>
                    </div>

                    {/* Visibility indicator */}
                    <span className="flex h-full shrink-0 items-center px-2 text-muted-foreground/60">
                      {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
          {hiddenWatchlists.size > 0 && (
            <button
              type="button"
              className={cn(
                "self-start text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1",
                isVertical && "col-span-3",
              )}
              onClick={() => setHiddenWatchlists(new Set())}
            >
              Show all ({hiddenWatchlists.size} hidden)
            </button>
          )}
        </div>
      </div>

      <div
        className={cn(
          isVertical ? "order-1" : "col-span-9",
        )}
      >
        {/* Chart Content */}
        <div className="p-0 relative">
          <div
            className="pointer-events-none absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
                maskImage:
                  "radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader
              className={cn(
                "flex flex-row items-center justify-between",
                isVertical && "flex-wrap gap-2 p-4",
              )}
            >              
              {/* Time Scale Selector */}
              {showTimeScaleSelector && (
                <WatchlistMultiLineTimeScaleSelector
                  activeTimeScale={activeTimeScale}
                  setActiveTimeScale={setActiveTimeScale}
                />
              )}
            </CardHeader>
            <CardContent className={cn(isVertical ? "p-2 pt-0" : "pl-8")}>
              <div className="p-0 relative">
                {/* Show loading message if no chart data yet */}
                {watchlistSeriesData.length === 0 && selectedWatchlists.size > 0 ? (
                  <div className={cn("relative", isVertical ? "h-[300px]" : "h-[400px]")}>
                    <ChartLoadingSkeleton
                      height={isVertical ? 300 : 400}
                      lines={Math.max(1, selectedWatchlists.size)}
                      className="opacity-80"
                    />
                  </div>
                ) : watchlistSeriesData.length === 0 ? (
                  <div className={cn("flex items-center justify-center", isVertical ? "h-[300px]" : "h-[400px]")}>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">All watchlists will appear here automatically</p>
                    </div>
                  </div>
                ) : (
                  <div ref={chartWrapperRef} className={cn("w-full", isVertical ? "h-[300px]" : "h-[400px]")}>
                    <Liveline
                      data={[]}
                      value={0}
                      series={livelineSeries}
                      theme={isDarkMode ? "dark" : "light"}
                      color={isDarkMode ? "oklch(0.9276 0.0058 264.53)" : "oklch(0.2101 0.0318 264.66)"}
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
                      formatTime={formatTime}
                      formatValue={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}
                      padding={{ top: 12, right: 20, bottom: 20, left: 12 }}
                      className="size-full"
                    />
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
