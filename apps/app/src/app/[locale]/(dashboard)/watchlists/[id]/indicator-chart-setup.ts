'use client'

// Shared setup helpers for the watchlist indicator charts (BBWP, Bollinger,
// MarketVision, RSI divergences). These were previously duplicated inline in
// each chart component's effect; extracting them keeps each component focused
// on its own series logic.

import type { DeepPartial, ChartOptions, IChartApi, Time } from 'lightweight-charts'
import type { OHLCVDataPoint } from '@/hooks/market-vision/market-vision-config'
import type { LightweightChartsModule } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'
import { clearChartScrub, getChartScrubSnapshot, setChartScrub, subscribeToChartScrub } from '@/hooks/chart-scrub-store'
import { CHART_COLOR_PARSERS } from '@/lib/oklch'
import { timeToEpochSeconds } from '@/hooks/use-chart-instance/utils'

export const SECONDS_PER_DAY = 24 * 60 * 60
export const DEFAULT_WINDOW_DAYS = 3
export const RIGHT_OFFSET_BARS = 12

export function normalizeEpochSeconds(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const seconds = value > 1e10 ? Math.floor(value / 1000) : Math.floor(value)
  return Number.isFinite(seconds) ? seconds : null
}

export function normalizeIndicatorOhlcv(data: OHLCVDataPoint[]): OHLCVDataPoint[] {
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

export function normalizeSeries(points: Array<{ time: number; value: number }>): Array<{ time: Time; value: number }> {
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

export function getInitialWindowSeconds(initialWindowDays: number | undefined): number {
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

export function applyInitialVisibleRange(chart: IChartApi, ohlcvData: OHLCVDataPoint[], windowSeconds: number): void {
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

export interface IndicatorChartOptionsParams {
  showTimeAxis: boolean
  horzLinesVisible: boolean
  scaleMargins: { top: number; bottom: number }
  backgroundColor?: string
}

export function buildIndicatorChartOptions(
  lightweightCharts: LightweightChartsModule,
  { showTimeAxis, horzLinesVisible, scaleMargins, backgroundColor = 'transparent' }: IndicatorChartOptionsParams,
): DeepPartial<ChartOptions> {
  const { ColorType, CrosshairMode, LineStyle } = lightweightCharts

  return {
    handleScale: true,
    handleScroll: true,
    layout: {
      background: { type: ColorType.Solid, color: backgroundColor },
      textColor: 'oklch(1 0 0 / 0.3137)',
      attributionLogo: false,
      colorParsers: CHART_COLOR_PARSERS,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { visible: horzLinesVisible, color: 'oklch(0.9702 0 0 / 0.0627)', style: LineStyle.Dotted },
    },
    rightPriceScale: {
      borderVisible: false,
      autoScale: true,
      scaleMargins,
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { labelVisible: true, width: 1, color: 'oklch(0.8717 0.0093 258.34 / 0.251)', visible: true, style: LineStyle.Solid },
      horzLine: { visible: false, labelVisible: false },
    },
    timeScale: {
      visible: showTimeAxis,
      timeVisible: showTimeAxis,
      secondsVisible: false,
      borderVisible: false,
      rightOffset: RIGHT_OFFSET_BARS,
    },
  }
}

// Shared cross-chart scrub line overlay: renders the other charts' crosshair
// position as a vertical line, and publishes this chart's crosshair time.
// Returns a cleanup that unsubscribes and removes the overlay element.
export function attachChartScrubSync(chart: IChartApi, container: HTMLElement, sourceId: string): () => void {
  container.style.position = container.style.position || 'relative'
  const scrubLineEl = document.createElement('div')
  scrubLineEl.setAttribute('aria-hidden', 'true')
  scrubLineEl.style.position = 'absolute'
  scrubLineEl.style.top = '0'
  scrubLineEl.style.bottom = '0'
  scrubLineEl.style.width = '1px'
  scrubLineEl.style.transform = 'translateX(-9999px)'
  scrubLineEl.style.opacity = '0'
  scrubLineEl.style.pointerEvents = 'none'
  scrubLineEl.style.background = 'oklch(1 0 0 / 0.2)'
  scrubLineEl.style.zIndex = '5'
  container.appendChild(scrubLineEl)

  const updateScrubLine = () => {
    const scrub = getChartScrubSnapshot()
    if (!container.isConnected || scrub.epochSeconds == null || scrub.sourceId === sourceId) {
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
    setChartScrub(timeToEpochSeconds(param.time) ?? null, sourceId)
  }
  chart.subscribeCrosshairMove(handleCrosshairMove)

  return () => {
    chart.unsubscribeCrosshairMove(handleCrosshairMove)
    chart.timeScale().unsubscribeVisibleTimeRangeChange(updateScrubLine)
    chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateScrubLine)
    unsubscribeScrub()
    if (container.contains(scrubLineEl)) container.removeChild(scrubLineEl)
  }
}

// Full-bleed, pointer-transparent DOM overlay layer (labels, glyphs, fills)
// stacked over the chart canvas at the given z-index.
export function createOverlayLayer(container: HTMLElement, zIndex: string, overflowHidden = false): HTMLDivElement {
  const layer = document.createElement('div')
  layer.className = overflowHidden
    ? 'pointer-events-none absolute inset-0 overflow-hidden'
    : 'pointer-events-none absolute inset-0'
  layer.style.zIndex = zIndex
  layer.setAttribute('aria-hidden', 'true')
  container.appendChild(layer)
  return layer
}

// Keep the chart sized to its container. Prefers observing the actual
// container size (avoids per-chart global resize listeners). Runs an initial
// resize synchronously. Returns a cleanup.
export function attachChartResize(
  chart: IChartApi,
  container: HTMLElement,
  height: number,
  onResize?: () => void,
): () => void {
  const handleResize = () => {
    if (container.isConnected) {
      chart.applyOptions({ width: container.clientWidth, height })
    }
    onResize?.()
  }

  let resizeObserver: ResizeObserver | null = null
  let resizeRafId: number | null = null
  let unsubscribeWindowResize: (() => void) | null = null

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (resizeRafId) cancelAnimationFrame(resizeRafId)
      resizeRafId = requestAnimationFrame(() => handleResize())
    })
    resizeObserver.observe(container)
  } else {
    unsubscribeWindowResize = subscribeToWindowResize(handleResize)
  }

  handleResize()

  return () => {
    if (resizeRafId) cancelAnimationFrame(resizeRafId)
    resizeObserver?.disconnect()
    unsubscribeWindowResize?.()
  }
}
