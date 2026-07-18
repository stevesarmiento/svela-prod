'use client'

import { useEffect, useMemo, useRef } from "react"
import { cn } from "@v1/ui/cn"
import { generatePastelColors } from "@/lib/chart-colors"
import { CHART_COLOR_PARSERS } from "@/lib/oklch"
import { loadLightweightCharts } from "@/lib/load-lightweight-charts"
import type { IChartApi, Time } from "lightweight-charts"

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

function buildNormalizedLines(tokens: MultiMiniChartToken[]): NormalizedLine[] {
  // Common cutoff from the latest timestamp across all series.
  let maxTime = Number.NEGATIVE_INFINITY
  for (const token of tokens) {
    for (const p of token.series) {
      const t = Number(p.time)
      if (Number.isFinite(t) && t > maxTime) maxTime = t
    }
  }
  if (!Number.isFinite(maxTime)) return []
  const cutoff = maxTime - WINDOW_SECONDS

  const colors = generatePastelColors(tokens.length)

  return tokens.flatMap((token, index) => {
    const windowPoints = token.series
      .map((p) => ({ time: Number(p.time), value: p.value }))
      .filter(
        (p) =>
          Number.isFinite(p.time) &&
          p.time >= cutoff &&
          Number.isFinite(p.value) &&
          p.value > 0,
      )
      .sort((a, b) => a.time - b.time)

    if (windowPoints.length < 2) return []
    const base = windowPoints[0]!.value
    if (base <= 0) return []

    const points = windowPoints.map((p) => ({
      time: p.time as Time,
      value: (p.value / base - 1) * 100,
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

export function MultiMiniPriceChart({ tokens }: { tokens: MultiMiniChartToken[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const lines = useMemo(() => buildNormalizedLines(tokens), [tokens])

  useEffect(() => {
    if (!chartContainerRef.current || lines.length === 0) return

    let isCancelled = false
    let chart: IChartApi | null = null
    let resizeObserver: ResizeObserver | null = null

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

      for (const line of lines) {
        const series = chart.addSeries(LineSeries, {
          color: line.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerRadius: 3,
        })
        series.setData(line.points)
      }

      chart.timeScale().fitContent()
      chartRef.current = chart

      resizeObserver = new ResizeObserver(() => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth })
        }
      })
      resizeObserver.observe(chartContainerRef.current)
    })()

    return () => {
      isCancelled = true
      resizeObserver?.disconnect()
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
      {/* Legend: color dot + symbol + window % change */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {lines.map((line) => (
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
                line.changePct > 0
                  ? "text-green-400"
                  : line.changePct < 0
                    ? "text-red-400"
                    : "text-zinc-400",
              )}
            >
              {line.changePct > 0 ? "+" : ""}
              {line.changePct.toFixed(1)}%
            </span>
          </span>
        ))}
        <span className="ml-auto text-[9px] uppercase tracking-wide text-zinc-500">7d</span>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  )
}
