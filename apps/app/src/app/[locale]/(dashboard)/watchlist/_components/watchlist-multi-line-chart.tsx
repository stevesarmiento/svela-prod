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
  /** Scrub without overlay tooltip; show % labels beside each scrub dot instead. */
  scrubDotLabels?: boolean
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

/** Right gutter reserved for the y-axis tick + series labels. */
const AXIS_GUTTER = 56
/** Minimum vertical distance between right-axis labels before they nudge apart. */
const AXIS_LABEL_GAP = 14

const CHART_PADDING = { top: 12, right: AXIS_GUTTER, bottom: 20, left: 12 } as const

// Hoisted: Intl constructors are expensive, so build them once at module scope.
const TIME_AXIS_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})
const TIME_AXIS_DATE_FORMAT_WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatPctChange(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`
}

/**
 * Mirrors liveline's internal `computeRange` (12% margin, minimum span) so the
 * DOM y-axis / scrub-dot overlays line up with the canvas-rendered lines.
 */
function computeLivelineSeriesRange(
  data: LivelinePoint[],
  value: number,
): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const p of data) {
    if (p.value < min) min = p.value
    if (p.value > max) max = p.value
  }
  if (value < min) min = value
  if (value > max) max = value
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null

  const rawRange = max - min
  const minRange = rawRange * 0.1 || 0.4
  if (rawRange < minRange) {
    const mid = (min + max) / 2
    return { min: mid - minRange / 2, max: mid + minRange / 2 }
  }
  const margin = rawRange * 0.12
  return { min: min - margin, max: max + margin }
}

function getSeriesValueRange(series: LivelineSeries[]): { min: number; span: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const row of series) {
    const range = computeLivelineSeriesRange(row.data, row.value)
    if (!range) continue
    if (range.min < min) min = range.min
    if (range.max > max) max = range.max
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { min: 0, span: 1 }
  }

  return { min, span: max - min }
}

/** 1-2-5 progression tick step so axis values land on round numbers. */
function niceTickStep(span: number, maxTicks: number): number {
  const rough = span / Math.max(1, maxTicks)
  const pow = 10 ** Math.floor(Math.log10(rough))
  for (const multiple of [1, 2, 5]) {
    if (multiple * pow >= rough) return multiple * pow
  }
  return 10 * pow
}

function valueToPlotY(
  value: number,
  min: number,
  span: number,
  plotHeight: number,
): number {
  return CHART_PADDING.top + (1 - (value - min) / span) * plotHeight
}

interface ScrubDotLabel {
  id: string
  color: string
  x: number
  y: number
  text: string
}

interface TooltipSeriesRow {
  id: WatchlistSeries["id"]
  name: string
  color: string
  icon: WatchlistSeries["icon"]
  data: LivelinePoint[]
}

function buildLivelineSeries(
  watchlistSeriesData: WatchlistSeries[],
  hoveredWatchlist: WatchlistGroupId | null,
  hiddenWatchlists: Set<WatchlistGroupId>,
): LivelineSeries[] {
  const isHovering = hoveredWatchlist !== null && !hiddenWatchlists.has(hoveredWatchlist)

  const rows: LivelineSeries[] = []
  for (const row of watchlistSeriesData) {
    if (hiddenWatchlists.has(row.id)) continue

    const data: LivelinePoint[] = []
    for (const point of row.data) {
      const time = toUnixSeconds(point.time)
      if (time === null) continue
      if (!Number.isFinite(point.value)) continue
      data.push({ time, value: point.value })
    }

    const latestValue = data[data.length - 1]?.value
    if (typeof latestValue !== "number") continue

    const isDimmed = isHovering && hoveredWatchlist !== row.id
    const color = isDimmed ? addOpacityToColor(row.color, 0.25) : row.color

    rows.push({
      id: row.id,
      data,
      value: latestValue,
      color,
      // No `label`: latest values render on the right y-axis overlay instead.
    })
  }
  return rows
}

function buildTooltipSeries(
  watchlistSeriesData: WatchlistSeries[],
  hiddenWatchlists: Set<WatchlistGroupId>,
): TooltipSeriesRow[] {
  const rows: TooltipSeriesRow[] = []
  for (const row of watchlistSeriesData) {
    if (hiddenWatchlists.has(row.id)) continue

    const data: LivelinePoint[] = []
    for (const point of row.data) {
      const time = toUnixSeconds(point.time)
      if (time === null) continue
      if (!Number.isFinite(point.value)) continue
      data.push({ time, value: point.value })
    }

    if (data.length === 0) continue
    rows.push({
      id: row.id,
      name: row.name,
      color: row.color,
      icon: row.icon,
      data,
    })
  }
  return rows
}

function computeWindowSecs(livelineSeries: LivelineSeries[]): number {
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
}

// Matches the overview performance chart's time-axis formatting.
function makeTimeFormatter(livelineSeries: LivelineSeries[]): (epochSeconds: number) => string {
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

  const formatter = includeYear ? TIME_AXIS_DATE_FORMAT_WITH_YEAR : TIME_AXIS_DATE_FORMAT

  return (epochSeconds: number) => formatter.format(new Date(epochSeconds * 1000))
}

interface YAxisModel {
  ticks: Array<{ key: number; y: number; text: string }>
  seriesLabels: Array<{ id: string; color: string; y: number; text: string }>
}

/** Right y-axis: % ticks plus each series' latest value at its line endpoint. */
function computeYAxisModel(
  livelineSeries: LivelineSeries[],
  scrubValueRange: { min: number; span: number },
  chartHeightPx: number,
): YAxisModel | null {
  if (livelineSeries.length === 0) return null

  const { min, span } = scrubValueRange
  if (!(span > 0)) return null

  const plotHeight = chartHeightPx - CHART_PADDING.top - CHART_PADDING.bottom
  const minY = CHART_PADDING.top + AXIS_LABEL_GAP / 2
  const maxY = chartHeightPx - CHART_PADDING.bottom - AXIS_LABEL_GAP / 2

  const seriesLabels = livelineSeries
    .map((s) => ({
      id: s.id,
      color: s.color,
      y: valueToPlotY(s.value, min, span, plotHeight),
      text: formatPctChange(s.value),
    }))
    .sort((a, b) => a.y - b.y)

  // Collision pass: nudge overlapping labels apart, keep them inside the plot.
  for (let i = 0; i < seriesLabels.length; i++) {
    const label = seriesLabels[i]
    const prev = seriesLabels[i - 1]
    if (!label) continue
    label.y = Math.max(label.y, minY, prev ? prev.y + AXIS_LABEL_GAP : Number.NEGATIVE_INFINITY)
  }
  for (let i = seriesLabels.length - 1; i >= 0; i--) {
    const label = seriesLabels[i]
    const next = seriesLabels[i + 1]
    if (!label) continue
    label.y = Math.min(label.y, maxY, next ? next.y - AXIS_LABEL_GAP : Number.POSITIVE_INFINITY)
  }

  const step = niceTickStep(span, 5)
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  const ticks: Array<{ key: number; y: number; text: string }> = []
  for (let i = Math.ceil(min / step); i * step <= min + span + step * 1e-6; i++) {
    const raw = i * step
    const value = Math.abs(raw) < step * 1e-6 ? 0 : raw
    const y = valueToPlotY(value, min, span, plotHeight)
    if (y < minY || y > maxY) continue
    // Series labels win over ticks when they'd overlap.
    if (seriesLabels.some((label) => Math.abs(label.y - y) < AXIS_LABEL_GAP)) continue
    ticks.push({
      key: i,
      y,
      text: `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`,
    })
  }

  return { ticks, seriesLabels }
}

/**
 * DOM tooltip rendered into a portal element on document.body so it can float
 * above the canvas while scrubbing. Returns the Liveline hover handler.
 */
function useWatchlistChartTooltip({
  enabled,
  tooltipSeries,
  chartWrapperRef,
  isDarkMode,
}: {
  enabled: boolean
  tooltipSeries: TooltipSeriesRow[]
  chartWrapperRef: React.RefObject<HTMLDivElement | null>
  isDarkMode: boolean
}) {
  const tooltipClassName = useMemo(
    () =>
      `fixed overflow-hidden text-[11px] rounded-xl w-[220px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl transition-opacity duration-100 ease-out ${
        isDarkMode
          ? "text-white bg-zinc-900/95 border border-zinc-700/50"
          : "text-gray-900 bg-white/95 border border-gray-200/50"
      }`,
    [isDarkMode],
  )

  const tooltipElRef = useRef<HTMLDivElement | null>(null)
  const tooltipRootRef = useRef<ReturnType<typeof createRoot> | null>(null)
  const isTooltipVisibleRef = useRef(false)
  const lastTooltipTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const tooltipEl = document.createElement("div")
    const tooltipRoot = createRoot(tooltipEl)
    tooltipElRef.current = tooltipEl
    tooltipRootRef.current = tooltipRoot

    // className is applied by the dedicated sync effect below (it runs in the
    // same commit on mount), so this effect never reads tooltipClassName.
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
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    const tooltipEl = tooltipElRef.current
    if (tooltipEl) tooltipEl.className = tooltipClassName
  }, [tooltipClassName, enabled])

  const handleLivelineHover = useCallback(
    (hover: { time: number; value: number; x: number; y: number } | null) => {
      if (!enabled) return

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
    [tooltipSeries, enabled, chartWrapperRef],
  )

  return handleLivelineHover
}

function WatchlistChartLegend({
  series,
  hiddenWatchlists,
  hoveredWatchlist,
  isVertical,
  onHoverChange,
  onToggleVisibility,
  onShowAll,
}: {
  series: WatchlistSeries[]
  hiddenWatchlists: Set<WatchlistGroupId>
  hoveredWatchlist: WatchlistGroupId | null
  isVertical: boolean
  onHoverChange: (watchlistId: WatchlistGroupId | null) => void
  onToggleVisibility: (watchlistId: WatchlistGroupId) => void
  onShowAll: () => void
}) {
  return (
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
        {series.map((watchlist) => {
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
                onMouseEnter={() => onHoverChange(watchlist.id)}
                onMouseLeave={() => onHoverChange(null)}
              >
                {/* Whole row toggles chart visibility */}
                <button
                  type="button"
                  className="relative flex h-full min-w-0 flex-1 items-center gap-1"
                  onFocus={() => onHoverChange(watchlist.id)}
                  onBlur={() => onHoverChange(null)}
                  onClick={() => onToggleVisibility(watchlist.id)}
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
            onClick={onShowAll}
          >
            Show all ({hiddenWatchlists.size} hidden)
          </button>
        )}
      </div>
    </div>
  )
}

/** Right y-axis: % ticks + per-series latest values. */
function ChartRightAxisOverlay({ model }: { model: YAxisModel }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 z-20"
      style={{ width: AXIS_GUTTER }}
    >
      {model.ticks.map((tick) => (
        <span
          key={tick.key}
          className="absolute left-1.5 -translate-y-1/2 whitespace-nowrap font-berkeley-mono text-[10px] tabular-nums text-muted-foreground/60"
          style={{ top: tick.y }}
        >
          {tick.text}
        </span>
      ))}
      {model.seriesLabels.map((label) => (
        <span
          key={label.id}
          className="absolute left-1.5 -translate-y-1/2 whitespace-nowrap font-berkeley-mono text-[10px] font-medium tabular-nums [text-shadow:0_0_4px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,0.8)]"
          style={{ top: label.y, color: label.color }}
        >
          {label.text}
        </span>
      ))}
    </div>
  )
}

function ScrubDotLabelsOverlay({ labels }: { labels: ScrubDotLabel[] }) {
  return (
    <>
      {labels.map((label, index) => (
        <span
          key={label.id}
          className="pointer-events-none absolute whitespace-nowrap font-berkeley-mono text-[10px] tabular-nums [text-shadow:0_0_4px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,0.8)]"
          style={{
            left: label.x + (index % 2 === 0 ? 7 : -7),
            top: label.y,
            color: label.color,
            transform:
              index % 2 === 0
                ? "translateY(-50%)"
                : "translate(-100%, -50%)",
          }}
        >
          {label.text}
        </span>
      ))}
    </>
  )
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
    // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent, react-doctor/no-prop-callback-in-effect -- headless per-item hook bridge; child owns the subscription, content-diffed before notify
    onDataUpdate(group._id, seriesData)
  }, [group._id, seriesData, onDataUpdate])

  return null
}

export function WatchlistMultiLineChart({
  activeTimeScale,
  setActiveTimeScale,
  selectedWatchlists,
  layout = 'horizontal',
  showTimeScaleSelector = true,
  scrubDotLabels = false,
}: WatchlistMultiLineChartProps) {
  const isVertical = layout === 'vertical'
  const chartHeightPx = isVertical ? 300 : 400
  const useCustomTooltip = !scrubDotLabels
  const [hoveredWatchlist, setHoveredWatchlist] = useState<WatchlistGroupId | null>(null)
  const [scrubDotLabelRows, setScrubDotLabelRows] = useState<ScrubDotLabel[] | null>(null)
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

  const livelineSeries = useMemo(
    (): LivelineSeries[] =>
      buildLivelineSeries(watchlistSeriesData, hoveredWatchlist, hiddenWatchlists),
    [watchlistSeriesData, hoveredWatchlist, hiddenWatchlists],
  )

  const tooltipSeries = useMemo(() => {
    if (!useCustomTooltip) return []
    return buildTooltipSeries(watchlistSeriesData, hiddenWatchlists)
  }, [watchlistSeriesData, hiddenWatchlists, useCustomTooltip])

  const windowSecs = useMemo(() => computeWindowSecs(livelineSeries), [livelineSeries])

  const formatTime = useMemo(() => makeTimeFormatter(livelineSeries), [livelineSeries])

  const scrubValueRange = useMemo(
    () => getSeriesValueRange(livelineSeries),
    [livelineSeries],
  )

  const yAxisModel = useMemo(
    () => computeYAxisModel(livelineSeries, scrubValueRange, chartHeightPx),
    [livelineSeries, scrubValueRange, chartHeightPx],
  )

  const chartWrapperRef = useRef<HTMLDivElement | null>(null)

  const handleLivelineHover = useWatchlistChartTooltip({
    enabled: useCustomTooltip,
    tooltipSeries,
    chartWrapperRef,
    isDarkMode,
  })

  const handleScrubDotLabels = useCallback(
    (hover: { time: number; value: number; x: number; y: number } | null) => {
      if (!scrubDotLabels) return

      if (!hover) {
        setScrubDotLabelRows(null)
        return
      }

      const timeSec = Math.round(hover.time)
      const plotHeight =
        chartHeightPx - CHART_PADDING.top - CHART_PADDING.bottom
      const labels: ScrubDotLabel[] = []

      for (const series of livelineSeries) {
        const closest = findClosestPoint(series.data, timeSec)
        if (!closest) continue

        labels.push({
          id: series.id,
          color: series.color,
          x: hover.x,
          y: valueToPlotY(
            closest.value,
            scrubValueRange.min,
            scrubValueRange.span,
            plotHeight,
          ),
          text: formatPctChange(closest.value),
        })
      }

      setScrubDotLabelRows(labels.length > 0 ? labels : null)
    },
    [scrubDotLabels, livelineSeries, scrubValueRange, chartHeightPx],
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
      <WatchlistChartLegend
        series={watchlistSeriesData}
        hiddenWatchlists={hiddenWatchlists}
        hoveredWatchlist={hoveredWatchlist}
        isVertical={isVertical}
        onHoverChange={setHoveredWatchlist}
        onToggleVisibility={toggleWatchlistVisibility}
        onShowAll={() => setHiddenWatchlists(new Set())}
      />

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
                  <div
                    ref={chartWrapperRef}
                    className={cn("relative w-full", isVertical ? "h-[300px]" : "h-[400px]")}
                  >
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
                      onHover={scrubDotLabels ? handleScrubDotLabels : handleLivelineHover}
                      formatTime={formatTime}
                      formatValue={formatPctChange}
                      padding={CHART_PADDING}
                      className="size-full"
                    />
                    {/* Right y-axis: % ticks + per-series latest values. */}
                    {yAxisModel && <ChartRightAxisOverlay model={yAxisModel} />}
                    {scrubDotLabels && scrubDotLabelRows && (
                      <ScrubDotLabelsOverlay labels={scrubDotLabelRows} />
                    )}
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
