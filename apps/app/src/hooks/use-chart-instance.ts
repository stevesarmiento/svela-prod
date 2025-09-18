'use client'

import { useEffect, useRef, useState } from 'react'
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

function createTooltipContent(price: number, percentageChange: number, timestamp: number, volume?: number, hullData?: { mhull?: number; shull?: number }, ohlcData?: { open: number; high: number; low: number; close: number }) {
  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(2)}K`
    return `$${vol.toFixed(2)}`
  }

  const formatPrice = (price: number) => {
    return '$' + price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  // Date header
  const dateHeader = React.createElement(
    'div',
    { className: 'mb-3 text-[11px] text-zinc-400 font-medium' },
    new Date(timestamp).toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric'
    })
  )

  // Divider
  const divider = React.createElement(
    'div',
    { className: 'w-full h-[1px] mb-3 bg-zinc-700/50 scale-125' }
  )

  // Price row
  const priceRow = React.createElement(
    'div',
    { className: 'flex items-center justify-between' },
    React.createElement('span', { className: 'text-[11px] text-zinc-400' }, 'Price'),
    React.createElement(
      'div',
      { className: 'flex items-center gap-2' },
      React.createElement(
        'span',
        { 
          className: `text-[10px] font-mono px-1.5 h-4 rounded ${percentageChange >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`
        },
        (percentageChange > 0 ? '+' : '') + percentageChange.toFixed(2) + '%'
      ),
      React.createElement('span', { className: 'text-[11px] font-mono font-bold' }, formatPrice(price))
    )
  )

  // Hull MA row (conditional)
  const hullRow = hullData?.mhull !== undefined ? React.createElement(
    'div',
    { className: 'flex items-center justify-between' },
    React.createElement('span', { className: 'text-[11px] text-zinc-400' }, 'Hull MA'),
    React.createElement('span', { className: 'text-[11px] font-mono text-blue-300' }, formatPrice(hullData.mhull))
  ) : null

  // Volume row (conditional)
  const volumeRow = volume !== undefined ? React.createElement(
    'div',
    { className: 'flex items-center justify-between' },
    React.createElement('span', { className: 'text-[11px] text-zinc-400' }, 'Volume'),
    React.createElement('span', { className: 'text-[11px] font-mono text-zinc-300' }, formatVolume(volume))
  ) : null

  // OHLC rows (conditional)
  const ohlcRows = ohlcData ? [
    React.createElement(
      'div',
      { className: 'flex items-center justify-between' },
      React.createElement('span', { className: 'text-[11px] text-zinc-400' }, 'Open'),
      React.createElement('span', { className: 'text-[11px] font-mono text-zinc-300' }, formatPrice(ohlcData.open))
    ),
    React.createElement(
      'div',
      { className: 'flex items-center justify-between' },
      React.createElement('span', { className: 'text-[11px] text-zinc-400' }, 'High'),
      React.createElement('span', { className: 'text-[11px] font-mono text-emerald-400' }, formatPrice(ohlcData.high))
    ),
    React.createElement(
      'div',
      { className: 'flex items-center justify-between' },
      React.createElement('span', { className: 'text-[11px] text-zinc-400' }, 'Low'),
      React.createElement('span', { className: 'text-[11px] font-mono text-rose-400' }, formatPrice(ohlcData.low))
    ),
    React.createElement(
      'div',
      { className: 'flex items-center justify-between' },
      React.createElement('span', { className: 'text-[11px] text-zinc-400' }, 'Close'),
      React.createElement('span', { className: 'text-[11px] font-mono text-zinc-300' }, formatPrice(ohlcData.close))
    )
  ] : []

  // Combine all rows
  const dataRows = [priceRow, hullRow, volumeRow, ...ohlcRows].filter(Boolean)

  return React.createElement(
    'div',
    { className: 'flex flex-col gap-1 overflow-hidden' },
    React.createElement(
      'div',
      { className: 'px-4 py-3' },
      dateHeader,
      divider,
      React.createElement(
        'div',
        { className: 'flex flex-col gap-2' },
        ...dataRows
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
  ohlcvData?: OHLCVDataPoint[],
  externalIsDarkMode?: boolean
) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())

  // Theme detection hook - use external if provided, otherwise internal detection
  const [internalIsDarkMode, setInternalIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches ||
           document.documentElement.classList.contains('dark')
  })

  // Use external isDarkMode if provided, otherwise use internal
  const isDarkMode = externalIsDarkMode !== undefined ? externalIsDarkMode : internalIsDarkMode
  
  console.log('📊 [useChartInstance] Theme state:', { 
    externalIsDarkMode, 
    internalIsDarkMode, 
    finalIsDarkMode: isDarkMode,
    hasExternalTheme: externalIsDarkMode !== undefined
  })

  // Listen for theme changes (only if not using external)
  useEffect(() => {
    if (typeof window === 'undefined' || externalIsDarkMode !== undefined) return
    console.log('📊 [useChartInstance] Setting up internal theme listeners')

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const observer = new MutationObserver(() => {
      const newDarkMode = mediaQuery.matches || document.documentElement.classList.contains('dark')
      console.log('📊 [useChartInstance] Internal theme change detected:', { newDarkMode })
      setInternalIsDarkMode(newDarkMode)
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    const handleChange = () => {
      const newDarkMode = mediaQuery.matches || document.documentElement.classList.contains('dark')
      console.log('📊 [useChartInstance] Internal media query changed:', { newDarkMode })
      setInternalIsDarkMode(newDarkMode)
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      console.log('📊 [useChartInstance] Cleaning up internal theme listeners')
      observer.disconnect()
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [externalIsDarkMode])

  useEffect(() => {
    if (!chartContainerRef.current || (!chartData.length && !ohlcvData?.length)) return
    
    console.log('📊 [useChartInstance] Creating chart with theme:', { 
      isDarkMode, 
      textColor: isDarkMode ? "#ffffff" : "#000000",
      chartDataLength: chartData.length,
      ohlcvDataLength: ohlcvData?.length || 0
    })

    const chart = createChart(chartContainerRef.current, {
      handleScale: false,
      handleScroll: false,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDarkMode ? "#ffffff" : "#000000",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false, color: isDarkMode ? "#e5e7eb20" : "#00000020", style: LineStyle.Dotted },
        horzLines: { visible: false, color: isDarkMode ? "#f5f5f510" : "#00000010", style: LineStyle.Dotted },
      },
      rightPriceScale: { 
        borderVisible: false, 
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { labelVisible: true, width: 1, color: isDarkMode ? "#d1d5db40" : "#00000040", visible: true, style: LineStyle.Solid },
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
      const priceLineColor = isDarkMode ? '#ffffff' : '#000000'
      console.log('📊 [useChartInstance] Creating price line series:', { 
        isDarkMode, 
        priceLineColor,
        lineWidth: 1,
        chartType: 'line'
      })
      
      priceSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        lastValueVisible: true,
        visible: true,
        priceLineVisible: false,
        color: priceLineColor,
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      })
      priceSeries.setData(chartData)
      console.log('📊 [useChartInstance] Price line series created and data set')
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: isDarkMode ? '#ffffff50' : '#00000050',
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
      // Use theme-aware colors for Hull Suite
      const baseHullColor = isDarkMode ? 'hsl(210, 40%, 75%)' : 'hsl(210, 60%, 35%)'
      const hullPastelColor = addOpacityToColor(pastelColors[0] || baseHullColor, isDarkMode ? 0.4 : 0.8)
      
      console.log('📊 [useChartInstance] Creating Hull Suite overlay:', { 
        isDarkMode, 
        baseHullColor, 
        hullPastelColor, 
        showHullSuite: displaySettings?.showHullSuite,
        mhullLength: hullSuiteData.mhull.length,
        shullLength: hullSuiteData.shull.length
      })
      
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
            lastValueVisible: true,
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
    tooltipEl.className = "fixed hidden overflow-hidden text-[11px] text-white rounded-xl w-[200px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl bg-zinc-900/95 border border-zinc-700/50 transition-all duration-100 ease-in-out"
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
      const volumeData = param.seriesData.get(volumeSeries)
      let currentPrice: number | null = null
      let currentVolume: number | undefined = undefined
      
      if (priceData) {
        if (chartType === 'candlestick' && 'close' in priceData) {
          currentPrice = priceData.close
        } else if ('value' in priceData) {
          currentPrice = priceData.value
        }
      }

      if (volumeData && 'value' in volumeData) {
        currentVolume = volumeData.value
      }

      // Get Hull Suite data for current time
      let currentHullData: { mhull?: number; shull?: number } | undefined = undefined
      if (hullSuiteData && displaySettings?.showHullSuite) {
        const currentTime = param.time
        
        // Find matching Hull MA data
        const mhullPoint = hullSuiteData.mhull.find(point => point.time === currentTime)
        const shullPoint = hullSuiteData.shull.find(point => point.time === currentTime)
        
        if (mhullPoint || shullPoint) {
          currentHullData = {
            mhull: mhullPoint?.value,
            shull: shullPoint?.value
          }
        }
      }

      // Get OHLC data for current time (find closest match)
      let currentOHLCData: { open: number; high: number; low: number; close: number } | undefined = undefined
      if (ohlcvData && ohlcvData.length > 0) {
        const currentTime = param.time as number
        
        // Find the closest OHLC data point by timestamp
        let closestPoint = ohlcvData[0]!
        let minDiff = Math.abs((closestPoint.time as number) - currentTime)
        
        for (const point of ohlcvData) {
          const diff = Math.abs((point.time as number) - currentTime)
          if (diff < minDiff) {
            minDiff = diff
            closestPoint = point
          }
        }
        
        // Use the closest point if it's within a reasonable range (e.g., 2 hours = 7200 seconds)
        if (minDiff <= 7200) {
          currentOHLCData = {
            open: closestPoint.open,
            high: closestPoint.high,
            low: closestPoint.low,
            close: closestPoint.close
          }
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
        tooltipRoot.render(createTooltipContent(currentPrice, percentageChange, Number(param.time) * 1000, currentVolume, currentHullData, currentOHLCData))

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
  }, [chartData, volumeData, indicators, displaySettings, hullSuiteData, onCrosshairMove, chartType, ohlcvData, isDarkMode, externalIsDarkMode])

  return chartContainerRef
}