'use client'

import React, { useEffect, useRef, useMemo, useState } from 'react'
import { Card, CardContent } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { useOpenInterest } from '@/hooks/use-open-interest'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { generatePastelColors } from '@/lib/chart-colors'
import {
  createChart,
  ColorType,
  LineStyle,
  Time,
  IChartApi,
  LineSeries,
  CrosshairMode,
  LastPriceAnimationMode,
  LineType,
} from 'lightweight-charts'

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
  const chartRef = useRef<IChartApi>(null)
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

  const { data, isLoading, error } = useOpenInterest({
    symbol: coinId,
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

    // Subscribe to crosshair move for tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !chartContainerRef.current) {
        setTooltip(prev => ({ ...prev, visible: false }))
        return
      }

      // Find the data points for this time
      const dataPoint = lineData.find(d => d.time === param.time)
      const highPoint = highData.find(d => d.time === param.time)
      const lowPoint = lowData.find(d => d.time === param.time)

      if (!dataPoint || !highPoint || !lowPoint) {
        setTooltip(prev => ({ ...prev, visible: false }))
        return
      }

      // Get mouse position relative to chart container
      const x = param.point?.x || 0
      const y = param.point?.y || 0

      // Calculate change from previous point
      const currentIndex = lineData.findIndex(d => d.time === param.time)
      const previousPoint = currentIndex > 0 ? lineData[currentIndex - 1] : null
      const change = previousPoint ? dataPoint.value - previousPoint.value : 0
      const changePercent = previousPoint ? (change / previousPoint.value) * 100 : 0

      // Format time
      const timeStr = new Date((param.time as number) * 1000).toLocaleDateString()

      setTooltip({
        time: timeStr,
        value: dataPoint.value,
        high: highPoint.value,
        low: lowPoint.value,
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

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
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
            <div className="text-destructive">Failed to load open interest data</div>
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
                className="absolute z-10 bg-background border border-border rounded-lg shadow-lg p-3 pointer-events-none"
                style={{ 
                  left: `${tooltip.x}px`, 
                  top: `${tooltip.y}px`,
                  transform: 'translate(-50%, -100%)'
                }}
              >
                <div className="text-xs text-muted-foreground mb-2">{tooltip.time}</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Open Interest:</span>
                    <span className="font-mono">
                      {unit === 'usd' ? '$' : ''}{formatLargeNumber(tooltip.value)}{unit === 'coin' ? ' BTC' : ''}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-green-500">High:</span>
                    <span className="font-mono text-green-500">
                      {unit === 'usd' ? '$' : ''}{formatLargeNumber(tooltip.high)}{unit === 'coin' ? ' BTC' : ''}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-red-500">Low:</span>
                    <span className="font-mono text-red-500">
                      {unit === 'usd' ? '$' : ''}{formatLargeNumber(tooltip.low)}{unit === 'coin' ? ' BTC' : ''}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 pt-1 border-t border-border">
                    <span className="text-muted-foreground">Change:</span>
                    <div className="flex items-center gap-1">
                      {tooltip.changePercent >= 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className={`font-mono ${tooltip.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {tooltip.changePercent >= 0 ? '+' : ''}{tooltip.changePercent.toFixed(2)}%
                      </span>
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