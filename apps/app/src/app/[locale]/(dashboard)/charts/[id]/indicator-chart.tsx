'use client'

import { useRef, useEffect } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle, LineSeries, Time, ISeriesApi } from 'lightweight-charts'

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
}

interface IndicatorChartProps {
  indicators: IndicatorData
  displaySettings: IndicatorSettings
}

export function IndicatorChart({ indicators, displaySettings }: IndicatorChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())

  useEffect(() => {
    if (!chartContainerRef.current) return

    // Check if any indicators are enabled
    const hasActiveIndicators = Object.values(displaySettings).some(Boolean)
    if (!hasActiveIndicators) return

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
      timeScale: { 
        visible: false, // Hide the time axis
        borderVisible: false 
      },
    })

    // Clear existing series
    seriesRefs.current.forEach(series => {
      try {
        chart.removeSeries(series)
      } catch {
        // Series might already be removed
      }
    })
    seriesRefs.current.clear()

    // Add zero line reference
    const zeroLineSeries = chart.addSeries(LineSeries, {
      lineWidth: 1,
      color: '#ffffff20',
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    
    // Create zero line data if we have indicator data
    if (indicators.waveTrend1.length > 0) {
      const zeroLineData = indicators.waveTrend1.map(point => ({
        time: point.time,
        value: 0
      }))
      zeroLineSeries.setData(zeroLineData)
    }

    // WaveTrend indicators
    if (displaySettings.showWaveTrend) {
      if (indicators.waveTrend1.length) {
        const wt1Series = chart.addSeries(LineSeries, {
          lineWidth: 2,
          color: '#00FFEB',
          title: 'WT1',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        wt1Series.setData(indicators.waveTrend1)
        seriesRefs.current.set('wt1', wt1Series)
      }

      if (indicators.waveTrend2.length) {
        const wt2Series = chart.addSeries(LineSeries, {
          lineWidth: 2,
          color: '#0041FF',
          title: 'WT2',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        wt2Series.setData(indicators.waveTrend2)
        seriesRefs.current.set('wt2', wt2Series)
      }
    }

    // Money Flow indicators
    if (displaySettings.showFastMoneyFlow && indicators.fastMoneyFlow.length) {
      const fastMFSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: '#00FF0860',
        title: 'Fast MF',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      fastMFSeries.setData(indicators.fastMoneyFlow)
      seriesRefs.current.set('fastMF', fastMFSeries)
    }

    if (displaySettings.showSlowMoneyFlow && indicators.slowMoneyFlow.length) {
      const slowMFSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: '#FF000060',
        title: 'Slow MF',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      slowMFSeries.setData(indicators.slowMoneyFlow)
      seriesRefs.current.set('slowMF', slowMFSeries)
    }

    // RSI
    if (displaySettings.showRSI && indicators.rsiValues.length) {
      const rsiSeries = chart.addSeries(LineSeries, {
        lineWidth: 2,
        color: '#D4F321',
        title: 'RSI',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      rsiSeries.setData(indicators.rsiValues)
      seriesRefs.current.set('rsi', rsiSeries)
    }

    // Stochastic RSI
    if (displaySettings.showStochRSI) {
      if (indicators.stochK.length) {
        const stochKSeries = chart.addSeries(LineSeries, {
          lineWidth: 2,
          color: '#F700FF',
          title: 'Stoch %K',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        stochKSeries.setData(indicators.stochK)
        seriesRefs.current.set('stochK', stochKSeries)
      }

      if (indicators.stochD.length) {
        const stochDSeries = chart.addSeries(LineSeries, {
          lineWidth: 2,
          color: '#2195F3',
          title: 'Stoch %D',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        stochDSeries.setData(indicators.stochD)
        seriesRefs.current.set('stochD', stochDSeries)
      }
    }

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: 200, // Smaller height for indicators
        })
      }
    }

    window.addEventListener("resize", handleResize)
    handleResize()

    return () => {
      window.removeEventListener("resize", handleResize)
      chart.remove()
    }
  }, [indicators, displaySettings])

  // Don't render if no indicators are active
  const hasActiveIndicators = Object.values(displaySettings).some(Boolean)
  if (!hasActiveIndicators) return null

  return (
    <div className="mt-4">
      <div ref={chartContainerRef} />
    </div>
  )
}