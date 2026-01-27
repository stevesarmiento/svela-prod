'use client'

import { useRef, useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { calculateBollingerBands, type BollingerBandsConfig } from '@/hooks/market-vision/bollinger-bands'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { cn } from '@v1/ui/cn'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'

interface BollingerBandsDisplaySettings {
  showIndicator: boolean
  showBasis: boolean
  showBands: boolean
  showBreaches: boolean
}

interface BollingerBandsChartProps {
  data: OHLCVDataPoint[]
  config?: Partial<BollingerBandsConfig>
  height?: number
  showTimeAxis?: boolean
}

// Generate consistent pastel colors
const BB_CHART_COLORS = generatePastelColors(8)
const COLORS = {
  rsi: BB_CHART_COLORS[0] || 'hsl(340, 45%, 78%)',        // Soft pink for RSI
  mfi: BB_CHART_COLORS[1] || 'hsl(160, 42%, 72%)',        // Soft green for MFI
  basis: BB_CHART_COLORS[2] || 'hsl(0, 60%, 70%)',        // Soft red for basis
  bands: BB_CHART_COLORS[3] || 'hsl(210, 40%, 75%)',      // Soft blue for bands
  fillArea: addOpacityToColor(BB_CHART_COLORS[3] || 'hsl(210, 40%, 75%)', 0.1),
  overbought: BB_CHART_COLORS[4] || 'hsl(0, 60%, 70%)',   // Red for overbought
  oversold: BB_CHART_COLORS[5] || 'hsl(120, 60%, 70%)',   // Green for oversold
}

// Define legend items with their properties
interface LegendItem {
  key: keyof BollingerBandsDisplaySettings
  name: string
  color: string
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    key: 'showIndicator',
    name: 'RSI/MFI',
    color: COLORS.rsi
  },
  {
    key: 'showBasis', 
    name: 'Basis (SMA)',
    color: COLORS.basis
  },
  {
    key: 'showBands',
    name: 'Bollinger Bands',
    color: COLORS.bands
  },
  {
    key: 'showBreaches',
    name: 'Breach Highlights',
    color: COLORS.overbought
  }
]

// Default configuration
const DEFAULT_CONFIG: BollingerBandsConfig = {
  drawRSI: true,
  drawMFI: false,
  highlightBreaches: true,
  length: 14,
  source: 'hlc3',
  bbLength: 50,
  multiplier: 2.0,
  lineWidth: 2,
  fillOpacity: 0.1
}

export function BollingerBandsChart({ 
  data, 
  config,
  height = 250,
  showTimeAxis = false 
}: BollingerBandsChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line' | 'Area'>>>(new Map())
  const lightweightChartsRef = useRef<LightweightChartsModule | null>(null)

  // State for controlling visibility of each component
  const [displaySettings, setDisplaySettings] = useState<BollingerBandsDisplaySettings>({
    showIndicator: true,
    showBasis: true,
    showBands: true,
    showBreaches: true
  })

  const [hoveredIndicator, setHoveredIndicator] = useState<string | null>(null)

  // Merge with default config
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  // Calculate Bollinger Bands
  const bbResult = calculateBollingerBands(data, finalConfig)

  // Toggle indicator visibility
  const toggleIndicator = (key: keyof BollingerBandsDisplaySettings) => {
    setDisplaySettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

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
        handleScale: true,
        handleScroll: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#ffffff50",
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
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
    if (!chartRef.current || !bbResult) return

    const lightweightCharts = lightweightChartsRef.current
    if (!lightweightCharts) return
    const { LineSeries, LineStyle } = lightweightCharts

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



    // Add Upper Band
    if (displaySettings.showBands && bbResult.upper.length > 0) {
      const upperSeries = chart.addSeries(LineSeries, {
        lineWidth: hoveredIndicator === 'showBands' ? 2 : 1,
        color: hoveredIndicator && hoveredIndicator !== 'showBands' 
          ? addOpacityToColor(bbResult.colors.bands, 0.3) 
          : bbResult.colors.bands,
        title: '',
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      upperSeries.setData(bbResult.upper as { time: Time; value: number }[])
      seriesRefs.current.set('upper', upperSeries)
    }

    // Add Lower Band
    if (displaySettings.showBands && bbResult.lower.length > 0) {
      const lowerSeries = chart.addSeries(LineSeries, {
        lineWidth: hoveredIndicator === 'showBands' ? 2 : 1,
        color: hoveredIndicator && hoveredIndicator !== 'showBands'
          ? addOpacityToColor(bbResult.colors.bands, 0.3)
          : bbResult.colors.bands,
        title: '',
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      lowerSeries.setData(bbResult.lower as { time: Time; value: number }[])
      seriesRefs.current.set('lower', lowerSeries)
    }

    // Add Basis (SMA)
    if (displaySettings.showBasis && bbResult.basis.length > 0) {
      const basisSeries = chart.addSeries(LineSeries, {
        lineWidth: hoveredIndicator === 'showBasis' ? 2 : 1,
        color: hoveredIndicator && hoveredIndicator !== 'showBasis'
          ? addOpacityToColor(bbResult.colors.basis, 0.3)
          : bbResult.colors.basis,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      basisSeries.setData(bbResult.basis as { time: Time; value: number }[])
      seriesRefs.current.set('basis', basisSeries)
    }

    // Add Main Indicator (RSI or MFI)
    if (displaySettings.showIndicator && bbResult.indicator.length > 0) {
      const indicatorSeries = chart.addSeries(LineSeries, {
        lineWidth: hoveredIndicator === 'showIndicator' ? 3 : 2,
        color: hoveredIndicator && hoveredIndicator !== 'showIndicator'
          ? addOpacityToColor(bbResult.colors.indicator, 0.3)
          : bbResult.colors.indicator,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      indicatorSeries.setData(bbResult.indicator as { time: Time; value: number }[])
      seriesRefs.current.set('indicator', indicatorSeries)
    }

    // Add Breach Highlighting
    if (displaySettings.showBreaches) {
      // Overbought breaches (above upper band)
      if (bbResult.overboughtBreaches.length > 0) {
        const obSeries = chart.addSeries(LineSeries, {
          lineWidth: 3,
          color: bbResult.colors.overbought,
          title: '',
          pointMarkersVisible: true,
          pointMarkersRadius: 4,
          lineVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        obSeries.setData(bbResult.overboughtBreaches.map(point => ({
          ...point,
          time: point.time as Time,
          color: bbResult.colors.overbought
        })))
        seriesRefs.current.set('overbought', obSeries)
      }

      // Oversold breaches (below lower band)
      if (bbResult.oversoldBreaches.length > 0) {
        const osSeries = chart.addSeries(LineSeries, {
          lineWidth: 3,
          color: bbResult.colors.oversold,
          title: '',
          pointMarkersVisible: true,
          pointMarkersRadius: 4,
          lineVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        osSeries.setData(bbResult.oversoldBreaches.map(point => ({
          ...point,
          time: point.time as Time,
          color: bbResult.colors.oversold
        })))
        seriesRefs.current.set('oversold', osSeries)
      }
    }

    chart.timeScale().fitContent()
  }, [bbResult, displaySettings, hoveredIndicator])

  // Don't render if no data
  if (!data.length) return null

  return (
    <div className="w-full p-1">
      {/* Legend at top */}
      <div className="flex flex-wrap items-center gap-2 p-4 pb-2">
        {LEGEND_ITEMS.map((item) => {
          const isActive = displaySettings[item.key]
          const isHovered = hoveredIndicator === item.key
          const isOtherHovered = hoveredIndicator && hoveredIndicator !== item.key
          
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg px-3 py-1 relative group",
                isHovered ? "bg-white/10" : "hover:bg-white/5",
                !isActive && "opacity-50",
                isOtherHovered && "opacity-30"
              )}
              style={{ 
                backgroundColor: isHovered ? addOpacityToColor(item.color, 0.1) : undefined 
              }}
              onMouseEnter={() => setHoveredIndicator(item.key)}
              onMouseLeave={() => setHoveredIndicator(null)}
              onClick={() => toggleIndicator(item.key)}
            >
              <div 
                className="w-1 h-4 rounded-full transition-all duration-200"
                style={{ 
                  backgroundColor: isActive ? item.color : addOpacityToColor(item.color, 0.3)
                }}
              />
              <span className={cn(
                "text-sm font-medium transition-colors duration-200",
                isActive ? "text-white" : "text-muted-foreground"
              )}>
                {item.name}
              </span>
              
              {/* Active indicator */}
              <div className={cn(
                "w-2 h-2 rounded-full transition-all duration-200",
                isActive ? "bg-white" : "bg-transparent"
              )} />
            </div>
          )
        })}
      </div>
      
      {/* Chart Content - Full Width */}
      <div className="">
        <div className="p-0 relative">
            {/* Check if no indicators are active */}
            {Object.values(displaySettings).some(Boolean) ? (
              <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
            ) : (
              <div className="flex items-center justify-center w-full" style={{ height: `${height}px` }}>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Select indicators to display</p>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

// Export types for use in other components
export type { BollingerBandsDisplaySettings } 