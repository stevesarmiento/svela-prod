'use client'

import { useRef, useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { useMarketVisionB, type MarketVisionBConfig } from '@/hooks/market-vision'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
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

type MarketVisionSeriesApi = ISeriesApi<'Line'> | ISeriesApi<'Histogram'> | ISeriesApi<'Baseline'>

const SECONDS_PER_DAY = 24 * 60 * 60
const DEFAULT_WINDOW_DAYS = 3
const RIGHT_OFFSET_BARS = 12
const MFI_VISUAL_SCALE = 0.6

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
  const seriesRefs = useRef<Map<string, MarketVisionSeriesApi>>(new Map())
  const lightweightChartsRef = useRef<LightweightChartsModule | null>(null)
  const hasAppliedInitialRangeRef = useRef(false)
  const [chartReadyNonce, setChartReadyNonce] = useState(0)
  const stochDataRef = useRef<{
    k: Array<{ time: number; value: number }>
    d: Array<{ time: number; value: number }>
  } | null>(null)
  const kdFillLayerRef = useRef<SVGSVGElement | null>(null)
  const kdFillPathsRef = useRef<{ up: SVGPathElement; down: SVGPathElement } | null>(null)
  const kdFillScheduleRef = useRef<(() => void) | null>(null)
  const plotcharDataRef = useRef<
    Array<
      | {
          kind: 'dot'
          time: number
          value: number
          color?: string
          diameterPx: number
          opacity: number
        }
      | {
          kind: 'text'
          time: number
          value: number
          color?: string
          text: string
          fontSizePx: number
          opacity: number
        }
    >
  >([])
  const plotcharLayerRef = useRef<HTMLDivElement | null>(null)
  const plotcharScheduleRef = useRef<(() => void) | null>(null)
  const initialWindowSeconds = getInitialWindowSeconds(initialWindowDays)
  const dataSignature = `${data.length}:${String(data[0]?.time ?? '')}:${String(data[data.length - 1]?.time ?? '')}`

  useEffect(() => {
    hasAppliedInitialRangeRef.current = false
  }, [dataSignature, initialWindowSeconds])

  // Calculate all MarketVision B indicators
  const calculations = useMarketVisionB(data, config)
  const isDarkMode = Boolean(config?.mode?.darkMode)

  useEffect(() => {
    if (!chartContainerRef.current) return

    let isCancelled = false
    let cleanup: (() => void) | null = null

    const isDarkMode = Boolean(config?.mode?.darkMode)

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
          background: { type: ColorType.Solid, color: isDarkMode ? "#000000" : "transparent" },
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
        kdFillScheduleRef.current?.()
        plotcharScheduleRef.current?.()
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

      // Stoch K/D fill (Pine-style band fill between K and D).
      const kdSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      kdSvg.setAttribute('aria-hidden', 'true')
      kdSvg.style.position = 'absolute'
      kdSvg.style.inset = '0'
      kdSvg.style.pointerEvents = 'none'
      kdSvg.style.zIndex = '4'
      kdSvg.style.opacity = '1'
      chartContainerRef.current.appendChild(kdSvg)
      kdFillLayerRef.current = kdSvg

      const kdPathUp = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const kdPathDown = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      kdPathUp.setAttribute('fill', 'rgba(33, 186, 243, 0.05)') // Pine: color.new(#21baf3, 95)
      kdPathDown.setAttribute('fill', 'rgba(103, 58, 183, 0.10)') // Pine: color.new(#673ab7, 90)
      kdPathUp.setAttribute('stroke', 'none')
      kdPathDown.setAttribute('stroke', 'none')
      kdSvg.appendChild(kdPathUp)
      kdSvg.appendChild(kdPathDown)
      kdFillPathsRef.current = { up: kdPathUp, down: kdPathDown }

      let kdRafId: number | null = null
      const scheduleKdFillUpdate = () => {
        if (kdRafId) cancelAnimationFrame(kdRafId)
        kdRafId = requestAnimationFrame(() => {
          kdRafId = null
          if (!chartContainerRef.current || !kdFillLayerRef.current || !kdFillPathsRef.current) return

          const width = Math.max(1, chartContainerRef.current.clientWidth)
          const height = Math.max(1, chartContainerRef.current.clientHeight)
          kdFillLayerRef.current.setAttribute('width', String(width))
          kdFillLayerRef.current.setAttribute('height', String(height))
          kdFillLayerRef.current.setAttribute('viewBox', `0 0 ${width} ${height}`)

          const anchorSeries = seriesRefs.current.get('stochK')
          if (!chartRef.current || !anchorSeries) {
            kdFillPathsRef.current.up.setAttribute('d', '')
            kdFillPathsRef.current.down.setAttribute('d', '')
            return
          }

          const stoch = stochDataRef.current
          if (!stoch || stoch.k.length === 0 || stoch.d.length === 0) {
            kdFillPathsRef.current.up.setAttribute('d', '')
            kdFillPathsRef.current.down.setAttribute('d', '')
            return
          }

          const dByTime = new Map<number, number>()
          for (const p of stoch.d) dByTime.set(p.time, p.value)

          const range = chartRef.current.timeScale().getVisibleRange()
          const from = range ? Number(range.from) : Number.NEGATIVE_INFINITY
          const to = range ? Number(range.to) : Number.POSITIVE_INFINITY

          type Pair = { time: number; k: number; d: number }
          const pairs: Pair[] = []
          for (const p of stoch.k) {
            if (p.time < from || p.time > to) continue
            const dv = dByTime.get(p.time)
            if (typeof dv !== 'number' || !Number.isFinite(dv)) continue
            if (!Number.isFinite(p.value)) continue
            pairs.push({ time: p.time, k: p.value, d: dv })
          }

          if (pairs.length < 2) {
            kdFillPathsRef.current.up.setAttribute('d', '')
            kdFillPathsRef.current.down.setAttribute('d', '')
            return
          }

          let upD = ''
          let downD = ''

          function appendPoly(target: 'up' | 'down', pts: Array<{ x: number; y: number }>) {
            if (pts.length < 3) return
            const d = `M ${pts[0]!.x} ${pts[0]!.y} ${pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ')} Z `
            if (target === 'up') upD += d
            else downD += d
          }

          for (let i = 0; i < pairs.length - 1; i++) {
            const a = pairs[i]!
            const b = pairs[i + 1]!

            const x0 = chartRef.current.timeScale().timeToCoordinate(a.time as Time)
            const x1 = chartRef.current.timeScale().timeToCoordinate(b.time as Time)
            if (x0 == null || x1 == null || !Number.isFinite(x0) || !Number.isFinite(x1)) continue

            const yK0 = anchorSeries.priceToCoordinate(a.k)
            const yD0 = anchorSeries.priceToCoordinate(a.d)
            const yK1 = anchorSeries.priceToCoordinate(b.k)
            const yD1 = anchorSeries.priceToCoordinate(b.d)
            if (yK0 == null || yD0 == null || yK1 == null || yD1 == null) continue
            if (![yK0, yD0, yK1, yD1].every((v) => Number.isFinite(v))) continue

            const diff0 = a.k - a.d
            const diff1 = b.k - b.d
            const aUp = diff0 >= 0
            const bUp = diff1 >= 0

            if (aUp === bUp || !Number.isFinite(diff0) || !Number.isFinite(diff1) || diff0 === diff1) {
              appendPoly(aUp ? 'up' : 'down', [
                { x: x0, y: yK0 },
                { x: x1, y: yK1 },
                { x: x1, y: yD1 },
                { x: x0, y: yD0 },
              ])
              continue
            }

            // Split at the crossing between K and D.
            const t = diff0 / (diff0 - diff1)
            if (!Number.isFinite(t) || t < 0 || t > 1) continue
            const xI = x0 + (x1 - x0) * t
            const kI = a.k + (b.k - a.k) * t
            const yI = anchorSeries.priceToCoordinate(kI)
            if (yI == null || !Number.isFinite(yI) || !Number.isFinite(xI)) continue

            appendPoly(aUp ? 'up' : 'down', [
              { x: x0, y: yK0 },
              { x: xI, y: yI },
              { x: xI, y: yI },
              { x: x0, y: yD0 },
            ])
            appendPoly(bUp ? 'up' : 'down', [
              { x: xI, y: yI },
              { x: x1, y: yK1 },
              { x: x1, y: yD1 },
              { x: xI, y: yI },
            ])
          }

          kdFillPathsRef.current.up.setAttribute('d', upD)
          kdFillPathsRef.current.down.setAttribute('d', downD)
        })
      }

      kdFillScheduleRef.current = scheduleKdFillUpdate

      // Pine plotchar glyph markers (·, •, ⚑, ◆) as a DOM overlay.
      const plotcharLayer = document.createElement('div')
      plotcharLayer.className = 'pointer-events-none absolute inset-0'
      plotcharLayer.style.zIndex = '6'
      plotcharLayer.setAttribute('aria-hidden', 'true')
      chartContainerRef.current.appendChild(plotcharLayer)
      plotcharLayerRef.current = plotcharLayer

      let plotcharRafId: number | null = null
      const schedulePlotcharUpdate = () => {
        if (plotcharRafId) cancelAnimationFrame(plotcharRafId)
        plotcharRafId = requestAnimationFrame(() => {
          plotcharRafId = null
          if (!chartRef.current || !plotcharLayerRef.current) return

          const layer = plotcharLayerRef.current
          layer.innerHTML = ''

          const width = Math.max(1, chartContainerRef.current?.clientWidth ?? 1)
          const heightPx = Math.max(1, chartContainerRef.current?.clientHeight ?? 1)

          const anchor = seriesRefs.current.get('zero') ?? seriesRefs.current.get('wt2') ?? seriesRefs.current.get('rsi')

          if (!anchor) return

          const range = chartRef.current.timeScale().getVisibleRange()
          const from = range ? Number(range.from) : Number.NEGATIVE_INFINITY
          const to = range ? Number(range.to) : Number.POSITIVE_INFINITY

          for (const p of plotcharDataRef.current) {
            if (p.time < from || p.time > to) continue

            const x = chartRef.current.timeScale().timeToCoordinate(p.time as Time)
            const y = anchor.priceToCoordinate(p.value)
            if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue

            if (x < -20 || x > width + 20 || y < -20 || y > heightPx + 20) continue

            if (p.kind === 'dot') {
              const el = document.createElement('div')
              el.style.position = 'absolute'
              el.style.left = '0'
              el.style.top = '0'
              el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`
              el.style.width = `${p.diameterPx}px`
              el.style.height = `${p.diameterPx}px`
              el.style.borderRadius = '9999px'
              el.style.background = p.color ?? '#ffffff'
              el.style.opacity = String(p.opacity)
              layer.appendChild(el)
            } else {
              const el = document.createElement('span')
              el.textContent = p.text
              el.style.position = 'absolute'
              el.style.left = '0'
              el.style.top = '0'
              el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`
              el.style.color = p.color ?? '#ffffff'
              el.style.opacity = String(p.opacity)
              el.style.fontSize = `${p.fontSizePx}px`
              el.style.lineHeight = '1'
              el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
              layer.appendChild(el)
            }
          }
        })
      }

      plotcharScheduleRef.current = schedulePlotcharUpdate

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
      chart.timeScale().subscribeVisibleTimeRangeChange(scheduleKdFillUpdate)
      chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleKdFillUpdate)
      chart.timeScale().subscribeVisibleTimeRangeChange(schedulePlotcharUpdate)
      chart.timeScale().subscribeVisibleLogicalRangeChange(schedulePlotcharUpdate)
      updateScrubLine()
      scheduleKdFillUpdate()
      schedulePlotcharUpdate()

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
        if (kdRafId) cancelAnimationFrame(kdRafId)
        if (plotcharRafId) cancelAnimationFrame(plotcharRafId)
        if (resizeRafId) cancelAnimationFrame(resizeRafId)
        resizeObserver?.disconnect()
        unsubscribeWindowResize?.()
        chart.unsubscribeCrosshairMove(handleCrosshairMove)
        chart.timeScale().unsubscribeVisibleTimeRangeChange(updateScrubLine)
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateScrubLine)
        chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleKdFillUpdate)
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleKdFillUpdate)
        chart.timeScale().unsubscribeVisibleTimeRangeChange(schedulePlotcharUpdate)
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedulePlotcharUpdate)
        unsubscribeScrub()
        if (chartContainerRef.current?.contains(scrubLineEl)) chartContainerRef.current.removeChild(scrubLineEl)
        if (chartContainerRef.current?.contains(kdSvg)) chartContainerRef.current.removeChild(kdSvg)
        if (chartContainerRef.current?.contains(plotcharLayer)) chartContainerRef.current.removeChild(plotcharLayer)
        kdFillLayerRef.current = null
        kdFillPathsRef.current = null
        kdFillScheduleRef.current = null
        plotcharLayerRef.current = null
        plotcharScheduleRef.current = null
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
    const { LineSeries, HistogramSeries, BaselineSeries, LineStyle, LineType } = lightweightCharts

    function withAlpha(color: string | undefined, alpha: number): string | undefined {
      if (!color) return undefined
      if (!Number.isFinite(alpha)) return color
      const a = Math.max(0, Math.min(1, alpha))

      if (color.startsWith('rgba(')) {
        const m = color.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/i)
        if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`
        return color
      }
      if (color.startsWith('rgb(')) {
        const m = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
        if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`
        return color
      }
      if (color.startsWith('#')) {
        const hex = color.slice(1)
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
        if (full.length === 6) {
          const r = Number.parseInt(full.slice(0, 2), 16)
          const g = Number.parseInt(full.slice(2, 4), 16)
          const b = Number.parseInt(full.slice(4, 6), 16)
          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return `rgba(${r}, ${g}, ${b}, ${a})`
        }
      }
      return color
    }

    const hasAnyData =
      Boolean(calculations.series.wt1.length) ||
      Boolean(calculations.series.wt2.length) ||
      Boolean(calculations.series.rsiMfi.length) ||
      Boolean(calculations.series.wtCrossCircles.length)

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
    stochDataRef.current = null
    kdFillScheduleRef.current?.()
    plotcharDataRef.current = []
    plotcharScheduleRef.current?.()

    // Zero line
    if (calculations.levels.zero.length) {
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

    // WT1 / WT2 waves
    if (calculations.series.wt1.length) {
      const wt1 = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topLineColor: withAlpha('#4994ec', 0.7),
        bottomLineColor: withAlpha('#4994ec', 0.7),
        topFillColor1: withAlpha('#4994ec', 0.35),
        topFillColor2: withAlpha('#4994ec', 0.35),
        bottomFillColor1: withAlpha('#4994ec', 0.35),
        bottomFillColor2: withAlpha('#4994ec', 0.35),
        lineWidth: 2,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      wt1.setData(calculations.series.wt1.map((p) => ({ time: p.time as Time, value: p.value })))
      seriesRefs.current.set('wt1', wt1)
    }

    if (calculations.series.wt2.length) {
      const wt2 = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        // Keep WT2 fill dark, but match the line to WT1 blue for visibility.
        topLineColor: withAlpha('#4994ec', 0.8),
        bottomLineColor: withAlpha('#4994ec', 0.8),
        topFillColor1: withAlpha('#1f1559', 0.35),
        topFillColor2: withAlpha('#1f1559', 0.35),
        bottomFillColor1: withAlpha('#1f1559', 0.35),
        bottomFillColor2: withAlpha('#1f1559', 0.35),
        lineWidth: 1,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
      })
      wt2.setData(calculations.series.wt2.map((p) => ({ time: p.time as Time, value: p.value })))
      seriesRefs.current.set('wt2', wt2)
    }

    // Fast WT (VWAP) - area approximation
    if (calculations.series.wtVwap.length) {
      const vwap = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topLineColor: withAlpha('#ffffff', 0.55),
        bottomLineColor: withAlpha('#ffffff', 0.55),
        topFillColor1: withAlpha('#ffffff', 0.25),
        topFillColor2: withAlpha('#ffffff', 0.25),
        bottomFillColor1: withAlpha('#ffffff', 0.25),
        bottomFillColor2: withAlpha('#ffffff', 0.25),
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
      })
      vwap.setData(calculations.series.wtVwap.map((p) => ({ time: p.time as Time, value: p.value })))
      seriesRefs.current.set('wtVwap', vwap)
    }

    // RSI+MFI area and MFI bar (between -99 and -95)
    if (calculations.series.rsiMfi.length) {
      const rsiMfi = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topLineColor: withAlpha('#3ee145', 0.75),
        bottomLineColor: withAlpha('#ff3d2e', 0.75),
        topFillColor1: withAlpha('#3ee145', 0.5),
        topFillColor2: withAlpha('#3ee145', 0.5),
        bottomFillColor1: withAlpha('#ff3d2e', 0.5),
        bottomFillColor2: withAlpha('#ff3d2e', 0.5),
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
      })
      // Visual-only scaling: reduces how much the red/green MFI area dominates the pane
      // without changing WT/RSI/Stoch scaling.
      rsiMfi.setData(
        calculations.series.rsiMfi.map((p) => ({
          time: p.time as Time,
          value: p.value * MFI_VISUAL_SCALE,
        })),
      )
      seriesRefs.current.set('rsiMfi', rsiMfi)
    }

    if (calculations.series.mfiBarTop.length) {
      const mfiBar = chart.addSeries(HistogramSeries, {
        base: -99,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        color: '#ffffff40',
      })
      mfiBar.setData(
        calculations.series.mfiBarTop.map((p) => ({
          time: p.time as Time,
          value: p.value,
          color: withAlpha(p.color, 0.25),
        })),
      )
      seriesRefs.current.set('mfiBar', mfiBar)
    }

    // RSI
    if (calculations.series.rsi.length) {
      const rsi = chart.addSeries(LineSeries, {
        lineWidth: 2,
        title: '',
        lastValueVisible: true,
        priceLineVisible: false,
        color: '#ffffff70',
      })
      rsi.setData(
        calculations.series.rsi.map((p) => ({
          time: p.time as Time,
          value: p.value,
          color: withAlpha(p.color, 0.75),
        })),
      )
      seriesRefs.current.set('rsi', rsi)
    }

    // Stoch K/D
    if (calculations.series.stochK.length) {
      const stochK = chart.addSeries(LineSeries, {
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        color: calculations.series.stochK[0]?.color ?? '#21baf3',
      })
      stochK.setData(calculations.series.stochK as { time: Time; value: number; color?: string }[])
      seriesRefs.current.set('stochK', stochK)
    }

    if (calculations.series.stochD.length) {
      const stochD = chart.addSeries(LineSeries, {
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        color: calculations.series.stochD[0]?.color ?? '#673ab7',
      })
      stochD.setData(calculations.series.stochD as { time: Time; value: number; color?: string }[])
      seriesRefs.current.set('stochD', stochD)
    }
    stochDataRef.current = {
      k: calculations.series.stochK.map((p) => ({ time: Number(p.time), value: p.value })),
      d: calculations.series.stochD.map((p) => ({ time: Number(p.time), value: p.value })),
    }
    kdFillScheduleRef.current?.()

    // Schaff Trend Cycle (two-line overlay like Pine)
    if (calculations.series.tc.length) {
      const tcPurple = chart.addSeries(LineSeries, {
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        color: withAlpha('#673ab7', 0.75),
      })
      tcPurple.setData(calculations.series.tc.map((p) => ({ time: p.time as Time, value: p.value })))
      seriesRefs.current.set('tcPurple', tcPurple)

      const tcWhite = chart.addSeries(LineSeries, {
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        color: withAlpha('#ffffff', 0.5),
      })
      tcWhite.setData(calculations.series.tc.map((p) => ({ time: p.time as Time, value: p.value })))
      seriesRefs.current.set('tcWhite', tcWhite)
    }

    // Overbought / oversold guide lines (Pine: steps for ob2/os2, circles for ob3)
    if (calculations.levels.obLevel2.length) {
      const ob2 = chart.addSeries(LineSeries, {
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        color: withAlpha('#ffffff', 0.15),
        lineType: LineType.WithSteps,
      })
      ob2.setData(calculations.levels.obLevel2 as { time: Time; value: number }[])
      seriesRefs.current.set('ob2', ob2)
    }

    if (calculations.levels.osLevel2.length) {
      const os2 = chart.addSeries(LineSeries, {
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        color: withAlpha('#ffffff', 0.15),
        lineType: LineType.WithSteps,
      })
      os2.setData(calculations.levels.osLevel2 as { time: Time; value: number }[])
      seriesRefs.current.set('os2', os2)
    }

    if (calculations.levels.obLevel3.length) {
      const ob3 = chart.addSeries(LineSeries, {
        lineWidth: 1,
        title: '',
        color: 'transparent',
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      ob3.setData(calculations.levels.obLevel3.map((p) => ({ time: p.time as Time, value: p.value, color: withAlpha('#ffffff', 0.05) })))
      seriesRefs.current.set('ob3', ob3)
    }

    // Point-only overlays (divergences + circles)
    function addPointSeries(key: string, points: Array<{ time: number; value: number; color?: string }>, radius: number): void {
      if (!points.length) return
      const s = chart.addSeries(LineSeries, {
        lineWidth: 1,
        title: '',
        color: 'transparent',
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: radius,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      s.setData(points as { time: Time; value: number; color?: string }[])
      seriesRefs.current.set(key, s)
    }

    // WT cross circles: ensure color is visible (lightweight-charts point markers can ignore per-point colors).
    function addFixedColorPointSeries(
      key: string,
      points: Array<{ time: number; value: number }>,
      radius: number,
      color: string,
    ): void {
      if (!points.length) return
      const s = chart.addSeries(LineSeries, {
        lineWidth: 1,
        title: '',
        color,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: radius,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      s.setData(points as { time: Time; value: number }[])
      seriesRefs.current.set(key, s)
    }

    const crossUp = calculations.series.wtCrossCircles
      .filter((p) => String(p.color ?? '').includes('0, 230, 118'))
      .map((p) => ({ time: p.time, value: p.value }))
    const crossDown = calculations.series.wtCrossCircles
      .filter((p) => String(p.color ?? '').includes('255, 82, 82'))
      .map((p) => ({ time: p.time, value: p.value }))

    addFixedColorPointSeries('wtCrossCirclesUp', crossUp, 3, 'rgba(0, 230, 118, 0.85)')
    addFixedColorPointSeries('wtCrossCirclesDown', crossDown, 3, 'rgba(255, 82, 82, 0.85)')

    addPointSeries('wtBearDiv', calculations.series.wtBearDiv, 3)
    addPointSeries('wtBullDiv', calculations.series.wtBullDiv, 3)
    addPointSeries('wtBearDiv2', calculations.series.wtBearDiv2, 3)
    addPointSeries('wtBullDiv2', calculations.series.wtBullDiv2, 3)

    addPointSeries('rsiBearDiv', calculations.series.rsiBearDiv, 2)
    addPointSeries('rsiBullDiv', calculations.series.rsiBullDiv, 2)

    addPointSeries('stochBearDiv', calculations.series.stochBearDiv, 2)
    addPointSeries('stochBullDiv', calculations.series.stochBullDiv, 2)

    // Sommi HVWAP + markers
    if (calculations.series.sommiHvwap.length) {
      const hvwap = chart.addSeries(LineSeries, {
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        color: '#ffe500',
      })
      hvwap.setData(calculations.series.sommiHvwap as { time: Time; value: number; color?: string }[])
      seriesRefs.current.set('sommiHvwap', hvwap)
    }

    // Pine plotchar glyph markers rendered via DOM overlay (data prepared here).
    const plotchars = [
      // Pine `size.small` dots with `transp=50` (alpha 0.5)
      ...calculations.series.buyCircle.map((p) => ({ ...p, kind: 'dot' as const, diameterPx: 7, opacity: 0.5 })),
      ...calculations.series.sellCircle.map((p) => ({ ...p, kind: 'dot' as const, diameterPx: 7, opacity: 0.5 })),

      // Pine div dots: `size.small`, `transp=15` (alpha 0.85)
      ...calculations.series.divBuyCircle.map((p) => ({ ...p, kind: 'dot' as const, diameterPx: 8, opacity: 0.85 })),
      ...calculations.series.divSellCircle.map((p) => ({ ...p, kind: 'dot' as const, diameterPx: 8, opacity: 0.85 })),

      // Pine gold dot: `size.normal`, `transp=15` (alpha 0.85)
      ...calculations.series.goldBuyCircle.map((p) => ({ ...p, kind: 'dot' as const, diameterPx: 10, opacity: 0.85 })),

      // Sommi markers: `size.tiny`
      ...calculations.series.sommiBearFlag.map((p) => ({ ...p, kind: 'text' as const, text: '⚑', fontSizePx: 10, opacity: 1 })),
      ...calculations.series.sommiBullFlag.map((p) => ({ ...p, kind: 'text' as const, text: '⚑', fontSizePx: 10, opacity: 1 })),
      ...calculations.series.sommiBearDiamond.map((p) => ({ ...p, kind: 'text' as const, text: '◆', fontSizePx: 10, opacity: 1 })),
      ...calculations.series.sommiBullDiamond.map((p) => ({ ...p, kind: 'text' as const, text: '◆', fontSizePx: 10, opacity: 1 })),
    ].sort((a, b) => Number(a.time) - Number(b.time))

    plotcharDataRef.current = plotchars.map((p) => {
      if (p.kind === 'dot') {
        return {
          kind: 'dot' as const,
          time: Number(p.time),
          value: p.value,
          color: p.color,
          diameterPx: p.diameterPx,
          opacity: p.opacity,
        }
      }
      return {
        kind: 'text' as const,
        time: Number(p.time),
        value: p.value,
        color: p.color,
        text: p.text,
        fontSizePx: p.fontSizePx,
        opacity: p.opacity,
      }
    })
    plotcharScheduleRef.current?.()

    // Ensure plotchar y-levels are included in autoscale (Pine uses `location.absolute` values).
    if (plotchars.length >= 1) {
      const firstTime = Number(data[0]?.time)
      const lastTime = Number(data[data.length - 1]?.time)
      if (Number.isFinite(firstTime) && Number.isFinite(lastTime) && firstTime < lastTime) {
        const scalePad = chart.addSeries(LineSeries, {
          lineWidth: 1,
          title: '',
          color: 'transparent',
          lineVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        scalePad.setData([
          { time: firstTime as Time, value: -108 },
          { time: lastTime as Time, value: 108 },
        ])
        seriesRefs.current.set('scalePad', scalePad)
      }
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
          {!isDarkMode && (
            <div
              className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
              }}
            />
          )}
          <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
        </div>
    </div>
  )
}