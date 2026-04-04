'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { calculateBBWP, type BBWPConfig, DEFAULT_BBWP_CONFIG } from '@/hooks/market-vision/bbwp'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'
import { clearChartScrub, getChartScrubSnapshot, setChartScrub, subscribeToChartScrub } from '@/hooks/chart-scrub-store'
import { timeToEpochSeconds } from '@/hooks/use-chart-instance/utils'

type SpectrumPreset = '2point' | '3point' | '5point'
type ColorType = 'Spectrum' | 'Solid'
type ChartLineWidth = 1 | 2 | 3 | 4

interface BBWPSpectrumColors {
  high: string
  midHigh: string
  mid: string
  midLow: string
  low: string
}

export interface BBWPChartConfig extends Partial<BBWPConfig> {
  lineWidth?: ChartLineWidth
  maColor?: string
  maWidth?: ChartLineWidth

  colorType?: ColorType
  solidColor?: string
  spectrumPreset?: SpectrumPreset
  spectrumColors?: Partial<BBWPSpectrumColors>

  scaleHighColor?: string
  scaleMidColor?: string
  scaleLowColor?: string
  scaleWidth?: ChartLineWidth

  extremeHighColor?: string
  extremeLowColor?: string
  extremeWidth?: ChartLineWidth
}

interface BBWPChartProps {
  data: OHLCVDataPoint[]
  config?: BBWPChartConfig
  height?: number
  showTimeAxis?: boolean
  initialWindowDays?: number
}

const DEFAULT_COLORS: Required<BBWPSpectrumColors> & {
  solid: string
  ma: string
  scaleHigh: string
  scaleMid: string
  scaleLow: string
  extremeHigh: string
  extremeLow: string
} = {
  solid: '#FFFF00',
  high: '#FF0000',
  midHigh: '#FFFF00',
  mid: '#00FF00',
  midLow: '#00FFFF',
  low: '#0000FF',
  ma: '#FFFFFF',
  scaleHigh: '#FF0000',
  scaleMid: '#A6A6A6',
  scaleLow: '#0000FF',
  extremeHigh: '#FF0000',
  extremeLow: '#0000FF',
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

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampLineWidth(value: number | undefined, fallback: ChartLineWidth): ChartLineWidth {
  const n = clampInt(value ?? fallback, 1, 4)
  if (n === 1) return 1
  if (n === 2) return 2
  if (n === 3) return 3
  return 4
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.trim().replace('#', '')
  if (cleaned.length !== 6) return null
  const r = Number.parseInt(cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.slice(4, 6), 16)
  if (![r, g, b].every((n) => Number.isFinite(n))) return null
  return { r, g, b }
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => clampInt(n, 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

function interpolateHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return a
  return rgbToHex({
    r: lerp(ra.r, rb.r, t),
    g: lerp(ra.g, rb.g, t),
    b: lerp(ra.b, rb.b, t),
  })
}

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 1
  return Math.max(0, Math.min(1, alpha))
}

function withAlpha(color: string, alpha: number): string {
  const a = clampAlpha(alpha)
  const trimmed = color.trim()

  if (trimmed.startsWith('#')) {
    const rgb = hexToRgb(trimmed)
    if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`
  }

  const rgbaMatch =
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/i.exec(trimmed) ??
    /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(trimmed)

  if (rgbaMatch) {
    const r = Number.parseInt(rgbaMatch[1] ?? '', 10)
    const g = Number.parseInt(rgbaMatch[2] ?? '', 10)
    const b = Number.parseInt(rgbaMatch[3] ?? '', 10)
    if ([r, g, b].every((n) => Number.isFinite(n))) return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  return color
}

function buildColorMap(preset: SpectrumPreset, colors: Required<BBWPSpectrumColors>): string[] {
  const map: string[] = []

  const grad = (x: number, a: number, b: number, ca: string, cb: string) => {
    if (b === a) return ca
    const t = (x - a) / (b - a)
    return interpolateHex(ca, cb, Math.min(1, Math.max(0, t)))
  }

  for (let i = 0; i <= 100; i++) {
    if (preset === '2point') {
      map.push(grad(i, 0, 100, colors.low, colors.high))
      continue
    }

    if (preset === '3point') {
      map.push(i <= 50 ? grad(i, 0, 50, colors.low, colors.mid) : grad(i, 50, 100, colors.mid, colors.high))
      continue
    }

    // 5-point (default): Low -> MidLow -> Mid -> MidHigh -> High
    if (i <= 25) map.push(grad(i, 0, 25, colors.low, colors.midLow))
    else if (i <= 50) map.push(grad(i, 25, 50, colors.midLow, colors.mid))
    else if (i <= 75) map.push(grad(i, 50, 75, colors.mid, colors.midHigh))
    else map.push(grad(i, 75, 100, colors.midHigh, colors.high))
  }

  return map
}

export function BBWPChart({ data, config, height = 200, showTimeAxis = true, initialWindowDays }: BBWPChartProps) {
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

  const finalConfig = useMemo(() => {
    const merged = { ...DEFAULT_BBWP_CONFIG, ...(config ?? {}) }
    return {
      ...merged,
      lineWidth: clampLineWidth(config?.lineWidth, 2),
      maColor: config?.maColor ?? DEFAULT_COLORS.ma,
      maWidth: clampLineWidth(config?.maWidth, 2),
      colorType: config?.colorType ?? 'Spectrum',
      solidColor: config?.solidColor ?? DEFAULT_COLORS.solid,
      spectrumPreset: config?.spectrumPreset ?? '5point',
      spectrumColors: {
        high: config?.spectrumColors?.high ?? DEFAULT_COLORS.high,
        midHigh: config?.spectrumColors?.midHigh ?? DEFAULT_COLORS.midHigh,
        mid: config?.spectrumColors?.mid ?? DEFAULT_COLORS.mid,
        midLow: config?.spectrumColors?.midLow ?? DEFAULT_COLORS.midLow,
        low: config?.spectrumColors?.low ?? DEFAULT_COLORS.low,
      } satisfies Required<BBWPSpectrumColors>,
      scaleHighColor: config?.scaleHighColor ?? DEFAULT_COLORS.scaleHigh,
      scaleMidColor: config?.scaleMidColor ?? DEFAULT_COLORS.scaleMid,
      scaleLowColor: config?.scaleLowColor ?? DEFAULT_COLORS.scaleLow,
      scaleWidth: clampLineWidth(config?.scaleWidth, 1),
      extremeHighColor: config?.extremeHighColor ?? DEFAULT_COLORS.extremeHigh,
      extremeLowColor: config?.extremeLowColor ?? DEFAULT_COLORS.extremeLow,
      extremeWidth: clampLineWidth(config?.extremeWidth, 1),
    }
  }, [config])

  const normalizedData = useMemo(() => normalizeIndicatorOhlcv(data), [data])
  const bbwpResult = useMemo(() => calculateBBWP(normalizedData, finalConfig), [normalizedData, finalConfig])

  const colorMap = useMemo(() => {
    if (finalConfig.colorType !== 'Spectrum') return null
    return buildColorMap(finalConfig.spectrumPreset, finalConfig.spectrumColors)
  }, [finalConfig.colorType, finalConfig.spectrumPreset, finalConfig.spectrumColors])

  useEffect(() => {
    if (!chartContainerRef.current) return

    let isCancelled = false
    let cleanup: (() => void) | null = null
    const currentSeriesRefs = seriesRefs.current

    void (async () => {
      const lightweightCharts = await loadLightweightCharts()
      lightweightChartsRef.current = lightweightCharts

      const { createChart, ColorType: LwcColorType, CrosshairMode, LineStyle } = lightweightCharts
      if (isCancelled || !chartContainerRef.current) return

      const chart = createChart(chartContainerRef.current, {
        handleScale: true,
        handleScroll: true,
        layout: {
          background: { type: LwcColorType.Solid, color: 'transparent' },
          textColor: '#ffffff50',
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: true, color: '#f5f5f510', style: LineStyle.Dotted },
        },
        rightPriceScale: {
          borderVisible: false,
          autoScale: true,
          scaleMargins: { top: 0.15, bottom: 0.15 },
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: { labelVisible: true, width: 1, color: '#d1d5db40', visible: true, style: LineStyle.Solid },
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
        if (!chartContainerRef.current || scrub.epochSeconds == null || scrub.sourceId === 'bbwp') {
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
        setChartScrub(timeToEpochSeconds(param.time) ?? null, 'bbwp')
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

      let resizeObserver: ResizeObserver | null = null
      let resizeRafId: number | null = null
      let unsubscribeWindowResize: (() => void) | null = null

      if (typeof ResizeObserver !== 'undefined' && chartContainerRef.current) {
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

  useEffect(() => {
    if (!chartRef.current) return
    const lightweightCharts = lightweightChartsRef.current
    if (!lightweightCharts) return

    const { LineSeries, LineStyle } = lightweightCharts
    const chart = chartRef.current

    // Clear existing series
    seriesRefs.current.forEach((series) => {
      try {
        chart.removeSeries(series)
      } catch {
        // ignore
      }
    })
    seriesRefs.current.clear()

    const scaleEdgeColor = withAlpha(finalConfig.scaleHighColor, 0.16)
    const scaleMidColor = withAlpha(finalConfig.scaleMidColor, 0.22)
    const scaleLowColor = withAlpha(finalConfig.scaleLowColor, 0.16)
    const extremeHighColor = withAlpha(finalConfig.extremeHighColor, 0.18)
    const extremeLowColor = withAlpha(finalConfig.extremeLowColor, 0.18)
    const maColor = withAlpha(finalConfig.maColor, 0.55)

    // Scale lines (0/50/100)
    const highSeries = chart.addSeries(LineSeries, {
      lineWidth: finalConfig.scaleWidth,
      color: scaleEdgeColor,
      title: '',
      lineStyle: LineStyle.Solid,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    highSeries.setData(normalizeSeries(bbwpResult.levels.high) as { time: Time; value: number }[])
    seriesRefs.current.set('scaleHigh', highSeries)

    const midSeries = chart.addSeries(LineSeries, {
      lineWidth: finalConfig.scaleWidth,
      color: scaleMidColor,
      title: '',
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    midSeries.setData(normalizeSeries(bbwpResult.levels.mid) as { time: Time; value: number }[])
    seriesRefs.current.set('scaleMid', midSeries)

    const lowSeries = chart.addSeries(LineSeries, {
      lineWidth: finalConfig.scaleWidth,
      color: scaleLowColor,
      title: '',
      lineStyle: LineStyle.Solid,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    lowSeries.setData(normalizeSeries(bbwpResult.levels.low) as { time: Time; value: number }[])
    seriesRefs.current.set('scaleLow', lowSeries)

    // Extremes
    const high = chart.addSeries(LineSeries, {
      lineWidth: finalConfig.extremeWidth,
      color: extremeHighColor,
      title: '',
      lineStyle: LineStyle.Dotted,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    high.setData(normalizeSeries(bbwpResult.levels.extremeHigh) as { time: Time; value: number }[])
    seriesRefs.current.set('extremeHigh', high)

    const low = chart.addSeries(LineSeries, {
      lineWidth: finalConfig.extremeWidth,
      color: extremeLowColor,
      title: '',
      lineStyle: LineStyle.Dotted,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    low.setData(normalizeSeries(bbwpResult.levels.extremeLow) as { time: Time; value: number }[])
    seriesRefs.current.set('extremeLow', low)

    // BBWP series
    if (bbwpResult.bbwp.length > 0) {
      const bbwpSeries = chart.addSeries(LineSeries, {
        lineWidth: finalConfig.lineWidth,
        color:
          finalConfig.colorType === 'Solid'
            ? finalConfig.solidColor
            : DEFAULT_COLORS.midHigh,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })

      if (finalConfig.colorType === 'Spectrum' && colorMap) {
        const colored: LineData[] = normalizeSeries(bbwpResult.bbwp).map((p) => ({
          time: p.time,
          value: p.value,
          color: colorMap[clampInt(p.value, 0, 100)] ?? DEFAULT_COLORS.midHigh,
        }))
        bbwpSeries.setData(colored)
      } else {
        bbwpSeries.setData(normalizeSeries(bbwpResult.bbwp) as { time: Time; value: number }[])
      }

      seriesRefs.current.set('bbwp', bbwpSeries)
    }

    // MA overlay
    if (bbwpResult.ma.length > 0) {
      const maSeries = chart.addSeries(LineSeries, {
        lineWidth: finalConfig.maWidth,
        color: maColor,
        title: '',
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
      })
      maSeries.setData(normalizeSeries(bbwpResult.ma) as { time: Time; value: number }[])
      seriesRefs.current.set('ma', maSeries)
    }

    if (!hasAppliedInitialRangeRef.current) {
      applyInitialVisibleRange(chart, data, initialWindowSeconds)
      hasAppliedInitialRangeRef.current = true
    }
  }, [bbwpResult, finalConfig, colorMap, data, dataSignature, chartReadyNonce, initialWindowSeconds])

  if (!data.length) return null

  return (
    <div className="w-full p-1">
      <div className="p-0 relative">
        <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
      </div>
    </div>
  )
}

