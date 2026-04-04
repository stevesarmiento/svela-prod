'use client'

import { useRef, useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { calculateBollingerBands, type BollingerBandsConfig } from '@/hooks/market-vision/bollinger-bands'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'
import { clearChartScrub, getChartScrubSnapshot, setChartScrub, subscribeToChartScrub } from '@/hooks/chart-scrub-store'
import { timeToEpochSeconds } from '@/hooks/use-chart-instance/utils'

interface BollingerBandsChartProps {
  data: OHLCVDataPoint[]
  config?: Partial<BollingerBandsConfig>
  height?: number
  showTimeAxis?: boolean
  initialWindowDays?: number
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

// Keep bands visually secondary vs RSI + breach points.
const BANDS_MUTED_COLOR = 'rgba(161, 161, 170, 0.46)' // zinc-400-ish
const BANDS_MID_MUTED_COLOR = 'rgba(161, 161, 170, 0.75)'

// Extreme breach dots should be the visual focus.
const EXTREME_OVERBOUGHT_COLOR = 'rgba(244, 63, 94, 0.95)' // rose-500
const EXTREME_OVERSOLD_COLOR = 'rgba(16, 185, 129, 0.95)' // emerald-500

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

function normalizeEpochSeconds(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const seconds = value > 1e10 ? Math.floor(value / 1000) : Math.floor(value)
  return Number.isFinite(seconds) ? seconds : null
}

function normalizeIndicatorOhlcv(data: OHLCVDataPoint[]): OHLCVDataPoint[] {
  const byEpoch = new Map<number, OHLCVDataPoint>()
  for (const point of data) {
    const epoch = normalizeEpochSeconds(point.time)
    if (epoch == null) continue
    if (!Number.isFinite(point.open) || !Number.isFinite(point.high) || !Number.isFinite(point.low) || !Number.isFinite(point.close))
      continue
    byEpoch.set(epoch, { ...point, time: epoch, volume: Number.isFinite(point.volume) ? point.volume : 0 })
  }

  return Array.from(byEpoch.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value)
}

function normalizeSeries(points: Array<{ time: number; value: number }>): Array<{ time: Time; value: number }> {
  const byEpoch = new Map<number, { time: Time; value: number }>()
  for (const point of points) {
    const epoch = normalizeEpochSeconds(point.time)
    if (epoch == null) continue
    if (!Number.isFinite(point.value)) continue
    byEpoch.set(epoch, { time: epoch as Time, value: point.value })
  }

  return Array.from(byEpoch.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value)
}

const SECONDS_PER_DAY = 24 * 60 * 60
const DEFAULT_WINDOW_DAYS = 3
const RIGHT_OFFSET_BARS = 12

function getInitialWindowSeconds(initialWindowDays: number | undefined): number {
  const days = Number.isFinite(initialWindowDays) ? Math.max(1, Math.round(initialWindowDays as number)) : DEFAULT_WINDOW_DAYS
  return days * SECONDS_PER_DAY
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

export function BollingerBandsChart({ 
  data, 
  config,
  height = 250,
  showTimeAxis = true,
  initialWindowDays,
}: BollingerBandsChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line' | 'Area'>>>(new Map())
  const lightweightChartsRef = useRef<LightweightChartsModule | null>(null)
  const hasAppliedInitialRangeRef = useRef(false)
  const [chartReadyNonce, setChartReadyNonce] = useState(0)
  const initialWindowSeconds = getInitialWindowSeconds(initialWindowDays)
  const dataSignature = `${data.length}:${String(data[0]?.time ?? '')}:${String(data[data.length - 1]?.time ?? '')}`

  useEffect(() => {
    hasAppliedInitialRangeRef.current = false
  }, [dataSignature, initialWindowSeconds])

  // Merge with default config
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  // Calculate Bollinger Bands
  const bbResult = calculateBollingerBands(normalizeIndicatorOhlcv(data), finalConfig)

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
          borderVisible: false,
          rightOffset: RIGHT_OFFSET_BARS,
        },
      })

      chartRef.current = chart
      hasAppliedInitialRangeRef.current = false
      if (!isCancelled) setChartReadyNonce((prev) => prev + 1)

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
        if (!chartContainerRef.current || scrub.epochSeconds == null || scrub.sourceId === 'bollinger') {
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
        setChartScrub(timeToEpochSeconds(param.time) ?? null, 'bollinger')
      }
      chart.subscribeCrosshairMove(handleCrosshairMove)

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
  }, [height, showTimeAxis])

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
    if (bbResult.upper.length > 0) {
      const upperSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: BANDS_MUTED_COLOR,
        title: '',
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      upperSeries.setData(normalizeSeries(bbResult.upper))
      seriesRefs.current.set('upper', upperSeries)
    }

    // Add Lower Band
    if (bbResult.lower.length > 0) {
      const lowerSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: BANDS_MUTED_COLOR,
        title: '',
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      lowerSeries.setData(normalizeSeries(bbResult.lower))
      seriesRefs.current.set('lower', lowerSeries)
    }

    // Add Basis (SMA)
    if (bbResult.basis.length > 0) {
      const basisSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: BANDS_MID_MUTED_COLOR,
        title: '',
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
      })
      basisSeries.setData(normalizeSeries(bbResult.basis))
      seriesRefs.current.set('basis', basisSeries)
    }

    // Add Main Indicator (RSI or MFI)
    if (bbResult.indicator.length > 0) {
      const indicatorSeries = chart.addSeries(LineSeries, {
        lineWidth: 2,
        color: bbResult.colors.indicator,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      indicatorSeries.setData(normalizeSeries(bbResult.indicator))
      seriesRefs.current.set('indicator', indicatorSeries)
    }

    // Add Breach Highlighting
    // Overbought breaches (above upper band)
    if (bbResult.overboughtBreaches.length > 0) {
      const obSeries = chart.addSeries(LineSeries, {
        lineWidth: 3,
        color: EXTREME_OVERBOUGHT_COLOR,
        title: '',
        pointMarkersVisible: true,
        pointMarkersRadius: 4,
        lineVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      obSeries.setData(normalizeSeries(bbResult.overboughtBreaches))
      seriesRefs.current.set('overbought', obSeries)
    }

    // Oversold breaches (below lower band)
    if (bbResult.oversoldBreaches.length > 0) {
      const osSeries = chart.addSeries(LineSeries, {
        lineWidth: 3,
        color: EXTREME_OVERSOLD_COLOR,
        title: '',
        pointMarkersVisible: true,
        pointMarkersRadius: 4,
        lineVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      osSeries.setData(normalizeSeries(bbResult.oversoldBreaches))
      seriesRefs.current.set('oversold', osSeries)
    }

    if (!hasAppliedInitialRangeRef.current) {
      applyInitialVisibleRange(chart, data, initialWindowSeconds)
      hasAppliedInitialRangeRef.current = true
    }
  }, [bbResult, data, dataSignature, chartReadyNonce, initialWindowSeconds])

  // Don't render if no data
  if (!data.length) return null

  return (
    <div className="w-full p-1">
      <div className="p-0 relative">
        <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
      </div>
    </div>
  )
}