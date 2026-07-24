'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { calculateBBWP, type BBWPConfig, DEFAULT_BBWP_CONFIG } from '@/hooks/market-vision/bbwp'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import { mixOklch, withAlpha as oklchWithAlpha } from '@/lib/oklch'
import {
  applyInitialVisibleRange,
  attachChartResize,
  attachChartScrubSync,
  buildIndicatorChartOptions,
  getInitialWindowSeconds,
  normalizeIndicatorOhlcv,
  normalizeSeries,
} from './indicator-chart-setup'

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
  solid: 'oklch(0.968 0.211 109.77)',
  high: 'oklch(0.628 0.2577 29.23)',
  midHigh: 'oklch(0.968 0.211 109.77)',
  mid: 'oklch(0.8664 0.2948 142.5)',
  midLow: 'oklch(0.9054 0.1546 194.77)',
  low: 'oklch(0.452 0.3132 264.05)',
  ma: 'oklch(1 0 0)',
  scaleHigh: 'oklch(0.628 0.2577 29.23)',
  scaleMid: 'oklch(0.7252 0 0)',
  scaleLow: 'oklch(0.452 0.3132 264.05)',
  extremeHigh: 'oklch(0.628 0.2577 29.23)',
  extremeLow: 'oklch(0.452 0.3132 264.05)',
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

function interpolateSpectrum(a: string, b: string, t: number): string {
  // Perceptual interpolation in OKLCH (shorter hue arc).
  return mixOklch(a, b, t)
}

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 1
  return Math.max(0, Math.min(1, alpha))
}

function withAlpha(color: string, alpha: number): string {
  // All chart colors are oklch strings; delegate to the shared helper.
  return oklchWithAlpha(color.trim(), clampAlpha(alpha))
}

function buildColorMap(preset: SpectrumPreset, colors: Required<BBWPSpectrumColors>): string[] {
  const map: string[] = []

  const grad = (x: number, a: number, b: number, ca: string, cb: string) => {
    if (b === a) return ca
    const t = (x - a) / (b - a)
    return interpolateSpectrum(ca, cb, Math.min(1, Math.max(0, t)))
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

function resolveBbwpConfig(config: BBWPChartConfig | undefined) {
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
}

type ResolvedBbwpConfig = ReturnType<typeof resolveBbwpConfig>
type BbwpResult = ReturnType<typeof calculateBBWP>

// Rebuilds all series on the chart from the latest BBWP calculation.
function applyBbwpSeries(
  chart: IChartApi,
  lightweightCharts: LightweightChartsModule,
  seriesRefs: Map<string, ISeriesApi<'Line'>>,
  finalConfig: ResolvedBbwpConfig,
  bbwpResult: BbwpResult,
  colorMap: string[] | null,
): void {
  const { LineSeries, LineStyle } = lightweightCharts

  // Clear existing series
  seriesRefs.forEach((series) => {
    try {
      chart.removeSeries(series)
    } catch {
      // ignore
    }
  })
  seriesRefs.clear()

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
  seriesRefs.set('scaleHigh', highSeries)

  const midSeries = chart.addSeries(LineSeries, {
    lineWidth: finalConfig.scaleWidth,
    color: scaleMidColor,
    title: '',
    lineStyle: LineStyle.Dashed,
    lastValueVisible: false,
    priceLineVisible: false,
  })
  midSeries.setData(normalizeSeries(bbwpResult.levels.mid) as { time: Time; value: number }[])
  seriesRefs.set('scaleMid', midSeries)

  const lowSeries = chart.addSeries(LineSeries, {
    lineWidth: finalConfig.scaleWidth,
    color: scaleLowColor,
    title: '',
    lineStyle: LineStyle.Solid,
    lastValueVisible: false,
    priceLineVisible: false,
  })
  lowSeries.setData(normalizeSeries(bbwpResult.levels.low) as { time: Time; value: number }[])
  seriesRefs.set('scaleLow', lowSeries)

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
  seriesRefs.set('extremeHigh', high)

  const low = chart.addSeries(LineSeries, {
    lineWidth: finalConfig.extremeWidth,
    color: extremeLowColor,
    title: '',
    lineStyle: LineStyle.Dotted,
    lastValueVisible: false,
    priceLineVisible: false,
  })
  low.setData(normalizeSeries(bbwpResult.levels.extremeLow) as { time: Time; value: number }[])
  seriesRefs.set('extremeLow', low)

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

    seriesRefs.set('bbwp', bbwpSeries)
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
    seriesRefs.set('ma', maSeries)
  }
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

  const finalConfig = useMemo(() => resolveBbwpConfig(config), [config])

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

      if (isCancelled || !chartContainerRef.current) return
      const container = chartContainerRef.current

      const chart = lightweightCharts.createChart(
        container,
        buildIndicatorChartOptions(lightweightCharts, {
          showTimeAxis,
          horzLinesVisible: true,
          scaleMargins: { top: 0.15, bottom: 0.15 },
        }),
      )

      chartRef.current = chart
      hasAppliedInitialRangeRef.current = false
      if (!isCancelled) setChartReadyNonce((prev) => prev + 1)

      const detachScrubSync = attachChartScrubSync(chart, container, 'bbwp')
      const detachResize = attachChartResize(chart, container, height)

      cleanup = () => {
        detachResize()
        detachScrubSync()
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
    const chart = chartRef.current
    if (!chart) return
    const lightweightCharts = lightweightChartsRef.current
    if (!lightweightCharts) return

    applyBbwpSeries(chart, lightweightCharts, seriesRefs.current, finalConfig, bbwpResult, colorMap)

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
