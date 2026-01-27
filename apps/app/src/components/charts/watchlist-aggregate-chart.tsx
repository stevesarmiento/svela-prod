'use client'

import React, { useRef, useEffect } from 'react'
import type { IChartApi, Time as LightweightTime } from 'lightweight-charts'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'

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

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) {
      return
    }

    let isCancelled = false
    let cleanup: (() => void) | null = null

    // Clean up existing chart
    if (chartRef.current) {
      try {
        chartRef.current.remove()
      } catch (error) {
        console.debug('Chart cleanup - already disposed:', error)
      }
      chartRef.current = null
    }

    void (async () => {
      const { createChart, ColorType, LineStyle, LineSeries } =
        await loadLightweightCharts()

      if (isCancelled || !chartContainerRef.current || data.length === 0) return

      // Create optimized chart
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: 'transparent',
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
      })

      // Add line series with proper color based on performance
      const lineSeries = chart.addSeries(LineSeries, {
        //color: isPositive ? '#10B981' : '#EF4444', // Green for positive, red for negative
        color: '#ffffff50',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        lineStyle: LineStyle.Solid,
      })

      // Set data
      lineSeries.setData(data)

      // Auto-fit the content
      chart.timeScale().fitContent()

      chartRef.current = chart

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height,
          })
        }
      }

      // Prefer observing the actual container size (avoids per-chart global resize listeners).
      let resizeObserver: ResizeObserver | null = null
      let resizeRafId: number | null = null
      let unsubscribeWindowResize: (() => void) | null = null

      if (typeof ResizeObserver !== 'undefined' && chartContainerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId) cancelAnimationFrame(resizeRafId)
          resizeRafId = requestAnimationFrame(() => handleResize())
        })
        resizeObserver.observe(chartContainerRef.current)
      } else {
        unsubscribeWindowResize = subscribeToWindowResize(handleResize)
      }

      handleResize()

      cleanup = () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId)
        resizeObserver?.disconnect()
        unsubscribeWindowResize?.()
        if (chart) {
          try {
            chart.remove()
          } catch (error) {
            console.debug('Chart cleanup - already disposed:', error)
          }
        }
        chartRef.current = null
      }
    })()

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [data, isPositive, width, height])

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