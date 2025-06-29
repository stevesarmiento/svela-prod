'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle, LineSeries, CandlestickSeries, HistogramSeries, LastPriceAnimationMode, Time, ISeriesApi } from 'lightweight-charts'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { createRoot } from "react-dom/client"
import React from 'react'

interface PriceDataPoint {
  time: Time
  value: number
}

interface OHLCVDataPoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume?: number
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

type ChartType = 'line' | 'candlestick'

function createTooltipContent(price: number, percentageChange: number, timestamp: number) {
  return React.createElement(
    'div',
    { className: 'flex flex-col gap-1 overflow-hidden' },
    React.createElement(
      'div',
      { className: 'px-3 pb-1 pt-2' },
      React.createElement(
        'div',
        { className: 'mb-2 text-xs text-muted-foreground' },
        new Date(timestamp).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      ),
      React.createElement(
        'div',
        { className: 'flex flex-col gap-1' },
        React.createElement(
          'div',
          { className: 'flex items-center gap-2' },
          React.createElement(
            'span',
            { className: 'text-sm font-mono font-bold' },
            '$' + price.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })
          )
        ),
        React.createElement(
          'div',
          { className: 'flex items-center gap-2' },
          React.createElement(
            'span',
            { 
              className: `text-sm font-mono ${percentageChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`
            },
            (percentageChange > 0 ? '+' : '') + percentageChange.toFixed(2) + '%'
          )
        )
      )
    )
  )
}

export function useChartInstance(
  chartData: PriceDataPoint[], 
  volumeData: VolumeDataPoint[], 
  indicators?: IndicatorData,
  displaySettings?: IndicatorSettings,
  hullSuiteData?: HullSuiteData,
  onCrosshairMove?: (price: number | null) => void,
  chartType: ChartType = 'line',
  ohlcvData?: OHLCVDataPoint[]
) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())

  useEffect(() => {
    if (!chartContainerRef.current || (!chartData.length && !ohlcvData?.length)) return

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
        horzLines: { visible: false, color: "#f5f5f510", style: LineStyle.Dotted },
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

    let priceSeries: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>

    // Generate pastel colors for candlesticks
    const pastelColors = generatePastelColors(4)
    const upColorBase = pastelColors[2] || 'hsl(160, 42%, 72%)'
    const downColorBase = pastelColors[1] || 'hsl(340, 45%, 78%)'
    
    const upColor = addOpacityToColor(upColorBase, 0.4)
    const downColor = addOpacityToColor(downColorBase, 0.4)
    
    const upBorderColor = addOpacityToColor(upColorBase, 0.8)
    const downBorderColor = addOpacityToColor(downColorBase, 0.8)

    // Create price series based on chart type
    if (chartType === 'candlestick' && ohlcvData?.length) {
      priceSeries = chart.addSeries(CandlestickSeries, {
        upColor: upColor,
        downColor: downColor,
        borderVisible: true,
        borderUpColor: upBorderColor,
        borderDownColor: downBorderColor,
        wickUpColor: upBorderColor,
        wickDownColor: downBorderColor,
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      })
      priceSeries.setData(ohlcvData)
    } else {
      priceSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        lastValueVisible: true,
        visible: true,
        priceLineVisible: false,
        color: '#ffffff',
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      })
      priceSeries.setData(chartData)
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#ffffff40',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })
    
    volumeSeries.setData(volumeData)

    chart.timeScale().fitContent()

    // Add Hull Suite overlay if enabled
    if (displaySettings?.showHullSuite && hullSuiteData) {
      const hullPastelColor = addOpacityToColor(pastelColors[0] || 'hsl(210, 40%, 75%)', 0.4)
      
      if (hullSuiteData.mhull.length > 0) {
        const validMhullData = hullSuiteData.mhull.filter(point => 
          !isNaN(point.value) && 
          isFinite(point.value) && 
          point.time !== undefined
        )

        if (validMhullData.length > 0) {
          const mhullSeries = chart.addSeries(LineSeries, {
            lineWidth: 1,
            color: hullPastelColor,
            lineStyle: LineStyle.Dotted,
            lastValueVisible: true,
            priceLineVisible: false,
          })
          
          mhullSeries.setData(validMhullData)
          seriesRefs.current.set('mhull', mhullSeries)
        }
      }

      if (hullSuiteData.shull.length > 0) {
        const validShullData = hullSuiteData.shull.filter(point => 
          !isNaN(point.value) && 
          isFinite(point.value) && 
          point.time !== undefined
        )

        if (validShullData.length > 0) {
          const shullSeries = chart.addSeries(LineSeries, {
            lineWidth: 1,
            color: hullPastelColor,
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

    // Add tooltip
    const tooltipEl = document.createElement("div")
    const tooltipRoot = createRoot(tooltipEl)
    tooltipEl.className = "fixed hidden text-xs text-foreground rounded-xl shadow-xl pointer-events-none z-30 backdrop-blur-sm bg-background/90 border border-border transition-all duration-100 ease-in-out"
    document.body.appendChild(tooltipEl)

    // Crosshair handling with tooltip
    chart.subscribeCrosshairMove((param) => {
      if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
        tooltipEl.style.display = "none"
        if (onCrosshairMove) {
          onCrosshairMove(null)
        }
        return
      }

      const priceData = param.seriesData.get(priceSeries)
      let currentPrice: number | null = null
      
      if (priceData) {
        if (chartType === 'candlestick' && 'close' in priceData) {
          currentPrice = priceData.close
        } else if ('value' in priceData) {
          currentPrice = priceData.value
        }
      }

      if (currentPrice && onCrosshairMove) {
        onCrosshairMove(currentPrice)
      }

      // Show tooltip with price info
      if (currentPrice && chartContainerRef.current) {
        const chartRect = chartContainerRef.current.getBoundingClientRect()
        
        const startPrice = chartData.length > 0 ? chartData[0]?.value : (ohlcvData && ohlcvData.length > 0 ? ohlcvData[0]?.close : currentPrice)
        const percentageChange = startPrice ? ((currentPrice - startPrice) / startPrice) * 100 : 0

        tooltipEl.style.display = "block"
        tooltipRoot.render(createTooltipContent(currentPrice, percentageChange, Number(param.time) * 1000))

        const tooltipWidth = tooltipEl.offsetWidth
        const tooltipHeight = tooltipEl.offsetHeight

        let left = chartRect.left + param.point.x + 15
        let top = chartRect.top + param.point.y - tooltipHeight / 2

        if (left + tooltipWidth > window.innerWidth - 10) {
          left = chartRect.left + param.point.x - tooltipWidth - 15
        }

        if (top + tooltipHeight > window.innerHeight - 10) {
          top = window.innerHeight - tooltipHeight - 10
        }

        if (top < 10) {
          top = 10
        }

        tooltipEl.style.left = `${left}px`
        tooltipEl.style.top = `${top}px`
      } else {
        tooltipEl.style.display = "none"
      }
    })

    return () => {
      window.removeEventListener("resize", handleResize)
      requestAnimationFrame(() => {
        tooltipRoot.unmount()
        document.body.removeChild(tooltipEl)
      })
      chart.remove()
    }
  }, [chartData, volumeData, indicators, displaySettings, hullSuiteData, onCrosshairMove, chartType, ohlcvData])

  return chartContainerRef
}