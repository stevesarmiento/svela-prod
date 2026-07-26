'use client'

import { useRef, useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { calculateBollingerBands, DEFAULT_BB_COLORS, type BollingerBandsConfig } from '@/hooks/market-vision/bollinger-bands'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import {
  applyInitialVisibleRange,
  attachChartResize,
  attachChartScrubSync,
  buildIndicatorChartOptions,
  getInitialWindowSeconds,
  normalizeIndicatorOhlcv,
  normalizeSeries,
} from './indicator-chart-setup'

interface BollingerBandsChartProps {
  data: OHLCVDataPoint[]
  config?: Partial<BollingerBandsConfig>
  height?: number
  showTimeAxis?: boolean
  initialWindowDays?: number
}

// Single source of truth for the Bollinger palette (dedupe: previously a
// verbatim copy of the construction in hooks/market-vision/bollinger-bands.ts).
const COLORS = DEFAULT_BB_COLORS

// Keep bands visually secondary vs RSI + breach points.
const BANDS_MUTED_COLOR = 'oklch(0.7118 0.0129 286.07 / 0.46)' // zinc-400-ish
const BANDS_MID_MUTED_COLOR = 'oklch(0.7118 0.0129 286.07 / 0.75)'

// Extreme breach dots should be the visual focus.
const EXTREME_OVERBOUGHT_COLOR = 'oklch(0.645 0.2154 16.44 / 0.95)' // rose-500
const EXTREME_OVERSOLD_COLOR = 'oklch(0.6959 0.1491 162.48 / 0.95)' // emerald-500

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

type BollingerBandsResult = ReturnType<typeof calculateBollingerBands>

// Rebuilds all series on the chart from the latest Bollinger calculation.
function applyBollingerSeries(
  chart: IChartApi,
  lightweightCharts: LightweightChartsModule,
  seriesRefs: Map<string, ISeriesApi<'Line' | 'Area'>>,
  bbResult: BollingerBandsResult,
): void {
  const { LineSeries, LineStyle } = lightweightCharts

  // Clear existing series
  seriesRefs.forEach(series => {
    try {
      chart.removeSeries(series)
    } catch {
      // Series might already be removed
    }
  })
  seriesRefs.clear()

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
    seriesRefs.set('upper', upperSeries)
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
    seriesRefs.set('lower', lowerSeries)
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
    seriesRefs.set('basis', basisSeries)
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
    seriesRefs.set('indicator', indicatorSeries)
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
    seriesRefs.set('overbought', obSeries)
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
    seriesRefs.set('oversold', osSeries)
  }
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

      if (isCancelled || !chartContainerRef.current) return
      const container = chartContainerRef.current

      const chart = lightweightCharts.createChart(
        container,
        buildIndicatorChartOptions(lightweightCharts, {
          showTimeAxis,
          horzLinesVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        }),
      )

      chartRef.current = chart
      hasAppliedInitialRangeRef.current = false
      if (!isCancelled) setChartReadyNonce((prev) => prev + 1)

      const detachScrubSync = attachChartScrubSync(chart, container, 'bollinger')
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

  // Update series based on calculations and display settings
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !bbResult) return

    const lightweightCharts = lightweightChartsRef.current
    if (!lightweightCharts) return

    applyBollingerSeries(chart, lightweightCharts, seriesRefs.current, bbResult)

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
