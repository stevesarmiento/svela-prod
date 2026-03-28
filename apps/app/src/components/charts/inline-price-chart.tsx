'use client'

import { useMemo } from "react"
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import type { CoinMarketData } from '@/types/coins'
import { Liveline } from "liveline"
import type { LivelinePoint } from "liveline"
import { useTheme } from "next-themes"

interface InlinePriceChartProps {
  coingeckoId: string // CoinGecko ID to fetch real data
  percentChange24h: number // For color determination
  symbol?: string // For debugging
  initialData: CoinMarketData['quote']['USD'] // Required for useCoinGeckoChartData
  onError?: () => void
}

export function InlinePriceChart({ 
  coingeckoId,
  percentChange24h,
  symbol = '',
  initialData,
  onError: _onError,
}: InlinePriceChartProps) {
  const isPositive = percentChange24h >= 0
  const { resolvedTheme } = useTheme()

  // Use the same proven pattern as price-chart.tsx
  const { chartData, isLoading, performance } = useCoinGeckoChartData(
    coingeckoId, 
    '1d', // 24 hours of data
    initialData
  )

  // Filter and prepare chart data
  const validChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return []
    }

    const filtered = chartData.filter((point) => 
      point && 
      typeof point.time === 'number' && 
      typeof point.value === 'number' && 
      point.value > 0 &&
      !Number.isNaN(point.value)
    )

    return filtered
  }, [chartData, symbol, coingeckoId, isLoading, performance])

  // Prepare tooltip text
  const tooltipText = useMemo(() => {
    const changeText = `${percentChange24h > 0 ? '+' : ''}${percentChange24h.toFixed(2)}%`
    const dataInfo = performance.cached ? 'cached data' : 'live data'
    const pointsInfo = `${validChartData.length} points`
    
    return `${symbol} 24h trend: ${changeText} | ${dataInfo} | ${pointsInfo}`
  }, [symbol, percentChange24h, validChartData.length, performance.cached])

  const points = useMemo((): LivelinePoint[] => {
    const result: LivelinePoint[] = []
    for (const point of validChartData) {
      if (typeof point.time !== "number") continue
      if (!Number.isFinite(point.value)) continue
      result.push({ time: Number(point.time), value: point.value })
    }
    return result
  }, [validChartData])

  const latestValue = points[points.length - 1]?.value ?? 0

  const windowSecs = useMemo(() => {
    if (points.length < 2) return 30
    const first = points[0]?.time
    const last = points[points.length - 1]?.time
    if (typeof first !== "number" || typeof last !== "number") return 30
    return Math.max(30, last - first)
  }, [points])

  const livelineTheme = resolvedTheme === "light" ? "light" : "dark"

  const fallbackValue = initialData?.price && initialData.price > 0 ? initialData.price : 0
  const livelineValue = points.length > 0 ? latestValue : fallbackValue

  return (
    <div 
      className="w-56 h-8 rounded-sm overflow-hidden bg-transparent"
      title={isLoading ? `${symbol} loading data...` : points.length === 0 ? `${symbol} no data available` : tooltipText}
    >
      <Liveline
        data={points}
        value={livelineValue}
        theme={livelineTheme}
        color={isPositive ? "#10b981" : "#ef4444"}
        lineWidth={1}
        window={windowSecs}
        grid={false}
        badge={false}
        fill={false}
        pulse={false}
        scrub={false}
        momentum={false}
        loading={isLoading}
        exaggerate
        emptyText="No data"
        formatTime={() => ""}
        padding={{ top: 8, right: 8, bottom: 8, left: 8 }}
        className="size-full"
      />
    </div>
  )
}
