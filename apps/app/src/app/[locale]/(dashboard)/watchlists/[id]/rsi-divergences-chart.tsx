'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { calculateRsiDivergences, type RsiDivergence, RSI_ZONE_LEVELS } from '@/hooks/market-vision/rsi-divergences'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import {
  applyInitialVisibleRange,
  attachChartResize,
  attachChartScrubSync,
  buildIndicatorChartOptions,
  createOverlayLayer,
  getInitialWindowSeconds,
  normalizeIndicatorOhlcv,
} from './indicator-chart-setup'

interface RsiDivergencesChartProps {
  data: OHLCVDataPoint[]
  height?: number
  showTimeAxis?: boolean
  initialWindowDays?: number
  showLabels?: boolean
}

const MAX_DIVERGENCE_LINES = 200

const COLORS = {
  rsi: 'oklch(0.6231 0.188 259.81 / 0.7)', // blue-500
  levels: 'oklch(0.7118 0.0129 286.07 / 0.35)', // zinc-400
  bull: 'oklch(0.6959 0.1491 162.48 / 0.95)', // emerald-500
  bear: 'oklch(0.645 0.2154 16.44 / 0.95)', // rose-500
  hiddenBull: 'oklch(0.7038 0.123 182.5 / 0.95)', // teal-500
  hiddenBear: 'oklch(0.7049 0.1867 47.6 / 0.95)', // orange-500
  // Caretaker zone levels/fills (bull teal, bear purple)
  zoneBullLine: 'oklch(0.7038 0.123 182.5 / 0.45)', // teal-500
  zoneBearLine: 'oklch(0.6268 0.2325 303.9 / 0.45)', // purple-500
  zoneBullFill: 'oklch(0.7038 0.123 182.5 / 0.1)', // teal-500, ~90% transparent
  zoneBearFill: 'oklch(0.6268 0.2325 303.9 / 0.1)', // purple-500, ~90% transparent
} as const

function divergenceLabel(div: RsiDivergence): string {
  if (div.type === 'bullish') return 'Bull'
  if (div.type === 'bearish') return 'Bear'
  if (div.type === 'h_bullish') return 'H_Bull'
  return 'H_Bear'
}

function divergenceColor(div: RsiDivergence): string {
  if (div.type === 'bullish') return COLORS.bull
  if (div.type === 'bearish') return COLORS.bear
  if (div.type === 'h_bullish') return COLORS.hiddenBull
  return COLORS.hiddenBear
}

function positionZoneEl(
  el: HTMLDivElement,
  series: ISeriesApi<'Line'>,
  upperLevel: number,
  lowerLevel: number,
  heightPx: number,
): void {
  const yUpper = series.priceToCoordinate(upperLevel)
  const yLower = series.priceToCoordinate(lowerLevel)
  if (yUpper == null || yLower == null || !Number.isFinite(yUpper) || !Number.isFinite(yLower)) {
    el.style.opacity = '0'
    return
  }

  const top = Math.max(0, Math.min(yUpper, yLower))
  const bottom = Math.min(heightPx, Math.max(yUpper, yLower))
  if (bottom - top < 1) {
    el.style.opacity = '0'
    return
  }

  el.style.top = `${Math.round(top)}px`
  el.style.height = `${Math.round(bottom - top)}px`
  el.style.opacity = '1'
}

type RsiDivergencesCalc = ReturnType<typeof calculateRsiDivergences>

// Rebuilds all series on the chart: zone levels, the RSI line, and one
// 2-point line series per divergence segment.
function applyRsiDivergenceSeries(
  chart: IChartApi,
  lightweightCharts: LightweightChartsModule,
  seriesRefs: Map<string, ISeriesApi<'Line'>>,
  calc: RsiDivergencesCalc,
  cappedDivergences: RsiDivergence[],
): void {
  const { LineSeries, LineStyle } = lightweightCharts

  // Clear existing series.
  seriesRefs.forEach((series) => {
    try {
      chart.removeSeries(series)
    } catch {
      // ignore
    }
  })
  seriesRefs.clear()

  // Caretaker zone levels (80 crit bull / 62 ctrl bull / 50 mid / 38 ctrl bear / 20 crit bear)
  const zoneLineDefs = [
    { key: 'level_crit_bull', data: calc.levels.critBull, color: COLORS.zoneBullLine, lineStyle: LineStyle.Dashed },
    { key: 'level_cont_bull', data: calc.levels.contBull, color: COLORS.zoneBullLine, lineStyle: LineStyle.Dotted },
    { key: 'level_mid', data: calc.levels.middle, color: 'oklch(0.7118 0.0129 286.07 / 0.22)', lineStyle: LineStyle.Solid },
    { key: 'level_cont_bear', data: calc.levels.contBear, color: COLORS.zoneBearLine, lineStyle: LineStyle.Dotted },
    { key: 'level_crit_bear', data: calc.levels.critBear, color: COLORS.zoneBearLine, lineStyle: LineStyle.Dashed },
  ] as const
  for (const def of zoneLineDefs) {
    const levelSeries = chart.addSeries(LineSeries, {
      lineWidth: 1,
      color: def.color,
      title: '',
      lineStyle: def.lineStyle,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    levelSeries.setData(def.data as { time: Time; value: number }[])
    seriesRefs.set(def.key, levelSeries)
  }

  const rsiSeries = chart.addSeries(LineSeries, {
    lineWidth: 2,
    color: COLORS.rsi,
    title: '',
    lastValueVisible: true,
    priceLineVisible: false,
  })
  rsiSeries.setData(calc.rsiSeries as { time: Time; value: number }[])
  seriesRefs.set('rsi', rsiSeries)

  // Divergence segments (each as a 2-point line series)
  for (const div of cappedDivergences) {
    const isHidden = div.type === 'h_bullish' || div.type === 'h_bearish'
    const series = chart.addSeries(LineSeries, {
      lineWidth: 2,
      color: divergenceColor(div),
      title: '',
      lineStyle: isHidden ? LineStyle.Dashed : LineStyle.Solid,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    series.setData([
      { time: div.startTime as Time, value: div.rsiStart },
      { time: div.endTime as Time, value: div.rsiEnd },
    ])
    seriesRefs.set(`div_${div.startIndex}_${div.endIndex}_${div.type}`, series)
  }
}

interface ZoneFillEls {
  bull: HTMLDivElement
  bear: HTMLDivElement
}

// Bull/bear zone fills (DOM overlay, lightweight-charts has no hline fills).
function buildZoneFillEls(zoneLayer: HTMLDivElement | null): ZoneFillEls | null {
  if (!zoneLayer) return null
  zoneLayer.innerHTML = ''
  const makeZoneEl = (background: string) => {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.left = '0'
    el.style.right = '0'
    el.style.top = '0'
    el.style.height = '0'
    el.style.opacity = '0'
    el.style.background = background
    zoneLayer.appendChild(el)
    return el
  }
  return { bull: makeZoneEl(COLORS.zoneBullFill), bear: makeZoneEl(COLORS.zoneBearFill) }
}

interface DivergenceLabelEl {
  el: HTMLDivElement
  divergence: RsiDivergence
}

// Labels at divergence endpoints (DOM overlay).
function buildDivergenceLabelEls(
  labelLayer: HTMLDivElement | null,
  cappedDivergences: RsiDivergence[],
  showLabels: boolean,
): DivergenceLabelEl[] {
  const labelEls: DivergenceLabelEl[] = []
  if (!labelLayer) return labelEls

  labelLayer.innerHTML = ''
  if (showLabels) {
    for (const div of cappedDivergences) {
      const el = document.createElement('div')
      el.className =
        'absolute select-none text-[10px] font-berkeley-mono font-semibold px-1.5 py-0.5 rounded-md shadow-sm shadow-black/20'
      el.style.color = 'oklch(1 0 0 / 0.96)'
      el.style.background = divergenceColor(div)
      el.style.transform = 'translate3d(-9999px, -9999px, 0)'
      el.style.opacity = '0'
      el.textContent = divergenceLabel(div)
      labelLayer.appendChild(el)
      labelEls.push({ el, divergence: div })
    }
  }
  return labelEls
}

// RAF-batched updater that repositions zone fills + divergence labels to the
// current chart coordinates. Reads through refs so it always sees the live
// chart/series for this component instance.
function createOverlayPositionUpdater(args: {
  chartRef: RefObject<IChartApi | null>
  chartContainerRef: RefObject<HTMLDivElement | null>
  seriesRefs: RefObject<Map<string, ISeriesApi<'Line'>>>
  labelUpdateRafRef: RefObject<number | null>
  zoneEls: ZoneFillEls | null
  labelEls: DivergenceLabelEl[]
}): () => void {
  const { chartRef, chartContainerRef, seriesRefs, labelUpdateRafRef, zoneEls, labelEls } = args

  return () => {
    if (labelUpdateRafRef.current) cancelAnimationFrame(labelUpdateRafRef.current)
    labelUpdateRafRef.current = requestAnimationFrame(() => {
      labelUpdateRafRef.current = null
      if (!chartRef.current) return
      const c = chartRef.current
      const s = seriesRefs.current.get('rsi') as ISeriesApi<'Line'> | undefined
      if (!s) return

      const width = Math.max(1, chartContainerRef.current?.clientWidth ?? 1)
      const heightPx = Math.max(1, chartContainerRef.current?.clientHeight ?? 1)

      if (zoneEls) {
        positionZoneEl(zoneEls.bull, s, RSI_ZONE_LEVELS.critBull, RSI_ZONE_LEVELS.contBull, heightPx)
        positionZoneEl(zoneEls.bear, s, RSI_ZONE_LEVELS.contBear, RSI_ZONE_LEVELS.critBear, heightPx)
      }

      for (const { el, divergence } of labelEls) {
        const x = c.timeScale().timeToCoordinate(divergence.endTime as Time)
        const y = s.priceToCoordinate(divergence.rsiEnd)
        if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
          el.style.opacity = '0'
          el.style.transform = 'translate3d(-9999px, -9999px, 0)'
          continue
        }

        if (x < -20 || x > width + 20 || y < -20 || y > heightPx + 20) {
          el.style.opacity = '0'
          el.style.transform = 'translate3d(-9999px, -9999px, 0)'
          continue
        }

        el.style.opacity = '1'
        el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -120%)`
      }
    })
  }
}

export function RsiDivergencesChart({
  data,
  height = 250,
  showTimeAxis = false,
  initialWindowDays,
  showLabels = true,
}: RsiDivergencesChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const lightweightChartsRef = useRef<LightweightChartsModule | null>(null)
  const hasAppliedInitialRangeRef = useRef(false)
  const [chartReadyNonce, setChartReadyNonce] = useState(0)
  const initialWindowSeconds = getInitialWindowSeconds(initialWindowDays)

  const labelLayerRef = useRef<HTMLDivElement | null>(null)
  const zoneLayerRef = useRef<HTMLDivElement | null>(null)
  const labelUpdateRafRef = useRef<number | null>(null)
  const labelCleanupRef = useRef<(() => void) | null>(null)
  const labelUpdateFnRef = useRef<(() => void) | null>(null)

  const normalizedData = useMemo(() => normalizeIndicatorOhlcv(data), [data])
  const calc = useMemo(() => calculateRsiDivergences(normalizedData), [normalizedData])
  const cappedDivergences = useMemo(() => {
    const all = calc.divergences
    if (all.length <= MAX_DIVERGENCE_LINES) return all
    return all.slice(-MAX_DIVERGENCE_LINES)
  }, [calc.divergences])

  const dataSignature = `${normalizedData.length}:${String(normalizedData[0]?.time ?? '')}:${String(normalizedData[normalizedData.length - 1]?.time ?? '')}`

  useEffect(() => {
    hasAppliedInitialRangeRef.current = false
  }, [dataSignature, initialWindowSeconds])

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
          scaleMargins: { top: 0.12, bottom: 0.12 },
        }),
      )

      chartRef.current = chart
      hasAppliedInitialRangeRef.current = false
      if (!isCancelled) setChartReadyNonce((prev) => prev + 1)

      const detachResize = attachChartResize(chart, container, height, () => labelUpdateFnRef.current?.())
      const detachScrubSync = attachChartScrubSync(chart, container, 'rsi-divergences')

      // Zone fill layer (DOM overlay, behind scrub line and labels).
      const zoneLayer = createOverlayLayer(container, '1', true)
      zoneLayerRef.current = zoneLayer

      // Label layer (DOM overlay).
      const labelLayer = createOverlayLayer(container, '6')
      labelLayerRef.current = labelLayer

      cleanup = () => {
        detachResize()
        detachScrubSync()
        if (labelUpdateRafRef.current) cancelAnimationFrame(labelUpdateRafRef.current)
        labelCleanupRef.current?.()
        labelUpdateFnRef.current = null
        if (container.contains(labelLayer)) container.removeChild(labelLayer)
        labelLayerRef.current = null
        if (container.contains(zoneLayer)) container.removeChild(zoneLayer)
        zoneLayerRef.current = null
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

    // Clear any previous label subscriptions for this chart instance.
    labelCleanupRef.current?.()
    labelCleanupRef.current = null

    applyRsiDivergenceSeries(chart, lightweightCharts, seriesRefs.current, calc, cappedDivergences)

    const zoneEls = buildZoneFillEls(zoneLayerRef.current)
    const labelEls = buildDivergenceLabelEls(labelLayerRef.current, cappedDivergences, showLabels)

    const scheduleLabelUpdate = createOverlayPositionUpdater({
      chartRef,
      chartContainerRef,
      seriesRefs,
      labelUpdateRafRef,
      zoneEls,
      labelEls,
    })

    // Keep labels in sync with zoom/scroll.
    chart.timeScale().subscribeVisibleTimeRangeChange(scheduleLabelUpdate)
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleLabelUpdate)
    scheduleLabelUpdate()
    labelUpdateFnRef.current = scheduleLabelUpdate

    labelCleanupRef.current = () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleLabelUpdate)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleLabelUpdate)
    }

    if (!hasAppliedInitialRangeRef.current) {
      applyInitialVisibleRange(chart, normalizedData, initialWindowSeconds)
      hasAppliedInitialRangeRef.current = true
    }
  }, [calc, cappedDivergences, chartReadyNonce, initialWindowSeconds, normalizedData, showLabels])

  if (!normalizedData.length) return null

  return (
    <div className="w-full p-1">
      <div className="p-0 relative">
        <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
      </div>
    </div>
  )
}
