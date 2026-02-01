'use client'

import React, { useRef } from "react"
import type { IChartApi, Time as LightweightTime } from 'lightweight-charts'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'
import { Effect } from "effect"
import { useEffectScoped } from "@/lib/effect/react"

interface AggregateDataPoint {
  time: LightweightTime
  value: number
}

interface WatchlistAggregateChartProps {
  data: AggregateDataPoint[]
  isPositive: boolean
  width?: number
  height?: number
}

export function WatchlistAggregateChart({ 
  data, 
  isPositive, 
  width = 0, 
  height = 0 
}: WatchlistAggregateChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffectScoped(
    () => {
      const container = chartContainerRef.current
      if (!container || data.length === 0) return Effect.void

      return Effect.acquireRelease(
        Effect.gen(function* () {
          // Clean up any previous instance before creating a new one.
          yield* Effect.sync(() => {
            if (!chartRef.current) return
            try {
              chartRef.current.remove()
            } catch (error) {
              // Ignore cleanup errors.
            }
            chartRef.current = null
          })

          const { createChart, ColorType, LineStyle, LineSeries } = yield* Effect.tryPromise({
            try: () => loadLightweightCharts(),
            catch: (error) => error,
          })

          const chart = yield* Effect.try({
            try: () =>
              createChart(container, {
                layout: {
                  background: { type: ColorType.Solid, color: "transparent" },
                  textColor: "transparent",
                  fontSize: 0,
                  attributionLogo: false,
                },
                width,
                height,
                rightPriceScale: {
                  visible: false,
                },
                leftPriceScale: {
                  visible: false,
                },
                timeScale: {
                  visible: false,
                  borderVisible: false,
                },
                grid: {
                  vertLines: { visible: false },
                  horzLines: { visible: false },
                },
                crosshair: {
                  mode: 0, // Disabled
                  vertLine: { visible: false },
                  horzLine: { visible: false },
                },
                handleScroll: false,
                handleScale: false,
              }),
            catch: (error) => error,
          })

          const lineSeries = chart.addSeries(LineSeries, {
            // color: isPositive ? "#10B981" : "#EF4444", // Green for positive, red for negative
            color: "#ffffff50",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            lineStyle: LineStyle.Solid,
          })

          lineSeries.setData(data)
          chart.timeScale().fitContent()

          chartRef.current = chart

          const resizeRafIdRef: { current: number | null } = { current: null }
          let resizeObserver: ResizeObserver | null = null
          let unsubscribeWindowResize: (() => void) | null = null

          const handleResize = () => {
            if (!chartContainerRef.current) return
            chart.applyOptions({
              width: chartContainerRef.current.clientWidth,
              height,
            })
          }

          if (typeof ResizeObserver !== "undefined" && chartContainerRef.current) {
            resizeObserver = new ResizeObserver(() => {
              if (resizeRafIdRef.current) cancelAnimationFrame(resizeRafIdRef.current)
              resizeRafIdRef.current = requestAnimationFrame(() => handleResize())
            })
            resizeObserver.observe(chartContainerRef.current)
          } else {
            unsubscribeWindowResize = subscribeToWindowResize(handleResize)
          }

          handleResize()

          return { chart, resizeObserver, unsubscribeWindowResize, resizeRafIdRef } as const
        }),
        ({ chart, resizeObserver, unsubscribeWindowResize, resizeRafIdRef }) =>
          Effect.sync(() => {
            if (resizeRafIdRef.current) cancelAnimationFrame(resizeRafIdRef.current)
            resizeObserver?.disconnect()
            unsubscribeWindowResize?.()
            try {
              chart.remove()
            } catch (error) {
              // Ignore cleanup errors.
            }
            chartRef.current = null
          }),
      ).pipe(
        Effect.flatMap(() => Effect.never),
        Effect.asVoid,
      )
    },
    [data, isPositive, width, height],
  )

  if (data.length === 0) {
    return (
      <div 
        style={{ width, height }} 
        className="flex items-center justify-center text-xs text-muted-foreground"
      >
        Loading chart data...
      </div>
    )
  }

  return (
    <div className="w-full relative">
      <div ref={chartContainerRef} className="w-full" style={{ height }} />
    </div>
  )
} 