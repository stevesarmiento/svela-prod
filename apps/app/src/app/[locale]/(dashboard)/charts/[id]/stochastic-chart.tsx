'use client'

import { useRef, useEffect, useMemo } from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { calculateStochasticIndicator, getAllRSIDivergences, type StochasticConfig, type DivergencePoint } from '@/hooks/market-vision/stochastic'
import { rsi } from '@/hooks/market-vision/technical-indicators'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'

interface StochasticDisplaySettings {
  showK: boolean
  showD: boolean
  showDoubleStochastic: boolean
  showLevels: boolean
  showRSIDivergences: boolean
}

interface StochasticChartProps {
  data: OHLCVDataPoint[]
  displaySettings: StochasticDisplaySettings
  config?: Partial<StochasticConfig>
  height?: number
  showTimeAxis?: boolean
}

// Generate consistent pastel colors for Stochastic indicators
const STOCHASTIC_COLORS = generatePastelColors(10)
const COLORS = {
  stochK: STOCHASTIC_COLORS[0] || 'hsl(210, 40%, 75%)',        // Soft blue for %K
  stochD: STOCHASTIC_COLORS[1] || 'hsl(340, 45%, 78%)',        // Soft pink for %D
  doubleStochK: STOCHASTIC_COLORS[2] || 'hsl(160, 42%, 72%)',  // Soft green for Double %K
  doubleStochD: STOCHASTIC_COLORS[3] || 'hsl(45, 55%, 78%)',   // Soft yellow for Double %D
  doubleRSIStochK: STOCHASTIC_COLORS[4] || 'hsl(280, 40%, 75%)', // Soft purple for Double RSI %K
  levels: addOpacityToColor(STOCHASTIC_COLORS[5] || 'hsl(120, 38%, 72%)', 0.3), // Soft sage for levels
  
  // RSI Divergence colors
  bullishDiv: STOCHASTIC_COLORS[6] || 'hsl(120, 60%, 70%)',   // Green for bullish divergences
  bearishDiv: STOCHASTIC_COLORS[7] || 'hsl(0, 60%, 70%)',     // Red for bearish divergences
  hiddenBullishDiv: STOCHASTIC_COLORS[8] || 'hsl(120, 40%, 60%)', // Dark green for hidden bullish
  hiddenBearishDiv: STOCHASTIC_COLORS[9] || 'hsl(0, 40%, 60%)',   // Dark red for hidden bearish
}

// Default stochastic configuration
const DEFAULT_STOCHASTIC_CONFIG: StochasticConfig = {
  show: true,
  type: 'Stochastic - Standard',
  source: 'Price',
  showType: 'K and D',
  kPeriod: 14,
  dPeriod: 3,
  smoothing: 3,
  rsiLength: 13,
  stochLength: 13,
  kSmoothing: 3,
  dSmoothing: 3,
  doubleStochK: 21,
  doubleStochD: 4,
  doubleStochSmoothing: 10,
  doubleRSIStochRSI: 14,
  doubleRSIStochLength: 14,
  doubleRSIStochKSmoothing: 3,
  doubleRSIStochDSmoothing: 3,
  brightness: 100
}

export function StochasticChart({ 
  data, 
  displaySettings, 
  config,
  height = 200,
  showTimeAxis = false 
}: StochasticChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const lightweightChartsRef = useRef<LightweightChartsModule | null>(null)

  // Merge with default config
  const finalConfig = { ...DEFAULT_STOCHASTIC_CONFIG, ...config }

  // Calculate stochastic indicators
  const stochasticResult = calculateStochasticIndicator(data, finalConfig)
  
  // Calculate RSI divergences if enabled
  const rsiDivergences: DivergencePoint[] = useMemo(() => {
    if (!displaySettings.showRSIDivergences || data.length === 0) return []
    
    const closeValues = data.map(d => d.close)
    const rsiValues = rsi(closeValues, 14) // Default RSI period of 14
    
    console.log('🔍 RSI Divergence Debug:')
    console.log('Data length:', data.length)
    console.log('RSI values sample:', rsiValues.slice(-10))
    console.log('Price data sample:', closeValues.slice(-10))
    
    // Use getAllRSIDivergences to scan entire dataset
    const allDivs = getAllRSIDivergences(data, rsiValues)
    console.log('Found divergences:', allDivs.length, allDivs)
    
    return allDivs
  }, [displaySettings.showRSIDivergences, data])

  useEffect(() => {
    if (!chartContainerRef.current) return

    // Check if any indicators are enabled
    const hasActiveIndicators = Object.values(displaySettings).some(Boolean)
    if (!hasActiveIndicators) return

    let isCancelled = false
    let cleanup: (() => void) | null = null

    // Capture the current seriesRefs for cleanup
    const currentSeriesRefs = seriesRefs.current

    void (async () => {
      const lightweightCharts = await loadLightweightCharts()
      lightweightChartsRef.current = lightweightCharts

      const { createChart, ColorType, CrosshairMode, LineStyle } = lightweightCharts

      if (isCancelled || !chartContainerRef.current) return

      const chart = createChart(chartContainerRef.current, {
          handleScale: false,
          handleScroll: false,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#ffffff50",
            attributionLogo: false,
          },
          grid: {
            vertLines: { visible: false },
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
          timeScale: { 
            visible: showTimeAxis,
            timeVisible: showTimeAxis,
            secondsVisible: false,
            borderVisible: false 
          },
        })

      chartRef.current = chart

      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: height,
          })
        }
      }

      window.addEventListener("resize", handleResize)
      handleResize()

      cleanup = () => {
        window.removeEventListener("resize", handleResize)
        chart.remove()
        chartRef.current = null
        currentSeriesRefs.clear()
      }
    })()

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [height, showTimeAxis, displaySettings])

  // Update series based on calculations and display settings
  useEffect(() => {
    if (!chartRef.current || !stochasticResult) return

    const lightweightCharts = lightweightChartsRef.current
    if (!lightweightCharts) return
    const { LineSeries, LineStyle } = lightweightCharts

    // Check if we have any data to display
    const hasStochasticData = (displaySettings.showK && stochasticResult.stochK.length > 0) ||
      (displaySettings.showD && stochasticResult.stochD.length > 0) ||
      (displaySettings.showDoubleStochastic && (
        (stochasticResult.doubleStochK && stochasticResult.doubleStochK.length > 0) ||
        (stochasticResult.doubleStochD && stochasticResult.doubleStochD.length > 0) ||
        (stochasticResult.doubleRSIStochK && stochasticResult.doubleRSIStochK.length > 0)
      ))

    if (!hasStochasticData) {
      return
    }

    const chart = chartRef.current
    
    // Clear existing series
    seriesRefs.current.forEach(series => {
      try {
        chart.removeSeries(series)
      } catch {
        // Series might already be removed
      }
    })
    seriesRefs.current.clear()

    // Add reference levels
    if (displaySettings.showLevels) {
      // Generate times for level lines
      const times = data.map(d => d.time)
      
      // Add 80 level (overbought)
      const overboughtLevel = times.map(time => ({ time: time as Time, value: 80 }))
      const obSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: addOpacityToColor(COLORS.levels, 0.6),
        title: '',
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      obSeries.setData(overboughtLevel)
      seriesRefs.current.set('ob', obSeries)

      // Add 20 level (oversold)
      const oversoldLevel = times.map(time => ({ time: time as Time, value: 20 }))
      const osSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: addOpacityToColor(COLORS.levels, 0.6),
        title: '',
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      osSeries.setData(oversoldLevel)
      seriesRefs.current.set('os', osSeries)

      // Add 50 level (middle)
      const middleLevel = times.map(time => ({ time: time as Time, value: 50 }))
      const midSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: '#ffffff40',
        title: '',
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      midSeries.setData(middleLevel)
      seriesRefs.current.set('mid', midSeries)
    }

    // Stochastic %K
    if (displaySettings.showK && stochasticResult.stochK.length > 0) {
      const stochKSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: COLORS.stochK,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      stochKSeries.setData(stochasticResult.stochK as { time: Time; value: number }[])
      seriesRefs.current.set('stochK', stochKSeries)
    }

    // Stochastic %D
    if (displaySettings.showD && stochasticResult.stochD.length > 0) {
      const stochDSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: COLORS.stochD,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      stochDSeries.setData(stochasticResult.stochD as { time: Time; value: number }[])
      seriesRefs.current.set('stochD', stochDSeries)
    }

    // Double Stochastic indicators
    if (displaySettings.showDoubleStochastic) {
      if (stochasticResult.doubleStochK && stochasticResult.doubleStochK.length > 0) {
        const doubleStochKSeries = chart.addSeries(LineSeries, {
          lineWidth: 1,
          color: COLORS.doubleStochK,
          title: '',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        doubleStochKSeries.setData(stochasticResult.doubleStochK as { time: Time; value: number }[])
        seriesRefs.current.set('doubleStochK', doubleStochKSeries)
      }

      if (stochasticResult.doubleStochD && stochasticResult.doubleStochD.length > 0) {
        const doubleStochDSeries = chart.addSeries(LineSeries, {
          lineWidth: 1,
          color: COLORS.doubleStochD,
          title: '',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        doubleStochDSeries.setData(stochasticResult.doubleStochD as { time: Time; value: number }[])
        seriesRefs.current.set('doubleStochD', doubleStochDSeries)
      }

      if (stochasticResult.doubleRSIStochK && stochasticResult.doubleRSIStochK.length > 0) {
        const doubleRSIStochKSeries = chart.addSeries(LineSeries, {
          lineWidth: 1,
          color: COLORS.doubleRSIStochK,
          title: '',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        doubleRSIStochKSeries.setData(stochasticResult.doubleRSIStochK as { time: Time; value: number }[])
        seriesRefs.current.set('doubleRSIStochK', doubleRSIStochKSeries)
      }
    }

    // Add RSI divergence lines
    if (displaySettings.showRSIDivergences && rsiDivergences.length > 0) {
      for (const divergence of rsiDivergences) {
        // Create divergence line data
        const divergenceLineData = [
          { time: divergence.startTime as Time, value: divergence.rsiStart },
          { time: divergence.endTime as Time, value: divergence.rsiEnd }
        ]
        
        // Choose color based on divergence type
        let lineColor = COLORS.bullishDiv
        let lineStyle = LineStyle.Solid
        
        switch (divergence.type) {
          case 'bullish':
            lineColor = COLORS.bullishDiv
            lineStyle = LineStyle.Solid
            break
          case 'bearish':
            lineColor = COLORS.bearishDiv
            lineStyle = LineStyle.Solid
            break
          case 'h_bullish':
            lineColor = COLORS.hiddenBullishDiv
            lineStyle = LineStyle.Dashed
            break
          case 'h_bearish':
            lineColor = COLORS.hiddenBearishDiv
            lineStyle = LineStyle.Dashed
            break
        }
        
        // Add divergence line
        const divergenceSeries = chart.addSeries(LineSeries, {
          lineWidth: 2,
          color: lineColor,
          title: '',
          lineStyle: lineStyle,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        divergenceSeries.setData(divergenceLineData)
        seriesRefs.current.set(`div_${divergence.startTime}_${divergence.endTime}`, divergenceSeries)
      }
    }

    chart.timeScale().fitContent()
  }, [stochasticResult, displaySettings, data, rsiDivergences])

  // Don't render if no indicators are active
  const hasActiveIndicators = Object.values(displaySettings).some(Boolean)
  if (!hasActiveIndicators || !data.length) return null

  return (
    <div className="relative px-6">
      <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
    </div>
  )
}

// Export types for use in other components
export type { StochasticDisplaySettings } 