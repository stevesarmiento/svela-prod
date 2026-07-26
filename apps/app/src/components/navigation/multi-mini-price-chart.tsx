'use client'

import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@v1/ui/cn"
import { generatePastelColors } from "@/lib/chart-colors"
import { CHART_COLOR_PARSERS } from "@/lib/oklch"
import { loadLightweightCharts } from "@/lib/load-lightweight-charts"
import type {
  IChartApi,
  ISeriesApi,
  LineData,
  MouseEventParams,
  Time,
} from "lightweight-charts"

/**
 * Multi-line variant of the single-analysis MiniPriceChart for the compare
 * dialog's sidebar: every selected token's price over the last 7 days,
 * normalized to % change from the window start (prices live on wildly
 * different scales), colored with the same palette as the main comparison
 * chart. No volume — the report covers it.
 */

export interface MultiMiniChartToken {
  id: string
  symbol: string
  series: Array<{ time: unknown; value: number }>
}

const WINDOW_SECONDS = 7 * 24 * 60 * 60

interface NormalizedLine {
  id: string
  symbol: string
  color: string
  changePct: number
  points: Array<{ time: Time; value: number }>
}

function bucketSeries(
  series: Array<{ time: unknown; value: number }>,
  bucketSeconds: number,
): Map<number, number> {
  const byBucket = new Map<number, number>()
  for (const p of series) {
    const t = Number(p.time)
    if (!Number.isFinite(t) || !Number.isFinite(p.value) || p.value <= 0) continue
    // Last value per bucket wins (series is chronological).
    byBucket.set(Math.floor(t / bucketSeconds), p.value)
  }
  return byBucket
}

/**
 * Percentage moves on a COMMON timeline, matching the watchlist comparison
 * chart's semantics: every token's series is bucketed to the same grid, only
 * timestamps present for ALL tokens are kept, and each line is rebased to 0%
 * at the first shared bucket. This is what makes the lines start together and
 * end on the same final bar — per-token cache windows can otherwise be offset
 * by hours.
 */
function buildAlignedLines(
  tokens: MultiMiniChartToken[],
  bucketSeconds: number,
): NormalizedLine[] {
  if (tokens.length === 0) return []
  const bucketed = tokens.map((t) => bucketSeries(t.series, bucketSeconds))

  let commonKeys = [...(bucketed[0]?.keys() ?? [])]
  for (let i = 1; i < bucketed.length; i++) {
    commonKeys = commonKeys.filter((k) => bucketed[i]!.has(k))
  }
  commonKeys.sort((a, b) => a - b)
  if (commonKeys.length < 2) return []

  // Trim to the trailing window, measured from the last COMMON bucket.
  const lastKey = commonKeys[commonKeys.length - 1]!
  const windowBuckets = Math.floor(WINDOW_SECONDS / bucketSeconds)
  const windowKeys = commonKeys.filter((k) => k > lastKey - windowBuckets)
  if (windowKeys.length < 2) return []

  const colors = generatePastelColors(tokens.length)

  return tokens.flatMap((token, index) => {
    const values = bucketed[index]!
    const base = values.get(windowKeys[0]!)
    if (base === undefined || base <= 0) return []

    const points = windowKeys.map((k) => ({
      time: (k * bucketSeconds) as Time,
      value: (values.get(k)! / base - 1) * 100,
    }))

    return [
      {
        id: token.id,
        symbol: token.symbol.toUpperCase(),
        color: colors[index] || "oklch(0.8 0.06 200)",
        changePct: points[points.length - 1]!.value,
        points,
      },
    ]
  })
}

function buildNormalizedLines(tokens: MultiMiniChartToken[]): NormalizedLine[] {
  // 4h buckets match the underlying chart data; if the tokens' cache windows
  // barely overlap at that granularity, coarsen to daily buckets.
  const fine = buildAlignedLines(tokens, 4 * 60 * 60)
  if (fine.length === tokens.length && (fine[0]?.points.length ?? 0) >= 8) {
    return fine
  }
  const daily = buildAlignedLines(tokens, 24 * 60 * 60)
  return daily.length === tokens.length ? daily : fine
}

export function MultiMiniPriceChart({ tokens }: { tokens: MultiMiniChartToken[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  // Per-line % at the scrubbed time (keyed by token id); null = not scrubbing,
  // legend falls back to each line's window change.
  const [hoverPcts, setHoverPcts] = useState<Record<string, number> | null>(null)

  const lines = useMemo(() => buildNormalizedLines(tokens), [tokens])

  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup -- observer creation is isCancelled-guarded post-await; returned teardown disconnects it on every path
  useEffect(() => {
    if (!chartContainerRef.current || lines.length === 0) return

    let isCancelled = false
    let chart: IChartApi | null = null
    let resizeObserver: ResizeObserver | null = null
    let crosshairMoveHandler: ((param: MouseEventParams<Time>) => void) | null = null

    setHoverPcts(null)

    try {
      chartRef.current?.remove()
    } catch {
      // noop
    }
    chartRef.current = null

    void (async () => {
      const lw = await loadLightweightCharts()
      if (isCancelled || !chartContainerRef.current) return

      const { createChart, ColorType, CrosshairMode, LineSeries, LineStyle } = lw

      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "oklch(0.7137 0.0192 261.32)",
          fontSize: 10,
          attributionLogo: false,
          colorParsers: CHART_COLOR_PARSERS,
        },
        width: chartContainerRef.current.clientWidth,
        height: 120,
        rightPriceScale: { visible: false },
        leftPriceScale: { visible: false },
        timeScale: { visible: false, borderVisible: false },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            width: 1,
            color: "oklch(0.3729 0.0306 259.73)",
            style: LineStyle.Solid,
            visible: true,
          },
          horzLine: { visible: false },
        },
        handleScroll: false,
        handleScale: false,
      })

      const seriesHandles: Array<{ id: string; series: ISeriesApi<"Line"> }> = []
      for (const line of lines) {
        const series = chart.addSeries(LineSeries, {
          color: line.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerRadius: 3,
        })
        series.setData(line.points)
        seriesHandles.push({ id: line.id, series })
      }

      chart.timeScale().fitContent()
      chartRef.current = chart

      // Scrub: drive the legend percentages from the hovered bar.
      crosshairMoveHandler = (param) => {
        if (
          param.point === undefined ||
          param.time === undefined ||
          param.point.x < 0 ||
          param.point.y < 0
        ) {
          setHoverPcts(null)
          return
        }
        const next: Record<string, number> = {}
        for (const handle of seriesHandles) {
          const data = param.seriesData.get(handle.series) as LineData<Time> | undefined
          if (typeof data?.value === "number") next[handle.id] = data.value
        }
        setHoverPcts(Object.keys(next).length > 0 ? next : null)
      }
      chart.subscribeCrosshairMove(crosshairMoveHandler)

      resizeObserver = new ResizeObserver(() => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth })
        }
      })
      resizeObserver.observe(chartContainerRef.current)
    })()

    return () => {
      isCancelled = true
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      try {
        if (chart && crosshairMoveHandler) {
          chart.unsubscribeCrosshairMove(crosshairMoveHandler)
        }
      } catch {
        // noop
      }
      try {
        chart?.remove()
      } catch {
        // noop
      }
      if (chartRef.current === chart) chartRef.current = null
    }
  }, [lines])

  if (lines.length === 0) return null

  return (
    <div className="space-y-1 px-3">
      {/* Legend: color dot + symbol + % change (live while scrubbing) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {lines.map((line) => {
          const pct = hoverPcts?.[line.id] ?? line.changePct
          return (
            <span key={line.id} className="flex items-center gap-1 text-[10px]">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: line.color }}
                aria-hidden="true"
              />
              <span className="font-bold text-white">{line.symbol}</span>
              <span
                className={cn(
                  "font-berkeley-mono tabular-nums",
                  pct > 0
                    ? "text-green-400"
                    : pct < 0
                      ? "text-red-400"
                      : "text-zinc-400",
                )}
              >
                {pct > 0 ? "+" : ""}
                {pct.toFixed(1)}%
              </span>
            </span>
          )
        })}
      </div>
      <div className="relative w-full">
        {/* Same dotted backdrop as the single-analysis MiniPriceChart */}
        <div
          className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />
        <div ref={chartContainerRef} className="w-full" />
      </div>
    </div>
  )
}
