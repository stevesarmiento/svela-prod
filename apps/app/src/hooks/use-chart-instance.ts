'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle, LineSeries, HistogramSeries, LastPriceAnimationMode, Time, ISeriesApi } from 'lightweight-charts'

interface PriceDataPoint {
  time: Time
  value: number
}

interface VolumeDataPoint {
  time: Time
  value: number
  color?: string
}

interface IndicatorData {
  waveTrend1: Array<{ time: Time; value: number }>
  waveTrend2: Array<{ time: Time; value: number }>
  fastMoneyFlow: Array<{ time: Time; value: number }>
  slowMoneyFlow: Array<{ time: Time; value: number }>
  rsiValues: Array<{ time: Time; value: number }>
  stochK: Array<{ time: Time; value: number }>
  stochD: Array<{ time: Time; value: number }>
}

interface IndicatorSettings {
  showWaveTrend: boolean
  showFastMoneyFlow: boolean
  showSlowMoneyFlow: boolean
  showRSI: boolean
  showStochRSI: boolean
  showHullSuite: boolean
}

interface HullSuiteData {
  mhull: Array<{ time: Time; value: number }>
  shull: Array<{ time: Time; value: number }>
  trend: Array<{ time: Time; isUp: boolean; color?: string }>
}

export function useChartInstance(
  chartData: PriceDataPoint[], 
  volumeData: VolumeDataPoint[], 
  indicators?: IndicatorData,
  displaySettings?: IndicatorSettings,
  hullSuiteData?: HullSuiteData,
  onCrosshairMove?: (price: number | null) => void
) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return

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
      rightPriceScale: { 
        borderVisible: false, 
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { labelVisible: true, width: 1, color: "#d1d5db40", visible: true, style: LineStyle.Solid },
        horzLine: { visible: false, labelVisible: false },
      },
      timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false },
    })

    // Only price and volume series
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

    // Add Hull Suite overlay if enabled
    if (displaySettings?.showHullSuite && hullSuiteData) {
      // Direct RGBA color with opacity for Hull Suite lines
      const directOpacityColor = 'rgba(107, 142, 173, 0.3)' // Direct opacity control
      
      // Main Hull line (MHULL)
      if (hullSuiteData.mhull.length > 0) {
        // Filter out any remaining NaN values and validate data
        const validMhullData = hullSuiteData.mhull.filter(point => 
          !isNaN(point.value) && 
          isFinite(point.value) && 
          point.time !== undefined
        )

        if (validMhullData.length > 0) {
          const mhullSeries = chart.addSeries(LineSeries, {
            lineWidth: 1,
            color: directOpacityColor, // Test direct RGBA
            lineStyle: LineStyle.Dotted,
            lastValueVisible: true,
            priceLineVisible: false,
          })
          
          mhullSeries.setData(validMhullData)
          seriesRefs.current.set('mhull', mhullSeries)
        }
      }

      // Secondary Hull line for band (SHULL)
      if (hullSuiteData.shull.length > 0) {
        const validShullData = hullSuiteData.shull.filter(point => 
          !isNaN(point.value) && 
          isFinite(point.value) && 
          point.time !== undefined
        )

        if (validShullData.length > 0) {
          const shullSeries = chart.addSeries(LineSeries, {
            lineWidth: 1,
            color: directOpacityColor, // Test direct RGBA
            lineStyle: LineStyle.Dotted,
            lastValueVisible: false,
            priceLineVisible: false,
          })
          
          shullSeries.setData(validShullData)
          seriesRefs.current.set('shull', shullSeries)
        }
      }
    }

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
  }, [chartData, volumeData, indicators, displaySettings, hullSuiteData, onCrosshairMove])

  return chartContainerRef
}