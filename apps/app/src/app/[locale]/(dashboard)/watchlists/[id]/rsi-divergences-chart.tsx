'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time } from 'lightweight-charts'
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
const MAX_PIVOT_MARKERS = 200
const RSI_SCALE_HIGH = 100
const RSI_SCALE_LOW = 0

// Caretaker palette: cyan RSI + white signal, cyan bull / fuchsia bear zones,
// yellow alerts, green/red regular divergences, blue/orange hidden.
const COLORS = {
  rsi: 'oklch(0.7891 0.1546 211.53 / 0.95)', // cyan-400
  signal: 'oklch(1 0 0 / 0.9)', // white
  levels: 'oklch(0.7118 0.0129 286.07 / 0.35)', // zinc-400
  midLine: 'oklch(0.7118 0.0129 286.07 / 0.22)', // zinc-400, midline
  bull: 'oklch(0.7227 0.192 149.58 / 0.95)', // green-500
  bear: 'oklch(0.6368 0.2078 25.33 / 0.95)', // red-500
  hiddenBull: 'oklch(0.7137 0.1434 254.62 / 0.95)', // blue-400
  hiddenBear: 'oklch(0.7049 0.1867 47.6 / 0.95)', // orange-500
  zoneBullLine: 'oklch(0.7891 0.1546 211.53 / 0.45)', // cyan-400
  zoneBearLine: 'oklch(0.6669 0.2591 322.15 / 0.45)', // fuchsia-500
  zoneBullFill: 'oklch(0.7891 0.1546 211.53 / 0.08)', // cyan-400 control fill
  zoneBearFill: 'oklch(0.6669 0.2591 322.15 / 0.08)', // fuchsia-500 control fill
  critBullFill: 'oklch(0.7891 0.1546 211.53 / 0.14)', // cyan-400 critical fill
  critBearFill: 'oklch(0.6669 0.2591 322.15 / 0.14)', // fuchsia-500 critical fill
  alertLine: 'oklch(0.8601 0.1731 91.84 / 0.55)', // yellow-400
  alertFill: 'oklch(0.8601 0.1731 91.84 / 0.07)', // yellow-400 highlight
  pivotMarker: 'oklch(1 0 0 / 0.85)', // white
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

// Rebuilds all series on the chart: zone levels, the RSI line + signal line,
// one 2-point line series per divergence segment, and pivot arrow markers.
// Ordering is load-bearing: the markers plugin must be cleared before any
// removeSeries call and re-attached only after ALL setData calls, or
// lightweight-charts can throw "Value is null" in _recalculateMarkers.
function applyRsiDivergenceSeries(
  chart: IChartApi,
  lightweightCharts: LightweightChartsModule,
  seriesRefs: Map<string, ISeriesApi<'Line'>>,
  markersRef: RefObject<ISeriesMarkersPluginApi<Time> | null>,
  calc: RsiDivergencesCalc,
  cappedDivergences: RsiDivergence[],
): void {
  const { LineSeries, LineStyle, createSeriesMarkers } = lightweightCharts

  // Clear the markers plugin before tearing down the series it is attached to.
  try {
    markersRef.current?.setMarkers([])
  } catch {
    // ignore — plugin may belong to an already-removed series
  }
  markersRef.current = null

  // Clear existing series.
  seriesRefs.forEach((series) => {
    try {
      chart.removeSeries(series)
    } catch {
      // ignore
    }
  })
  seriesRefs.clear()

  // Caretaker levels (85 alert / 80 crit bull / 62 ctrl bull / 50 mid / 38 ctrl bear / 20 crit bear / 15 alert)
  const zoneLineDefs = [
    { key: 'level_alert_high', data: calc.levels.alertHigh, color: COLORS.alertLine, lineStyle: LineStyle.Dotted },
    { key: 'level_crit_bull', data: calc.levels.critBull, color: COLORS.zoneBullLine, lineStyle: LineStyle.Dashed },
    { key: 'level_cont_bull', data: calc.levels.contBull, color: COLORS.zoneBullLine, lineStyle: LineStyle.Dotted },
    { key: 'level_mid', data: calc.levels.middle, color: COLORS.midLine, lineStyle: LineStyle.Solid },
    { key: 'level_cont_bear', data: calc.levels.contBear, color: COLORS.zoneBearLine, lineStyle: LineStyle.Dotted },
    { key: 'level_crit_bear', data: calc.levels.critBear, color: COLORS.zoneBearLine, lineStyle: LineStyle.Dashed },
    { key: 'level_alert_low', data: calc.levels.alertLow, color: COLORS.alertLine, lineStyle: LineStyle.Dotted },
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

  const signalSeries = chart.addSeries(LineSeries, {
    lineWidth: 2,
    color: COLORS.signal,
    title: '',
    lastValueVisible: false,
    priceLineVisible: false,
  })
  signalSeries.setData(calc.signalSeries as { time: Time; value: number }[])
  seriesRefs.set('signal', signalSeries)

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

  // Pivot arrow markers, attached last (after all setData calls).
  const pivotMarkers: SeriesMarker<Time>[] = calc.pivots
    .slice(-MAX_PIVOT_MARKERS)
    .map((pivot) => ({
      time: pivot.time as Time,
      position: pivot.kind === 'high' ? ('aboveBar' as const) : ('belowBar' as const),
      shape: pivot.kind === 'high' ? ('arrowDown' as const) : ('arrowUp' as const),
      color: COLORS.pivotMarker,
      size: 0.6,
    }))
    .sort((a, b) => (a.time as number) - (b.time as number))
  markersRef.current = createSeriesMarkers(rsiSeries, pivotMarkers)
}

interface ZoneFillSpec {
  el: HTMLDivElement
  upper: number
  lower: number
  enabled: boolean
}

// Zone fills (DOM overlay, lightweight-charts has no hline fills): control and
// critical bands always on, alert highlights only while RSI is beyond them.
function buildZoneFillEls(zoneLayer: HTMLDivElement | null, calc: RsiDivergencesCalc): ZoneFillSpec[] {
  if (!zoneLayer) return []
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
  return [
    { el: makeZoneEl(COLORS.critBullFill), upper: RSI_SCALE_HIGH, lower: RSI_ZONE_LEVELS.critBull, enabled: true },
    { el: makeZoneEl(COLORS.zoneBullFill), upper: RSI_ZONE_LEVELS.critBull, lower: RSI_ZONE_LEVELS.contBull, enabled: true },
    { el: makeZoneEl(COLORS.zoneBearFill), upper: RSI_ZONE_LEVELS.contBear, lower: RSI_ZONE_LEVELS.critBear, enabled: true },
    { el: makeZoneEl(COLORS.critBearFill), upper: RSI_ZONE_LEVELS.critBear, lower: RSI_SCALE_LOW, enabled: true },
    { el: makeZoneEl(COLORS.alertFill), upper: RSI_SCALE_HIGH, lower: calc.alerts.high, enabled: calc.alerts.highOn },
    { el: makeZoneEl(COLORS.alertFill), upper: calc.alerts.low, lower: RSI_SCALE_LOW, enabled: calc.alerts.lowOn },
  ]
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
  zoneEls: ZoneFillSpec[]
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

      for (const zone of zoneEls) {
        if (!zone.enabled) {
          zone.el.style.opacity = '0'
          continue
        }
        positionZoneEl(zone.el, s, zone.upper, zone.lower, heightPx)
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
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
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
        markersRef.current = null
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

    applyRsiDivergenceSeries(chart, lightweightCharts, seriesRefs.current, markersRef, calc, cappedDivergences)

    const zoneEls = buildZoneFillEls(zoneLayerRef.current, calc)
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
