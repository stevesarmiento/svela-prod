'use client'

import React, { useRef, useEffect } from 'react'
import { createChart, ColorType, LineStyle, IChartApi, LineSeries, HistogramSeries } from 'lightweight-charts'
import { useMiniChartData } from '@/hooks/use-mini-chart-data'
import { Spinner } from '@v1/ui/spinner'

interface MiniPriceChartProps {
  coinId: string
  tokenSymbol?: string
  currentPrice?: number
}

export function MiniPriceChart({ coinId, currentPrice }: MiniPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const { chartData, volumeData, isLoading, priceChange24h } = useMiniChartData(coinId, currentPrice)

  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return

    // Remove existing chart safely
    if (chartRef.current) {
      try {
        chartRef.current.remove()
      } catch (error) {
        // Chart already disposed, ignore
        console.debug('Chart already disposed:', error)
      }
      chartRef.current = null
    }

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
        fontSize: 10,
        attributionLogo: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 180,
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
        mode: 1,
        vertLine: {
          width: 1,
          color: '#374151',
          style: LineStyle.Solid,
        },
        horzLine: {
          visible: false,
        },
      },
      handleScroll: false,
      handleScale: false,
    })

    // Create volume series (first, so it appears behind price)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: '#ffffff30',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    // Create price line series
    const lineSeries = chart.addSeries(LineSeries, {
      color: priceChange24h >= 0 ? '#10B981' : '#EF4444',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    // Set volume data
    if (volumeData.length > 0) {
      volumeSeries.setData(volumeData)
    }

    // Set price data
    lineSeries.setData(chartData)

    // Configure volume scale - give more space to volume bars
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })

    // Fit content
    chart.timeScale().fitContent()

    // Store ref
    chartRef.current = chart

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chart) {
        try {
          chart.remove()
        } catch (error) {
          // Chart already disposed, ignore
          console.debug('Chart cleanup - already disposed:', error)
        }
      }
      chartRef.current = null
    }
  }, [chartData, volumeData, priceChange24h])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[120px] w-full">
        <Spinner className="w-4 h-4" />
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] w-full text-xs text-gray-500">
        No chart data available
      </div>
    )
  }

  return (
    <div className="w-full">
        <div className="w-full">
          <div ref={chartContainerRef} className="w-full h-full" />
        </div>
    </div>
  )
} 