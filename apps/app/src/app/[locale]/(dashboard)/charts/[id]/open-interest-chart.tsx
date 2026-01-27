'use client'

import React from 'react'
import { useRef, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { useOpenInterest } from '@/hooks/use-open-interest'
import { generatePastelColors } from '@/lib/chart-colors'
import { coinGeckoIdToSymbolFallback } from '@/lib/coingecko-to-symbol'
import type { IChartApi, Time } from 'lightweight-charts'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'

interface OpenInterestChartProps {
  coinId: string
  interval?: string
  limit?: number
  unit?: 'usd' | 'coin'
  className?: string
}

interface LineDataPoint {
  time: Time
  value: number
}

interface HighLowDataPoint {
  time: Time
  value: number
  color: string
}

interface TooltipData {
  time: string
  value: number
  high: number
  low: number
  change: number
  changePercent: number
  x: number
  y: number
  visible: boolean
}

export function OpenInterestChart({
  coinId,
  interval = '4h',
  limit = 100,
  unit = 'usd',
}: OpenInterestChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [tooltip, setTooltip] = useState<TooltipData>({
    time: '',
    value: 0,
    high: 0,
    low: 0,
    change: 0,
    changePercent: 0,
    x: 0,
    y: 0,
    visible: false
  })

  // Convert CoinGecko ID to symbol for Coinglass API
  const symbol = coinGeckoIdToSymbolFallback(coinId)
  
  const { data, isLoading, error } = useOpenInterest({
    symbol,
    interval,
    limit,
    unit,
  })

  const { lineData, highData, lowData, colors } = useMemo(() => {
    if (!data?.data?.length) {
      return {
        lineData: [],
        highData: [],
        lowData: [],
        colors: { line: '#3b82f6', high: '#22c55e40', low: '#ef444440' }
      }
    }

    // Generate pastel colors
    const pastelColors = generatePastelColors(3)
    
    // Use close values for the line chart
    const lineData: LineDataPoint[] = data.data.map(item => ({
      time: (item.timestamp / 1000) as Time,
      value: item.close,
    }))

    // Create high/low points data
    const highData: HighLowDataPoint[] = data.data.map(item => ({
      time: (item.timestamp / 1000) as Time,
      value: item.high,
      color: pastelColors[2] || '#3b82f6', // Green for highs
    }))

    const lowData: HighLowDataPoint[] = data.data.map(item => ({
      time: (item.timestamp / 1000) as Time,
      value: item.low,
      color: pastelColors[1] || '#3b82f6', // Red for lows
    }))

    return {
      lineData: lineData.sort((a, b) => (a.time as number) - (b.time as number)),
      highData: highData.sort((a, b) => (a.time as number) - (b.time as number)),
      lowData: lowData.sort((a, b) => (a.time as number) - (b.time as number)),
      colors: {
        line: pastelColors[0] || '#3b82f6',
        high: pastelColors[2] || '#3b82f6',
        low: pastelColors[1] || '#3b82f6',
      }
    }
  }, [data])

  useEffect(() => {
    if (!chartContainerRef.current || !lineData.length) return

    let isCancelled = false
    let cleanup: (() => void) | null = null

    void (async () => {
      const {
        createChart,
        ColorType,
        LineStyle,
        LineSeries,
        CrosshairMode,
        LastPriceAnimationMode,
        LineType,
      } = await loadLightweightCharts()

      if (isCancelled || !chartContainerRef.current || !lineData.length) return

      // Create chart with same styling as price chart
      const chart = createChart(chartContainerRef.current, {
        handleScale: false,
        handleScroll: false,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#ffffff50",
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false, color: "#e5e7eb20", style: LineStyle.Dotted },
          horzLines: { visible: true, color: "#f5f5f510", style: LineStyle.Dotted },
        },
        rightPriceScale: { borderVisible: false, autoScale: true },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: { labelVisible: true, width: 1, color: "#d1d5db40", visible: true, style: LineStyle.Solid },
          horzLine: { visible: false, labelVisible: false },
        },
        timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false },
        height: 200,
        
      })

      chartRef.current = chart

      // Add main line series for open interest (close values)
      const lineSeries = chart.addSeries(LineSeries, {
        color: colors.line,
        lineWidth: 2,
        lineType: LineType.WithSteps,
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `${unit === 'usd' ? '$' : ''}${formatLargeNumber(price)}${unit === 'coin' ? ' BTC' : ''}`,
        },
      })

      // Add high points as line series with markers
      const highSeries = chart.addSeries(LineSeries, {
        color: colors.high, // Completely invisible line
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `H: ${unit === 'usd' ? '$' : ''}${formatLargeNumber(price)}${unit === 'coin' ? ' BTC' : ''}`,
        },
      })

      // Add low points as line series with markers
      const lowSeries = chart.addSeries(LineSeries, {
        color: colors.low, // Completely invisible line
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `L: ${unit === 'usd' ? '$' : ''}${formatLargeNumber(price)}${unit === 'coin' ? ' BTC' : ''}`,
        },
      })

      // Set data
      lineSeries.setData(lineData)
      highSeries.setData(highData)
      lowSeries.setData(lowData)

      const lineIndexByTime = new Map<Time, number>()
      for (let index = 0; index < lineData.length; index++) {
        const point = lineData[index]
        if (point) lineIndexByTime.set(point.time, index)
      }

      const highValueByTime = new Map<Time, number>()
      for (const point of highData) highValueByTime.set(point.time, point.value)

      const lowValueByTime = new Map<Time, number>()
      for (const point of lowData) lowValueByTime.set(point.time, point.value)

      // Subscribe to crosshair move for tooltip
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !chartContainerRef.current) {
          setTooltip(prev => ({ ...prev, visible: false }))
          return
        }

        const currentIndex = lineIndexByTime.get(param.time)
        const high = highValueByTime.get(param.time)
        const low = lowValueByTime.get(param.time)

        if (currentIndex === undefined || high === undefined || low === undefined) {
          setTooltip(prev => ({ ...prev, visible: false }))
          return
        }

        const dataPoint = lineData[currentIndex]
        if (!dataPoint) {
          setTooltip(prev => ({ ...prev, visible: false }))
          return
        }

        // Get mouse position relative to chart container
        const x = param.point?.x || 0
        const y = param.point?.y || 0

        // Calculate change from previous point
        const previousPoint = currentIndex > 0 ? lineData[currentIndex - 1] : null
        const change = previousPoint ? dataPoint.value - previousPoint.value : 0
        const changePercent = previousPoint ? (change / previousPoint.value) * 100 : 0

        // Format time
        const timeStr = new Date((param.time as number) * 1000).toLocaleDateString()

        setTooltip({
          time: timeStr,
          value: dataPoint.value,
          high,
          low,
          change,
          changePercent,
          x: x + 10,
          y: y - 10,
          visible: true
        })
      })

      // Fit content
      chart.timeScale().fitContent()

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: 200,
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
        chart.remove()
        chartRef.current = null
      }
    })()

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [lineData, highData, lowData, colors, unit])

  if (isLoading) {
    return (
      <div className="border border-zinc-800/30 rounded-[13px] overflow-hidden">
        <div className="p-0 relative">
          <Card className="border-none bg-transparent">
            <CardContent className="pl-8">
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !data?.success) {
    return (
      <div className="">
        <Card className="border-none bg-transparent">
          <CardContent>
            <div className="text-destructive">Failed to load open interest data for {symbol}</div>
            <div className="text-xs text-muted-foreground mt-1">
              CoinGecko ID &quot;{coinId}&quot; → Symbol &quot;{symbol}&quot;
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative">
      <Card className="border-none bg-transparent">          
        <CardContent className="pl-8">
          <div className="p-0 relative">
            {/* Data source indicator */}
            <div className="absolute top-2 right-2 z-10 text-[10px] text-muted-foreground bg-black/20 px-2 py-1 rounded">
              {symbol} via Coinglass
            </div>
            <div ref={chartContainerRef} />
            
            {/* Custom Tooltip */}
            {tooltip.visible && (
              <div 
                className="absolute z-10 overflow-hidden text-[11px] text-white rounded-xl w-[200px] shadow-2xl pointer-events-none backdrop-blur-xl bg-zinc-900/95 border border-zinc-700/50 transition-all duration-100 ease-in-out"
                style={{ 
                  left: `${tooltip.x}px`, 
                  top: `${tooltip.y}px`,
                  transform: 'translate(-50%, -100%)'
                }}
              >
                <div className="px-4 py-3">
                  <div className="mb-3 text-[11px] text-zinc-400 font-medium">
                    {tooltip.time ? new Date(tooltip.time).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : ''}
                  </div>
                  <div className="w-full h-[1px] mb-3 bg-zinc-700/50 scale-125" />
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">Open Interest</span>
                      <span className="text-[11px] font-diatype-mono text-white font-bold">
                        {unit === 'usd' ? '$' : ''}{formatLargeNumber(tooltip.value)}{unit === 'coin' ? ' BTC' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-green-400">High</span>
                      <span className="text-[11px] font-diatype-mono text-green-400">
                        {unit === 'usd' ? '$' : ''}{formatLargeNumber(tooltip.high)}{unit === 'coin' ? ' BTC' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-red-400">Low</span>
                      <span className="text-[11px] font-diatype-mono text-red-400">
                        {unit === 'usd' ? '$' : ''}{formatLargeNumber(tooltip.low)}{unit === 'coin' ? ' BTC' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">Change</span>
                      <span className={`text-[10px] font-diatype-mono px-1.5 h-4 rounded ${tooltip.changePercent >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{tooltip.changePercent >= 0 ? '+' : ''}{tooltip.changePercent.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}