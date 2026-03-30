'use client'

import { useRef, useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { useMarketVisionB, type MarketVisionBConfig } from '@/hooks/market-vision'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'
import { clearChartScrub, getChartScrubSnapshot, setChartScrub, subscribeToChartScrub } from '@/hooks/chart-scrub-store'
import { timeToEpochSeconds } from '@/hooks/use-chart-instance/utils'

interface MarketVisionChartProps {
  data: OHLCVDataPoint[]
  config?: Partial<MarketVisionBConfig>
  height?: number
  showTimeAxis?: boolean
  initialWindowDays?: number
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

const SECONDS_PER_DAY = 24 * 60 * 60
const DEFAULT_WINDOW_DAYS = 3
const RIGHT_OFFSET_BARS = 12

// Visual hierarchy: keep lines subtle, make signal dots pop.
const WT_LINE_OPACITY = 0.55
const SECONDARY_LINE_OPACITY = 0.35
const SIGNAL_BULLISH_COLOR = 'rgba(16, 185, 129, 0.95)' // emerald-500
const SIGNAL_BEARISH_COLOR = 'rgba(244, 63, 94, 0.95)' // rose-500

function getInitialWindowSeconds(initialWindowDays: number | undefined): number {
  const days = Number.isFinite(initialWindowDays) ? Math.max(1, Math.round(initialWindowDays as number)) : DEFAULT_WINDOW_DAYS
  return days * SECONDS_PER_DAY
}

function normalizeEpochSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value > 1e10 ? Math.floor(value / 1000) : Math.floor(value)
}

function estimateIntervalSeconds(ohlcvData: OHLCVDataPoint[], lastEpoch: number): number {
  const prevEpoch = normalizeEpochSeconds(ohlcvData[ohlcvData.length - 2]?.time)
  if (prevEpoch == null) return 0
  const delta = lastEpoch - prevEpoch
  return Number.isFinite(delta) && delta > 0 ? delta : 0
}

function pickDefaultWindowSeconds(spanSeconds: number, windowSeconds: number): number | null {
  if (!Number.isFinite(spanSeconds) || spanSeconds <= 0) return null

  if (spanSeconds > windowSeconds) return windowSeconds
  return null
}

function applyInitialVisibleRange(chart: IChartApi, ohlcvData: OHLCVDataPoint[], windowSeconds: number): void {
  const firstEpoch = normalizeEpochSeconds(ohlcvData[0]?.time)
  const lastEpoch = normalizeEpochSeconds(ohlcvData[ohlcvData.length - 1]?.time)
  if (firstEpoch == null || lastEpoch == null) {
    chart.timeScale().fitContent()
    return
  }

  const spanSeconds = lastEpoch - firstEpoch
  const requestedWindowSeconds = pickDefaultWindowSeconds(spanSeconds, windowSeconds)
  if (requestedWindowSeconds == null || spanSeconds <= requestedWindowSeconds) {
    chart.timeScale().fitContent()
    return
  }

  const intervalSeconds = estimateIntervalSeconds(ohlcvData, lastEpoch)
  const paddedTo = (lastEpoch + intervalSeconds) as Time

  chart.timeScale().setVisibleRange({
    from: (lastEpoch - requestedWindowSeconds) as Time,
    to: paddedTo,
  })
}

export function MarketVisionChart({ 
  data, 
  config,
  height = 200,
  showTimeAxis = false,
  initialWindowDays,
}: MarketVisionChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const lightweightChartsRef = useRef<LightweightChartsModule | null>(null)
  const hasAppliedInitialRangeRef = useRef(false)
  const [chartReadyNonce, setChartReadyNonce] = useState(0)
  const initialWindowSeconds = getInitialWindowSeconds(initialWindowDays)
  const dataSignature = `${data.length}:${String(data[0]?.time ?? '')}:${String(data[data.length - 1]?.time ?? '')}`

  useEffect(() => {
    hasAppliedInitialRangeRef.current = false
  }, [dataSignature, initialWindowSeconds])

  // Calculate all MarketVision B indicators
  const calculations = useMarketVisionB(data, config)

  useEffect(() => {
    if (!chartContainerRef.current) return

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
          borderVisible: false,
          rightOffset: RIGHT_OFFSET_BARS,
        },
      })

      chartRef.current = chart
      hasAppliedInitialRangeRef.current = false
      if (!isCancelled) setChartReadyNonce((prev) => prev + 1)

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

      // Shared cross-chart scrub line overlay.
      chartContainerRef.current.style.position = chartContainerRef.current.style.position || 'relative'
      const scrubLineEl = document.createElement('div')
      scrubLineEl.setAttribute('aria-hidden', 'true')
      scrubLineEl.style.position = 'absolute'
      scrubLineEl.style.top = '0'
      scrubLineEl.style.bottom = '0'
      scrubLineEl.style.width = '1px'
      scrubLineEl.style.transform = 'translateX(-9999px)'
      scrubLineEl.style.opacity = '0'
      scrubLineEl.style.pointerEvents = 'none'
      scrubLineEl.style.background = 'rgba(255,255,255,0.20)'
      scrubLineEl.style.zIndex = '5'
      chartContainerRef.current.appendChild(scrubLineEl)

      const updateScrubLine = () => {
        const scrub = getChartScrubSnapshot()
        if (!chartContainerRef.current || scrub.epochSeconds == null || scrub.sourceId === 'marketvision') {
          scrubLineEl.style.opacity = '0'
          scrubLineEl.style.transform = 'translateX(-9999px)'
          return
        }

        const x = chart.timeScale().timeToCoordinate(scrub.epochSeconds as Time)
        if (x == null || !Number.isFinite(x)) {
          scrubLineEl.style.opacity = '0'
          scrubLineEl.style.transform = 'translateX(-9999px)'
          return
        }

        scrubLineEl.style.opacity = '1'
        scrubLineEl.style.transform = `translateX(${Math.round(x)}px)`
      }

      const unsubscribeScrub = subscribeToChartScrub(() => updateScrubLine())
      chart.timeScale().subscribeVisibleTimeRangeChange(updateScrubLine)
      chart.timeScale().subscribeVisibleLogicalRangeChange(updateScrubLine)
      updateScrubLine()

      // Publish scrub time from this chart.
      const handleCrosshairMove = (param: { point?: { x: number; y: number }; time?: Time }) => {
        if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
          clearChartScrub()
          return
        }
        setChartScrub(timeToEpochSeconds(param.time) ?? null, 'marketvision')
      }
      chart.subscribeCrosshairMove(handleCrosshairMove)

      cleanup = () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId)
        resizeObserver?.disconnect()
        unsubscribeWindowResize?.()
        chart.unsubscribeCrosshairMove(handleCrosshairMove)
        chart.timeScale().unsubscribeVisibleTimeRangeChange(updateScrubLine)
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateScrubLine)
        unsubscribeScrub()
        if (chartContainerRef.current?.contains(scrubLineEl)) chartContainerRef.current.removeChild(scrubLineEl)
        chart.remove()
        chartRef.current = null
        currentSeriesRefs.clear()
      }
    })()

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [height, showTimeAxis, config])

  // Update series based on calculations and display settings
  useEffect(() => {
    if (!chartRef.current || !calculations) return

    const lightweightCharts = lightweightChartsRef.current
    if (!lightweightCharts) return
    const { LineSeries, LineStyle } = lightweightCharts

    const hasAnyData =
      Boolean(calculations.waveTrend?.wt1?.length) ||
      Boolean(calculations.waveTrend?.wt2?.length) ||
      Boolean(calculations.moneyFlow?.fast?.length) ||
      Boolean(calculations.moneyFlow?.slow?.length) ||
      Boolean(calculations.oscillator1?.length) ||
      Boolean(calculations.oscillator2?.length) ||
      Boolean(calculations.levels?.zero?.length)

    if (!hasAnyData) return

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
    if (calculations.levels?.zero?.length) {
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
    const showLevels = false
    if (showLevels && calculations.levels) {

      // Add overbought/oversold levels
      if (calculations.levels.overbought1?.length) {
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

      if (calculations.levels.oversold1?.length) {
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
    // WT1 Line (Soft blue)
    if (calculations.waveTrend.wt1?.length) {
      const wt1LineSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: addOpacityToColor(COLORS.wt1, WT_LINE_OPACITY),
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      wt1LineSeries.setData(calculations.waveTrend.wt1 as { time: Time; value: number }[])
      seriesRefs.current.set('wt1Line', wt1LineSeries)
    }

    // WT2 Line (Soft pink)
    if (calculations.waveTrend.wt2?.length) {
      const wt2LineSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: addOpacityToColor(COLORS.wt2, WT_LINE_OPACITY),
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      wt2LineSeries.setData(calculations.waveTrend.wt2 as { time: Time; value: number }[])
      seriesRefs.current.set('wt2Line', wt2LineSeries)
    }

    // WaveTrend Cross Dots (dots only, no connecting lines)
    if (calculations.waveTrend.positiveCrosses?.length) {
      const positiveCrossSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: 'transparent',
        title: '',
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 5,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      positiveCrossSeries.setData(calculations.waveTrend.positiveCrosses.map(point => ({
        ...point,
        time: point.time as Time,
        color: SIGNAL_BULLISH_COLOR,
        lineVisible: false,
      })))
      seriesRefs.current.set('wtPositiveCross', positiveCrossSeries)
    }

    if (calculations.waveTrend.negativeCrosses?.length) {
      const negativeCrossSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: 'transparent',
        title: '',
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 5,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      negativeCrossSeries.setData(calculations.waveTrend.negativeCrosses.map(point => ({
        ...point,
        time: point.time as Time,
        color: SIGNAL_BEARISH_COLOR,
        lineVisible: false,
      })))
      seriesRefs.current.set('wtNegativeCross', negativeCrossSeries)
    }

    // Money Flow indicators
    if (calculations.moneyFlow) {
      // Show fast money flow if enabled and exists
      if ((config?.moneyFlow?.showFast ?? true) && calculations.moneyFlow.fast && calculations.moneyFlow.fast.length) {
        console.log('✅ Adding Money Flow series:', calculations.moneyFlow.fast.length, 'points')
        const fastMFSeries = chart.addSeries(LineSeries, {
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          color: addOpacityToColor(COLORS.moneyFlow, SECONDARY_LINE_OPACITY),
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
          lineWidth: 1,
          color: addOpacityToColor(COLORS.moneyFlow, SECONDARY_LINE_OPACITY),
          title: '',
          lastValueVisible: true,
          priceLineVisible: false,
        })
        slowMFSeries.setData(calculations.moneyFlow.slow as { time: Time; value: number }[])
        seriesRefs.current.set('slowMF', slowMFSeries)
      }
    }

    // Oscillator 1 (RSI, MFI, etc.)
    if (calculations.oscillator1 && calculations.oscillator1.length) {
      const osc1Series = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: addOpacityToColor(COLORS.oscillator1, SECONDARY_LINE_OPACITY),
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      osc1Series.setData(calculations.oscillator1 as { time: Time; value: number }[])
      seriesRefs.current.set('osc1', osc1Series)
    }

    // Oscillator 2
    if (calculations.oscillator2 && calculations.oscillator2.length) {
      const osc2Series = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: addOpacityToColor(COLORS.oscillator2, SECONDARY_LINE_OPACITY),
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      osc2Series.setData(calculations.oscillator2 as { time: Time; value: number }[])
      seriesRefs.current.set('osc2', osc2Series)
    }

    if (!hasAppliedInitialRangeRef.current) {
      applyInitialVisibleRange(chart, data, initialWindowSeconds)
      hasAppliedInitialRangeRef.current = true
    }
  }, [calculations, config, data, dataSignature, chartReadyNonce, initialWindowSeconds])

  // Don't render if no data
  if (!data.length) return null

  return (
    <div className="overflow-hidden p-1">
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
            }}
          />
          <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
        </div>
    </div>
  )
}