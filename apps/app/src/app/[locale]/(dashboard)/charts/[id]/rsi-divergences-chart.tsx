'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import { calculateRsiDivergences, type RsiDivergence } from '@/hooks/market-vision/rsi-divergences'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'
import { clearChartScrub, getChartScrubSnapshot, setChartScrub, subscribeToChartScrub } from '@/hooks/chart-scrub-store'
import { timeToEpochSeconds } from '@/hooks/use-chart-instance/utils'

interface RsiDivergencesChartProps {
  data: OHLCVDataPoint[]
  height?: number
  showTimeAxis?: boolean
  initialWindowDays?: number
  showLabels?: boolean
}

const SECONDS_PER_DAY = 24 * 60 * 60
const DEFAULT_WINDOW_DAYS = 3
const RIGHT_OFFSET_BARS = 12
const MAX_DIVERGENCE_LINES = 200

const COLORS = {
  rsi: 'rgba(59, 130, 246, 0.70)', // blue-500
  levels: 'rgba(161, 161, 170, 0.35)', // zinc-400
  bull: 'rgba(16, 185, 129, 0.95)', // emerald-500
  bear: 'rgba(244, 63, 94, 0.95)', // rose-500
  hiddenBull: 'rgba(20, 184, 166, 0.95)', // teal-500
  hiddenBear: 'rgba(249, 115, 22, 0.95)', // orange-500
} as const

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

      const { createChart, ColorType, CrosshairMode, LineStyle } = lightweightCharts

      if (isCancelled || !chartContainerRef.current) return

      const chart = createChart(chartContainerRef.current, {
        handleScale: true,
        handleScroll: true,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
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
          scaleMargins: { top: 0.12, bottom: 0.12 },
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

      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height,
          })
        }
        labelUpdateFnRef.current?.()
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
        if (!chartContainerRef.current || scrub.epochSeconds == null || scrub.sourceId === 'rsi-divergences') {
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

      const handleCrosshairMove = (param: { point?: { x: number; y: number }; time?: Time }) => {
        if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
          clearChartScrub()
          return
        }
        setChartScrub(timeToEpochSeconds(param.time) ?? null, 'rsi-divergences')
      }
      chart.subscribeCrosshairMove(handleCrosshairMove)

      // Label layer (DOM overlay).
      const labelLayer = document.createElement('div')
      labelLayer.className = 'pointer-events-none absolute inset-0'
      labelLayer.style.zIndex = '6'
      labelLayer.setAttribute('aria-hidden', 'true')
      chartContainerRef.current.appendChild(labelLayer)
      labelLayerRef.current = labelLayer

      cleanup = () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId)
        resizeObserver?.disconnect()
        unsubscribeWindowResize?.()
        chart.unsubscribeCrosshairMove(handleCrosshairMove)
        chart.timeScale().unsubscribeVisibleTimeRangeChange(updateScrubLine)
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateScrubLine)
        unsubscribeScrub()
        if (chartContainerRef.current?.contains(scrubLineEl)) chartContainerRef.current.removeChild(scrubLineEl)
        if (labelUpdateRafRef.current) cancelAnimationFrame(labelUpdateRafRef.current)
        labelCleanupRef.current?.()
        labelUpdateFnRef.current = null
        if (chartContainerRef.current?.contains(labelLayer)) chartContainerRef.current.removeChild(labelLayer)
        labelLayerRef.current = null
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

    // Clear any previous label subscriptions for this chart instance.
    labelCleanupRef.current?.()
    labelCleanupRef.current = null

    // Clear existing series.
    seriesRefs.current.forEach((series) => {
      try {
        chart.removeSeries(series)
      } catch {
        // ignore
      }
    })
    seriesRefs.current.clear()

    // RSI levels (70/50/30)
    const levelStyle = LineStyle.Dotted
    const overboughtSeries = chart.addSeries(LineSeries, {
      lineWidth: 1,
      color: COLORS.levels,
      title: '',
      lineStyle: levelStyle,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    overboughtSeries.setData(calc.levels.overbought as { time: Time; value: number }[])
    seriesRefs.current.set('level_70', overboughtSeries)

    const middleSeries = chart.addSeries(LineSeries, {
      lineWidth: 1,
      color: 'rgba(161, 161, 170, 0.22)',
      title: '',
      lineStyle: LineStyle.Solid,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    middleSeries.setData(calc.levels.middle as { time: Time; value: number }[])
    seriesRefs.current.set('level_50', middleSeries)

    const oversoldSeries = chart.addSeries(LineSeries, {
      lineWidth: 1,
      color: COLORS.levels,
      title: '',
      lineStyle: levelStyle,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    oversoldSeries.setData(calc.levels.oversold as { time: Time; value: number }[])
    seriesRefs.current.set('level_30', oversoldSeries)

    const rsiSeries = chart.addSeries(LineSeries, {
      lineWidth: 2,
      color: COLORS.rsi,
      title: '',
      lastValueVisible: true,
      priceLineVisible: false,
    })
    rsiSeries.setData(calc.rsiSeries as { time: Time; value: number }[])
    seriesRefs.current.set('rsi', rsiSeries)

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
      seriesRefs.current.set(`div_${div.startIndex}_${div.endIndex}_${div.type}`, series)
    }

    // Labels at divergence endpoints (DOM overlay).
    const labelLayer = labelLayerRef.current
    const labelEls: Array<{ el: HTMLDivElement; divergence: RsiDivergence }> = []
    if (labelLayer) {
      labelLayer.innerHTML = ''
      if (showLabels) {
        for (const div of cappedDivergences) {
          const el = document.createElement('div')
          el.className =
            'absolute select-none text-[10px] font-berkeley-mono font-semibold px-1.5 py-0.5 rounded-md shadow-sm shadow-black/20'
          el.style.color = 'rgba(255,255,255,0.96)'
          el.style.background = divergenceColor(div)
          el.style.transform = 'translate3d(-9999px, -9999px, 0)'
          el.style.opacity = '0'
          el.textContent = divergenceLabel(div)
          labelLayer.appendChild(el)
          labelEls.push({ el, divergence: div })
        }
      }
    }

    const scheduleLabelUpdate = () => {
      if (!showLabels) return
      if (labelUpdateRafRef.current) cancelAnimationFrame(labelUpdateRafRef.current)
      labelUpdateRafRef.current = requestAnimationFrame(() => {
        labelUpdateRafRef.current = null
        if (!chartRef.current) return
        const c = chartRef.current
        const s = seriesRefs.current.get('rsi') as ISeriesApi<'Line'> | undefined
        if (!s || labelEls.length === 0) return

        const width = Math.max(1, chartContainerRef.current?.clientWidth ?? 1)
        const heightPx = Math.max(1, chartContainerRef.current?.clientHeight ?? 1)

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
  }, [calc.levels.middle, calc.levels.overbought, calc.levels.oversold, calc.rsiSeries, cappedDivergences, chartReadyNonce, initialWindowSeconds, normalizedData, showLabels])

  if (!normalizedData.length) return null

  return (
    <div className="w-full p-1">
      <div className="p-0 relative">
        <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
      </div>
    </div>
  )
}

