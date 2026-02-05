'use client'

import { useMemo, useRef } from "react"
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import type { IChartApi } from 'lightweight-charts'
import type { CoinMarketData } from '@/types/coins'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'
import { Effect, Schema } from "effect"
import { useEffectScoped } from "@/lib/effect/react"

interface InlinePriceChartProps {
  coingeckoId: string // CoinGecko ID to fetch real data
  percentChange24h: number // For color determination
  symbol?: string // For debugging
  initialData: CoinMarketData['quote']['USD'] // Required for useCoinGeckoChartData
  onError?: () => void
}

class InlinePriceChartInitError extends Schema.TaggedError<InlinePriceChartInitError>()(
  "InlinePriceChartInitError",
  {
    message: Schema.String,
    coingeckoId: Schema.String,
    symbol: Schema.String,
  },
) {}

export function InlinePriceChart({ 
  coingeckoId,
  percentChange24h,
  symbol = '',
  initialData,
  onError,
}: InlinePriceChartProps) {
  const isPositive = percentChange24h >= 0

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

    const filtered = chartData.filter(point => 
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

  // Use simplified chart creation that waits for data (like useChartInstance pattern)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffectScoped(
    () => {
      const container = chartContainerRef.current
      if (!container || validChartData.length === 0) return Effect.void

      return Effect.acquireRelease(
        Effect.gen(function* () {
          if (!container.isConnected) {
            yield* Effect.sync(() => onError?.())
            return null
          }

          // Clean up any previous instance before creating a new one.
          yield* Effect.sync(() => {
            if (!chartRef.current) return
            try {
              chartRef.current.remove()
            } catch {
              // Ignore cleanup errors
            }
            chartRef.current = null
          })

          const { createChart, LineSeries, ColorType, LastPriceAnimationMode } =
            yield* Effect.tryPromise({
              try: () => loadLightweightCharts(),
              catch: (error) =>
                new InlinePriceChartInitError({
                  message: String(error),
                  coingeckoId,
                  symbol,
                }),
            })

          const chart = yield* Effect.try({
            try: () =>
              createChart(container, {
                height: 32,
                layout: {
                  background: { type: ColorType.Solid, color: "transparent" },
                  textColor: "transparent",
                  attributionLogo: false,
                },
                grid: {
                  vertLines: { visible: false },
                  horzLines: { visible: false },
                },
                rightPriceScale: { visible: false },
                timeScale: { visible: false },
                crosshair: {
                  mode: 0, // Normal mode
                  vertLine: { visible: false },
                  horzLine: { visible: false },
                },
                handleScroll: false,
                handleScale: false,
              }),
            catch: (error) =>
              new InlinePriceChartInitError({
                message: String(error),
                coingeckoId,
                symbol,
              }),
          })

          chartRef.current = chart

          const lineSeries = chart.addSeries(LineSeries, {
            lineWidth: 2,
            lastValueVisible: false,
            visible: true,
            priceLineVisible: false,
            color: isPositive ? "#10b981" : "#ef4444",
            lastPriceAnimation: LastPriceAnimationMode.Continuous,
          })

          lineSeries.setData(validChartData)
          chart.timeScale().fitContent()

          return chart
        }),
        (chart) =>
          Effect.sync(() => {
            if (!chart) return
            try {
              chart.remove()
            } catch {
              // Ignore cleanup errors
            }
            chartRef.current = null
          }),
      ).pipe(
        Effect.flatMap((chart) => (chart ? Effect.never : Effect.void)),
        Effect.catchTag("InlinePriceChartInitError", (error) =>
          Effect.log("InlinePriceChart failed to create chart", {
            coingeckoId,
            symbol,
            message: error.message,
          }).pipe(Effect.zipRight(Effect.sync(() => onError?.()))),
        ),
        Effect.asVoid,
      )
    },
    [validChartData, isPositive, symbol],
  )

  // Show loading skeleton while fetching data
  if (isLoading || validChartData.length === 0) {
    return (
      <div 
        className="w-56 h-8 rounded-sm overflow-hidden bg-transparent flex items-center justify-center"
        title={`${symbol} ${isLoading ? 'loading data...' : 'no data available'}`}
      >
        {isLoading ? (
          <div className="w-48 h-5 bg-gray-200/60 dark:bg-zinc-700/40 rounded-sm animate-pulse motion-reduce:animate-none" />
        ) : (
          <div className="text-xs text-muted-foreground">No data</div>
        )}
      </div>
    )
  }

  return (
    <div 
      className="w-56 h-8 rounded-sm overflow-hidden bg-transparent"
      title={tooltipText}
    >
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  )
}
