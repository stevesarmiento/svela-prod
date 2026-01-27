'use client'

import { useRef, useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts'
import { createRoot } from 'react-dom/client'
import { useMarketVisionB, type MarketVisionBConfig } from '@/hooks/market-vision'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { cn } from '@v1/ui/cn'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'

interface MarketVisionDisplaySettings {
  showOscillator1: boolean
  showOscillator2: boolean
  showWaveTrend: boolean
  showMoneyFlow: boolean
  showLevels: boolean
}

interface MarketVisionChartProps {
  data: OHLCVDataPoint[]
  config?: Partial<MarketVisionBConfig>
  height?: number
  showTimeAxis?: boolean
}

interface TooltipIndicatorData {
  name: string
  color: string
  value: number
}

const TooltipContent = ({
  indicatorData,
  timestamp,
}: {
  indicatorData: TooltipIndicatorData[]
  timestamp: number
}) => {
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="px-4 py-3">
        <div className="mb-3 text-[11px] text-zinc-400 font-medium">
          {new Date(timestamp).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric'
          })}
        </div>
        <div className="w-full h-[1px] mb-3 bg-zinc-700/50 scale-125" />
        <div className="flex flex-col gap-2">
          {indicatorData.map((indicator) => (
            <div key={indicator.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-1 rounded-full"
                  style={{ backgroundColor: indicator.color }}
                />
                <span className="text-[11px] text-zinc-400">
                  {indicator.name}
                </span>
              </div>
              <span className="text-[11px] font-diatype-mono text-white font-bold">
                {indicator.value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Generate consistent pastel colors for MarketVision indicators
const MARKETVISION_COLORS = generatePastelColors(8)
const COLORS = {
  wt1: MARKETVISION_COLORS[0] || 'hsl(210, 40%, 75%)',           // Soft blue for WT1
  wt2: MARKETVISION_COLORS[1] || 'hsl(340, 45%, 78%)',           // Soft pink for WT2
  moneyFlow: MARKETVISION_COLORS[2] || 'hsl(160, 42%, 72%)',     // Soft green for Money Flow
  oscillator1: MARKETVISION_COLORS[3] || 'hsl(45, 55%, 78%)',   // Soft yellow for Oscillator 1
  oscillator2: MARKETVISION_COLORS[4] || 'hsl(280, 40%, 75%)',   // Soft purple for Oscillator 2
  crossUp: MARKETVISION_COLORS[5] || 'hsl(15, 50%, 76%)',       // Soft coral for positive crosses
  crossDown: MARKETVISION_COLORS[6] || 'hsl(190, 45%, 72%)',     // Soft cyan for negative crosses
  levels: addOpacityToColor(MARKETVISION_COLORS[7] || 'hsl(120, 38%, 72%)', 0.3), // Soft sage for levels
}

// Define legend items with their properties
interface LegendItem {
  key: keyof MarketVisionDisplaySettings
  name: string
  color: string
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    key: 'showWaveTrend',
    name: 'Wave Trend',
    color: COLORS.wt1
  },
  {
    key: 'showMoneyFlow', 
    name: 'Money Flow',
    color: COLORS.moneyFlow
  },
  {
    key: 'showOscillator1',
    name: 'RSI Oscillator',
    color: COLORS.oscillator1
  },
  {
    key: 'showOscillator2',
    name: 'MFI Oscillator',
    color: COLORS.oscillator2
  },
  {
    key: 'showLevels',
    name: 'Reference Levels',
    color: COLORS.levels
  }
]

export function MarketVisionChart({ 
  data, 
  config,
  height = 200,
  showTimeAxis = false 
}: MarketVisionChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const lightweightChartsRef = useRef<LightweightChartsModule | null>(null)

  // State for controlling visibility of each indicator
  const [displaySettings, setDisplaySettings] = useState<MarketVisionDisplaySettings>({
    showOscillator1: true,
    showOscillator2: true,
    showWaveTrend: true,
    showMoneyFlow: true,
    showLevels: false
  })

  const [hoveredIndicator, setHoveredIndicator] = useState<string | null>(null)

  // Calculate all MarketVision B indicators
  const calculations = useMarketVisionB(data, config)

  // Toggle indicator visibility
  const toggleIndicator = (key: keyof MarketVisionDisplaySettings) => {
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

      // Prefer observing the actual container size (avoids per-chart global resize listeners).
      let resizeObserver: ResizeObserver | null = null
      let resizeRafId: number | null = null
      let unsubscribeWindowResize: (() => void) | null = null

      if (typeof ResizeObserver !== "undefined" && chartContainerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId) cancelAnimationFrame(resizeRafId)
          resizeRafId = requestAnimationFrame(() => handleResize())
        })
        resizeObserver.observe(chartContainerRef.current)
      } else {
        unsubscribeWindowResize = subscribeToWindowResize(handleResize)
      }

      handleResize()

      // Add tooltip
      const tooltipEl = document.createElement("div")
      const tooltipRoot = createRoot(tooltipEl)
      tooltipEl.className = "fixed hidden overflow-hidden text-[11px] text-white rounded-xl w-[200px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl bg-zinc-900/95 border border-zinc-700/50 transition-all duration-100 ease-in-out"
      document.body.appendChild(tooltipEl)

      // Subscribe to crosshair move
      chart.subscribeCrosshairMove((param) => {
        if (
          param.point === undefined ||
          !param.time ||
          param.point.x < 0 ||
          param.point.y < 0
        ) {
          tooltipEl.style.display = "none"
          return
        }

        if (!chartContainerRef.current) return
        const chartRect = chartContainerRef.current.getBoundingClientRect()

        const indicatorData: TooltipIndicatorData[] = []
        
        // Get values from active series
        seriesRefs.current.forEach((series, key) => {
          const seriesData = param.seriesData.get(series) as LineData<Time>
          if (seriesData && typeof seriesData.value === 'number') {
            let name = ''
            let color = ''
            
            // Map series keys to display names and colors
            switch (key) {
              case 'wt1Line':
                name = 'WT1'
                color = COLORS.wt1
                break
              case 'wt2Line':
                name = 'WT2'
                color = COLORS.wt2
                break
              case 'fastMF':
                name = 'Money Flow'
                color = COLORS.moneyFlow
                break
              case 'slowMF':
                name = 'Slow MF'
                color = COLORS.moneyFlow
                break
              case 'osc1':
                name = config?.oscillator1?.type || 'RSI'
                color = COLORS.oscillator1
                break
              case 'osc2':
                name = config?.oscillator2?.type || 'MFI'
                color = COLORS.oscillator2
                break
              default:
                return // Skip reference lines and other series
            }
            
            if (name) {
              indicatorData.push({
                name,
                color,
                value: seriesData.value,
              })
            }
          }
        })

        if (indicatorData.length === 0) {
          tooltipEl.style.display = "none"
          return
        }

        tooltipEl.style.display = "block"
        tooltipRoot.render(
          <TooltipContent
            indicatorData={indicatorData}
            timestamp={Number(param.time) * 1000}
          />
        )

        const tooltipWidth = tooltipEl.offsetWidth
        const tooltipHeight = tooltipEl.offsetHeight

        // Position tooltip
        let left = chartRect.left + param.point.x + 15
        let top = chartRect.top + param.point.y - tooltipHeight / 2

        // Adjust if tooltip goes beyond right edge
        if (left + tooltipWidth > window.innerWidth - 10) {
          left = chartRect.left + param.point.x - tooltipWidth - 15
        }

        // Adjust if tooltip goes beyond bottom edge
        if (top + tooltipHeight > window.innerHeight - 10) {
          top = window.innerHeight - tooltipHeight - 10
        }

        // Adjust if tooltip goes beyond top edge
        if (top < 10) {
          top = 10
        }

        tooltipEl.style.left = `${left}px`
        tooltipEl.style.top = `${top}px`
      })

      cleanup = () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId)
        resizeObserver?.disconnect()
        unsubscribeWindowResize?.()
        requestAnimationFrame(() => {
          try {
            tooltipRoot.unmount()
          } catch {
            // noop
          }
          if (document.body.contains(tooltipEl)) {
            document.body.removeChild(tooltipEl)
          }
        })
        chart.remove()
        chartRef.current = null
        currentSeriesRefs.clear()
      }
    })()

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [height, showTimeAxis, displaySettings, config])

  // Update series based on calculations and display settings
  useEffect(() => {
    if (!chartRef.current || !calculations) return

    const lightweightCharts = lightweightChartsRef.current
    if (!lightweightCharts) return
    const { LineSeries, LineStyle } = lightweightCharts

    // Check if we have any data to display
    const hasWaveTrendData = displaySettings.showWaveTrend && 
      calculations.waveTrend && 
      calculations.waveTrend.wt1 && 
      calculations.waveTrend.wt1.length > 0
    
    const hasMoneyFlowData = displaySettings.showMoneyFlow && 
      calculations.moneyFlow && 
      calculations.moneyFlow.fast && 
      calculations.moneyFlow.fast.length > 0
    
    const hasOtherData = displaySettings.showOscillator1 || displaySettings.showOscillator2

    if (!hasWaveTrendData && !hasMoneyFlowData && !hasOtherData) {
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

    // Add zero line first (always show for oscillators)
    if (calculations.levels && calculations.levels.zero && calculations.levels.zero.length) {
      const zeroSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: '#ffffff60',
        title: '',
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      zeroSeries.setData(calculations.levels.zero as { time: Time; value: number }[])
      seriesRefs.current.set('zero', zeroSeries)
    }

    // Add other reference levels (background)
    if (displaySettings.showLevels && calculations.levels) {

      // Add overbought/oversold levels
      if (calculations.levels.overbought1 && calculations.levels.overbought1.length) {
        const ob1Series = chart.addSeries(LineSeries, {
          lineWidth: 1,
          color: addOpacityToColor(COLORS.levels, 0.4),
          title: '',
          lineStyle: LineStyle.Dotted,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        ob1Series.setData(calculations.levels.overbought1 as { time: Time; value: number }[])
        seriesRefs.current.set('ob1', ob1Series)
      }

      if (calculations.levels.oversold1 && calculations.levels.oversold1.length) {
        const os1Series = chart.addSeries(LineSeries, {
          lineWidth: 1,
          color: addOpacityToColor(COLORS.levels, 0.4),
          title: '',
          lineStyle: LineStyle.Dotted,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        os1Series.setData(calculations.levels.oversold1 as { time: Time; value: number }[])
        seriesRefs.current.set('os1', os1Series)
      }
    }

    // WaveTrend Line Charts
    if (displaySettings.showWaveTrend) {
      // WT1 Line (Soft blue)
      if (calculations.waveTrend.wt1 && calculations.waveTrend.wt1.length) {
        const wt1LineSeries = chart.addSeries(LineSeries, {
          lineWidth: hoveredIndicator === 'showWaveTrend' ? 2 : 1,
          color: hoveredIndicator && hoveredIndicator !== 'showWaveTrend' 
            ? addOpacityToColor(COLORS.wt1, 0.3) 
            : COLORS.wt1,
          title: '',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        wt1LineSeries.setData(calculations.waveTrend.wt1 as { time: Time; value: number }[])
        seriesRefs.current.set('wt1Line', wt1LineSeries)
      }

      // WT2 Line (Soft pink)
      if (calculations.waveTrend.wt2 && calculations.waveTrend.wt2.length) {
        const wt2LineSeries = chart.addSeries(LineSeries, {
          lineWidth: hoveredIndicator === 'showWaveTrend' ? 2 : 1,
          color: hoveredIndicator && hoveredIndicator !== 'showWaveTrend'
            ? addOpacityToColor(COLORS.wt2, 0.3)
            : COLORS.wt2,
          title: '',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        wt2LineSeries.setData(calculations.waveTrend.wt2 as { time: Time; value: number }[])
        seriesRefs.current.set('wt2Line', wt2LineSeries)
      }

      // WaveTrend Cross Dots (dots only, no connecting lines)
      if (calculations.waveTrend.positiveCrosses && calculations.waveTrend.positiveCrosses.length) {
        const positiveCrossSeries = chart.addSeries(LineSeries, {
          lineWidth: 1,               // Minimum line width
          color: 'transparent',       // Transparent line
          title: '',
          lineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: hoveredIndicator === 'showWaveTrend' ? 5 : 4,      // Dot size
          lastValueVisible: true,
          priceLineVisible: false,
        })
        positiveCrossSeries.setData(calculations.waveTrend.positiveCrosses.map(point => ({
          ...point,
          time: point.time as Time,
          color: hoveredIndicator && hoveredIndicator !== 'showWaveTrend'
            ? addOpacityToColor(COLORS.crossUp, 0.3)
            : COLORS.crossUp,   
          lineVisible: false,
        })))
        seriesRefs.current.set('wtPositiveCross', positiveCrossSeries)
      }

      if (calculations.waveTrend.negativeCrosses && calculations.waveTrend.negativeCrosses.length) {
        const negativeCrossSeries = chart.addSeries(LineSeries, {
          lineWidth: 1,               // Minimum line width  
          color: 'transparent',       // Transparent line
          title: '',
          lineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: hoveredIndicator === 'showWaveTrend' ? 5 : 4,      // Dot size
          lastValueVisible: true,
          priceLineVisible: false,
        })
        negativeCrossSeries.setData(calculations.waveTrend.negativeCrosses.map(point => ({
          ...point,
          time: point.time as Time,
          color: hoveredIndicator && hoveredIndicator !== 'showWaveTrend'
            ? addOpacityToColor(COLORS.crossDown, 0.3)
            : COLORS.crossDown,   
          lineVisible: false,
        })))
        seriesRefs.current.set('wtNegativeCross', negativeCrossSeries)
      }
    }

    // Money Flow indicators
    if (displaySettings.showMoneyFlow && calculations.moneyFlow) {
      // Show fast money flow if enabled and exists
      if ((config?.moneyFlow?.showFast ?? true) && calculations.moneyFlow.fast && calculations.moneyFlow.fast.length) {
        console.log('✅ Adding Money Flow series:', calculations.moneyFlow.fast.length, 'points')
        const fastMFSeries = chart.addSeries(LineSeries, {
          lineWidth: hoveredIndicator === 'showMoneyFlow' ? 1 : 1,
          lineStyle: LineStyle.Dashed,
          color: hoveredIndicator && hoveredIndicator !== 'showMoneyFlow'
            ? addOpacityToColor(COLORS.moneyFlow, 0.3)
            : COLORS.moneyFlow,
          title: '',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        fastMFSeries.setData(calculations.moneyFlow.fast as { time: Time; value: number }[])
        seriesRefs.current.set('fastMF', fastMFSeries)
      }

      // Show slow money flow if enabled and exists
      if ((config?.moneyFlow?.showSlow ?? false) && calculations.moneyFlow.slow && calculations.moneyFlow.slow.length) {
        const slowMFSeries = chart.addSeries(LineSeries, {
          lineWidth: hoveredIndicator === 'showMoneyFlow' ? 2 : 1,
          color: hoveredIndicator && hoveredIndicator !== 'showMoneyFlow'
            ? addOpacityToColor(addOpacityToColor(COLORS.moneyFlow, 0.7), 0.3)
            : addOpacityToColor(COLORS.moneyFlow, 0.7),
          title: '',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        slowMFSeries.setData(calculations.moneyFlow.slow as { time: Time; value: number }[])
        seriesRefs.current.set('slowMF', slowMFSeries)
      }
    }

    // Oscillator 1 (RSI, MFI, etc.)
    if (displaySettings.showOscillator1 && calculations.oscillator1 && calculations.oscillator1.length) {
      const osc1Series = chart.addSeries(LineSeries, {
        lineWidth: hoveredIndicator === 'showOscillator1' ? 2 : 1,
        color: hoveredIndicator && hoveredIndicator !== 'showOscillator1'
          ? addOpacityToColor(COLORS.oscillator1, 0.3)
          : COLORS.oscillator1,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      osc1Series.setData(calculations.oscillator1 as { time: Time; value: number }[])
      seriesRefs.current.set('osc1', osc1Series)
    }

    // Oscillator 2
    if (displaySettings.showOscillator2 && calculations.oscillator2 && calculations.oscillator2.length) {
      const osc2Series = chart.addSeries(LineSeries, {
        lineWidth: hoveredIndicator === 'showOscillator2' ? 2 : 1,
        color: hoveredIndicator && hoveredIndicator !== 'showOscillator2'
          ? addOpacityToColor(COLORS.oscillator2, 0.3)
          : COLORS.oscillator2,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      osc2Series.setData(calculations.oscillator2 as { time: Time; value: number }[])
      seriesRefs.current.set('osc2', osc2Series)
    }

    chart.timeScale().fitContent()
  }, [calculations, displaySettings, config, hoveredIndicator])

  // Don't render if no data
  if (!data.length) return null

  return (
    <div className="grid grid-cols-12 gap-0 rounded-[13px] bg-zinc-950/50 border border-zinc-800/20 overflow-hidden p-1">
      {/* Legend */}
      <div className="flex flex-col col-span-3 p-4 space-y-2">           
        <div className="flex flex-col gap-2 space-y-1">
          {LEGEND_ITEMS.map((item) => {
            const isActive = displaySettings[item.key]
            const isHovered = hoveredIndicator === item.key
            const isOtherHovered = hoveredIndicator && hoveredIndicator !== item.key
            
            return (
              <div
                key={item.key}
                className={cn(
                  "flex overflow-hidden items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg p-2 -m-1 relative group",
                  isHovered ? "bg-white/10" : "hover:bg-white/5",
                  !isActive && "opacity-50",
                  isOtherHovered && "opacity-40"
                )}
                style={{ 
                  backgroundColor: isHovered ? addOpacityToColor(item.color, 0.1) : undefined 
                }}
                onMouseEnter={() => setHoveredIndicator(item.key)}
                onMouseLeave={() => setHoveredIndicator(null)}
                onClick={() => toggleIndicator(item.key)}
              >
                <div 
                  className="w-1 h-6 rounded-full transition-all duration-200"
                  style={{ 
                    backgroundColor: isActive ? item.color : addOpacityToColor(item.color, 0.3)
                  }}
                />
                <div className="flex items-center flex-1 ml-2">
                  <span className={cn(
                    "text-sm font-medium transition-colors duration-200",
                    isActive ? "text-white" : "text-muted-foreground"
                  )}>
                    {item.name}
                  </span>
                </div>
                
                {/* Active indicator */}
                <div className={cn(
                  "w-2 h-2 rounded-full transition-all duration-200",
                  isActive ? "bg-white" : "bg-transparent"
                )} />
              </div>
            )
          })}
        </div>
      </div>
      
      <div className="col-span-9 pl-4 border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        {/* Chart Content */}
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
            }}
          />
          <div className="relative">
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
    </div>
  )
}

// Export types for use in other components
export type { MarketVisionDisplaySettings } 