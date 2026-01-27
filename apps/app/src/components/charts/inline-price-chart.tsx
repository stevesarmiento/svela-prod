'use client'

import { useMemo, useEffect, useRef } from 'react'
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import type { IChartApi } from 'lightweight-charts'
import type { CoinMarketData } from '@/types/coins'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'

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
      console.log(`📊 InlineChart (${symbol}): No chart data`, { coingeckoId, isLoading })
      return []
    }

    const filtered = chartData.filter(point => 
      point && 
      typeof point.time === 'number' && 
      typeof point.value === 'number' && 
      point.value > 0 &&
      !isNaN(point.value)
    )

    console.log(`✅ InlineChart (${symbol}): Data ready`, { 
      coingeckoId, 
      points: filtered.length,
      dataSource: performance.dataSource,
      cached: performance.cached 
    })

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

  // Create chart when data is available (same timing as useChartInstance)
  useEffect(() => {
    if (!chartContainerRef.current || validChartData.length === 0) {
      console.log(`📊 InlineChart (${symbol}): Waiting for data`, { 
        hasContainer: !!chartContainerRef.current, 
        dataLength: validChartData.length 
      })
      return
    }

    console.log(`📊 InlineChart (${symbol}): Creating chart with data`, { 
      dataLength: validChartData.length 
    })

    let isCancelled = false

    void (async () => {
      const { createChart, LineSeries, ColorType, LastPriceAnimationMode } =
        await loadLightweightCharts()

      if (isCancelled) return

      try {
        const container = chartContainerRef.current
        if (!container || !container.isConnected) {
          console.warn(`❕ InlineChart (${symbol}): Container disappeared before chart creation`)
          onError?.()
          return
        }

        // Clean up existing chart
        if (chartRef.current) {
          chartRef.current.remove()
          chartRef.current = null
        }

        const chart = createChart(container, {
          height: 32,
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: 'transparent',
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
        })

        chartRef.current = chart

        const lineSeries = chart.addSeries(LineSeries, {
          lineWidth: 2,
          lastValueVisible: false,
          visible: true,
          priceLineVisible: false,
          color: isPositive ? '#10b981' : '#ef4444',
          lastPriceAnimation: LastPriceAnimationMode.Continuous,
        })
        
        if (validChartData.length > 0) {
          lineSeries.setData(validChartData)
          chart.timeScale().fitContent()
        }

        console.log(`✅ InlineChart (${symbol}): Chart created and data set successfully`)
      } catch (error) {
        console.error(`❌ InlineChart (${symbol}): Error creating chart`, error)
        onError?.()
      }
    })()

    // Cleanup function
    return () => {
      isCancelled = true
      if (chartRef.current) {
        try {
          chartRef.current.remove()
          chartRef.current = null
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }, [validChartData, isPositive, symbol])

  // Show loading skeleton while fetching data
  if (isLoading || validChartData.length === 0) {
    return (
      <div 
        className="w-56 h-8 rounded-sm overflow-hidden bg-transparent flex items-center justify-center"
        title={`${symbol} ${isLoading ? 'loading data...' : 'no data available'}`}
      >
        {isLoading ? (
          <div className="w-48 h-5 bg-gray-200/60 dark:bg-zinc-700/40 rounded-sm animate-pulse" />
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
