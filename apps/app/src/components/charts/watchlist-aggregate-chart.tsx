'use client'

import React, { useRef, useEffect } from 'react'
import { createChart, ColorType, LineStyle, IChartApi, LineSeries } from 'lightweight-charts'
import type { Time as LightweightTime } from 'lightweight-charts'

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

  console.log('WatchlistAggregateChart render:', {
    dataLength: data.length,
    isPositive,
    width,
    height,
    sampleData: data.slice(0, 3),
    lastData: data[data.length - 1]
  })

  useEffect(() => {
    console.log('Chart useEffect triggered:', {
      hasContainer: !!chartContainerRef.current,
      dataLength: data.length,
      firstDataPoint: data[0],
      lastDataPoint: data[data.length - 1]
    })

    if (!chartContainerRef.current || data.length === 0) {
      console.log('Early return - no container or no data')
      return
    }

    // Clean up existing chart
    if (chartRef.current) {
      try {
        chartRef.current.remove()
      } catch (error) {
        console.debug('Chart already disposed:', error)
      }
      chartRef.current = null
    }

    // Create new chart
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

    // Add line series
    const lineSeries = chart.addSeries(LineSeries, {
      // color: isPositive ? '#10B981' : '#EF4444', // Green for positive, red for negative
      color: '#ffffff50',
      lineWidth: 1,
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

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chart) {
        try {
          chart.remove()
        } catch (error) {
          console.debug('Chart cleanup - already disposed:', error)
        }
      }
      chartRef.current = null
    }
  }, [data, isPositive, width, height])

  if (data.length === 0) {
    return (
      <div 
        style={{ width, height }} 
        className="flex items-center justify-center text-xs text-gray-500"
      >
        No data
      </div>
    )
  }

  return (
    <div className="w-full relative">
      <div ref={chartContainerRef} className="w-full" style={{ height }} />
    </div>
  )
} 