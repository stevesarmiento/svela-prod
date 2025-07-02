'use client'

import React, { useEffect, useRef, useMemo, useState } from 'react'
import { Card, CardContent } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { useLiquidationHistory } from '@/hooks/use-liquidation-history'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import {
  createChart,
  ColorType,
  LineStyle,
  Time,
  IChartApi,
  HistogramSeries,
  CrosshairMode,
} from 'lightweight-charts'

interface LiquidationHistoryChartProps {
  coinId: string
  interval?: string
  exchangeList?: string
  limit?: number
  className?: string
}

interface LiquidationDataPoint {
  time: Time
  value: number
  color?: string
}

interface TooltipData {
  time: string
  longValue: number
  shortValue: number
  total: number
  x: number
  y: number
  visible: boolean
}

export function LiquidationHistoryChart({
  coinId,
  interval = '1d',
  exchangeList = 'Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex',
  limit = 30,
}: LiquidationHistoryChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi>(null)
  const [tooltip, setTooltip] = useState<TooltipData>({
    time: '',
    longValue: 0,
    shortValue: 0,
    total: 0,
    x: 0,
    y: 0,
    visible: false
  })

  const { data, isLoading, error } = useLiquidationHistory({
    symbol: coinId,
    interval,
    exchangeList,
    limit,
  })

  // Generate consistent colors for longs and shorts
  const colors = useMemo(() => {
    const pastelColors = generatePastelColors(2)
    return {
      long: addOpacityToColor(pastelColors[0] || '', 0.8),
      short: addOpacityToColor(pastelColors[1] || '', 0.8),
    }
  }, [])

  const { longData, shortData } = useMemo(() => {
    if (!data?.data?.length) {
      return {
        longData: [],
        shortData: [],
        totalStats: { totalLong: 0, totalShort: 0, total: 0 }
      }
    }

    // Calculate totals
    const totalLong = data.data.reduce((sum, item) => sum + item.longLiquidations, 0)
    const totalShort = data.data.reduce((sum, item) => sum + item.shortLiquidations, 0)
    const total = totalLong + totalShort

    // Prepare histogram data for liquidations
    const longData: LiquidationDataPoint[] = data.data.map(item => ({
      time: (item.timestamp / 1000) as Time,
      value: item.longLiquidations,
      color: colors.long,
    }))

    const shortData: LiquidationDataPoint[] = data.data.map(item => ({
      time: (item.timestamp / 1000) as Time,
      value: item.shortLiquidations,
      color: colors.short,
    }))

    return {
      longData: longData.sort((a, b) => (a.time as number) - (b.time as number)),
      shortData: shortData.sort((a, b) => (a.time as number) - (b.time as number)),
      totalStats: { totalLong, totalShort, total }
    }
  }, [data, colors])

  useEffect(() => {
    if (!chartContainerRef.current || !longData.length) return

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

    // Add long liquidations histogram series
    const longSeries = chart.addSeries(HistogramSeries, {
      color: colors.long,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${formatLargeNumber(price)}`,
      },
      priceScaleId: 'longs',
      base: 0,
    })

    // Add short liquidations histogram series  
    const shortSeries = chart.addSeries(HistogramSeries, {
      color: colors.short,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${formatLargeNumber(price)}`,
      },
      priceScaleId: 'shorts',
      base: 0,
    })

    // Configure the long liquidations scale (top half)
    chart.priceScale('longs').applyOptions({
      scaleMargins: { top: 0, bottom: 0.5 },
    })

    // Configure the short liquidations scale (bottom half, inverted)
    chart.priceScale('shorts').applyOptions({
      scaleMargins: { top: 0.5, bottom: 0 },
      invertScale: true,
    })

    // Set data
    longSeries.setData(longData)
    shortSeries.setData(shortData)

    // Subscribe to crosshair move for tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !chartContainerRef.current) {
        setTooltip(prev => ({ ...prev, visible: false }))
        return
      }

      // Find the data points for this time
      const longPoint = longData.find(d => d.time === param.time)
      const shortPoint = shortData.find(d => d.time === param.time)

      if (!longPoint || !shortPoint) {
        setTooltip(prev => ({ ...prev, visible: false }))
        return
      }

      // Get mouse position relative to chart container
      const x = param.point?.x || 0
      const y = param.point?.y || 0

      // Format time
      const timeStr = new Date((param.time as number) * 1000).toLocaleDateString()

      setTooltip({
        time: timeStr,
        longValue: longPoint.value,
        shortValue: shortPoint.value,
        total: longPoint.value + shortPoint.value,
        x: x + 10, // Offset slightly from cursor
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

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [longData, shortData, colors])

  if (isLoading) {
    return (
      <div className="border border-zinc-800/30 rounded-[13px] overflow-hidden">
        <div className="p-0 relative">
          <Card className="border-none bg-transparent">
            <CardContent className="pl-8">
              <Skeleton className="h-[200px] w-full" />
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
            <div className="text-destructive">Failed to load liquidation data</div>
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
                      <span className="text-[11px] text-green-400">Long</span>
                      <span className="text-[11px] font-mono text-green-400 font-bold">${formatLargeNumber(tooltip.longValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-red-400">Short</span>
                      <span className="text-[11px] font-mono text-red-400 font-bold">${formatLargeNumber(tooltip.shortValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">Total</span>
                      <span className="text-[11px] font-mono text-white font-bold">${formatLargeNumber(tooltip.total)}</span>
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