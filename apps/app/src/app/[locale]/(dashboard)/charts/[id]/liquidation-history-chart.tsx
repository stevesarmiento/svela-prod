'use client'

import React, { useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { useLiquidationHistory } from '@/hooks/use-liquidation-history'
import { TrendingDown, TrendingUp } from 'lucide-react'
import {
  createChart,
  ColorType,
  LineStyle,
  Time,
  IChartApi,
  AreaSeries,
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
}

export function LiquidationHistoryChart({
  coinId,
  interval = '1d',
  exchangeList = 'Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex',
  limit = 30,
}: LiquidationHistoryChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi>(null)

  const { data, isLoading, error } = useLiquidationHistory({
    symbol: coinId,
    interval,
    exchangeList,
    limit,
  })

  const { longData, shortData, totalStats } = useMemo(() => {
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

    // Prepare chart data for lightweight charts
    const longData: LiquidationDataPoint[] = data.data.map(item => ({
      time: (item.timestamp / 1000) as Time,
      value: item.longLiquidations,
    }))

    const shortData: LiquidationDataPoint[] = data.data.map(item => ({
      time: (item.timestamp / 1000) as Time,
      value: -item.shortLiquidations, // Negative for visual separation
    }))

    return {
      longData: longData.sort((a, b) => (a.time as number) - (b.time as number)),
      shortData: shortData.sort((a, b) => (a.time as number) - (b.time as number)),
      totalStats: { totalLong, totalShort, total }
    }
  }, [data])

  useEffect(() => {
    if (!chartContainerRef.current || !longData.length) return

    // Create chart with same styling as price chart
    const chart = createChart(chartContainerRef.current, {
      handleScale: true,
      handleScroll: true,
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
      height: 400,
    })

    chartRef.current = chart

    // Add long liquidations series
    const longSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(115, 115, 115, 0)', // Neutral fill
      bottomColor: 'rgba(115, 115, 115, 0)', // Same as top for flat fill
      lineColor: 'rgba(34, 197, 94, 1)', // Green line only
      lineWidth: 1,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${formatLargeNumber(Math.abs(price))}`,
      },
    })

    // Add short liquidations series
    const shortSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(115, 115, 115, 0)', // Neutral fill
      bottomColor: 'rgba(115, 115, 115, 0)', // Same as top for flat fill  
      lineColor: 'rgba(239, 68, 68, 1)', // Red line only
      lineWidth: 1,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${formatLargeNumber(Math.abs(price))}`,
      },
    })

    // Set data
    longSeries.setData(longData)
    shortSeries.setData(shortData)

    // Fit content
    chart.timeScale().fitContent()

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: 400,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [longData, shortData])

  if (isLoading) {
    return (
      <div className="border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader className="p-6 pt-4 pr-5">
              <CardTitle>
                <Skeleton className="h-5 w-48" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pl-8">
              <Skeleton className="h-[400px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !data?.success) {
    return (
      <div className="border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        <Card className="border-none bg-transparent">
          <CardHeader>
            <CardTitle className="text-destructive">Failed to load liquidation data</CardTitle>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
      <div className="p-0 relative">
        <div
          className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />
        <Card className="border-none bg-transparent">
          <CardHeader className="p-6 pt-4 pr-5">
            <CardTitle className="flex flex-col items-left">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg font-mono">
                  Liquidation History - {data.coinInfo?.name || data.symbol}
                </span>
              </div>
              
              {/* Stats */}
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span className="text-green-500 font-medium">
                    ${formatLargeNumber(totalStats.totalLong)}
                  </span>
                  <span className="text-muted-foreground">Long</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  <span className="text-red-500 font-medium">
                    ${formatLargeNumber(totalStats.totalShort)}
                  </span>
                  <span className="text-muted-foreground">Short</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    ${formatLargeNumber(totalStats.total)}
                  </span>
                  <span className="text-muted-foreground">Total</span>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          
          <CardContent className="pl-8">
            <div className="p-0 relative">
              <div ref={chartContainerRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}