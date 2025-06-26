'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle, LineSeries, HistogramSeries, LastPriceAnimationMode, Time } from 'lightweight-charts'

interface PriceDataPoint {
  time: Time
  value: number
}

interface VolumeDataPoint {
  time: Time
  value: number
  color?: string
}

export function useChartInstance(chartData: PriceDataPoint[], volumeData: VolumeDataPoint[], onCrosshairMove?: (price: number | null) => void) {
  const chartContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return

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
    })

    const lineSeries = chart.addSeries(LineSeries, {
      lineWidth: 1,
      lastValueVisible: true,
      visible: true,
      priceLineVisible: false,
      color: '#ffffff',
      lastPriceAnimation: LastPriceAnimationMode.Continuous,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#ffffff40',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })
    
    lineSeries.setData(chartData)
    volumeSeries.setData(volumeData)
    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: 400,
        })
      }
    }

    window.addEventListener("resize", handleResize)
    handleResize()

    // Crosshair handling
    if (onCrosshairMove) {
      chart.subscribeCrosshairMove((param) => {
        if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
          onCrosshairMove(null)
          return
        }

        const priceData = param.seriesData.get(lineSeries)
        if (priceData && 'value' in priceData) {
          onCrosshairMove(priceData.value)
        }
      })
    }

    return () => {
      window.removeEventListener("resize", handleResize)
      chart.remove()
    }
  }, [chartData, volumeData, onCrosshairMove])

  return chartContainerRef
}