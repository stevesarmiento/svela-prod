'use client'

// Mini price sparkline companion for the indicators section. It renders as a
// slim strip opposite the "Technical Indicators" heading, and once scrolled
// past it docks to a floating bottom-right strip. It stays synced with the
// indicator charts two ways via shared stores:
// - scrub: hovering any indicator draws its time cursor here (and vice versa)
// - range: it mirrors the time period the indicator charts are zoomed in on

import type React from 'react'
import { memo, useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { cn } from '@v1/ui/cn'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'
import { getChartRangeSnapshot, subscribeToChartRange } from '@/hooks/chart-range-store'
import {
  attachChartResize,
  attachChartScrubSync,
  buildIndicatorChartOptions,
  normalizeSeries,
} from './indicator-chart-setup'

// Slim: matches the "Technical Indicators" heading row height.
const MINI_CHART_HEIGHT = 36
const SCRUB_SOURCE_ID = 'mini-price'

interface PricePoint {
  time: Time
  value: number
}

interface FloatingMiniPriceChartProps {
  chartData: ReadonlyArray<PricePoint>
  symbol: string
  /** The main price chart: the sparkline only appears while this is off-screen. */
  anchorRef: React.RefObject<HTMLElement | null>
}

function toEpochSeconds(time: Time): number | null {
  if (typeof time === 'number') return Math.floor(time > 1e10 ? time / 1000 : time)
  if (typeof time === 'string') {
    const parsed = Number(time)
    if (Number.isFinite(parsed)) return Math.floor(parsed > 1e10 ? parsed / 1000 : parsed)
    const ms = Date.parse(time)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
  }
  return null
}

export const FloatingMiniPriceChart = memo(function FloatingMiniPriceChart({
  chartData,
  symbol,
  anchorRef,
}: FloatingMiniPriceChartProps) {
  const [isPriceChartVisible, setIsPriceChartVisible] = useState(true)
  const [isDocked, setIsDocked] = useState(false)
  const [isDockDismissed, setIsDockDismissed] = useState(false)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const normalizedDataRef = useRef<Array<{ time: Time; value: number }>>([])

  const hasData = chartData.length >= 2
  const showDocked = isDocked && !isDockDismissed
  const shouldRenderCard = hasData && !isPriceChartVisible && (!isDocked || showDocked)

  // Only appear once the main price chart has left the viewport.
  useEffect(() => {
    const node = anchorRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setIsPriceChartVisible(entry.isIntersecting)
      },
      { threshold: 0 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [anchorRef])

  // Dock the strip once its inline slot is scrolled past (bottom above viewport).
  useEffect(() => {
    const node = wrapperRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsDocked(!entry.isIntersecting && entry.boundingClientRect.bottom < 0)
        }
      },
      { threshold: 0 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Create/destroy the chart with visibility.
  useEffect(() => {
    if (!shouldRenderCard) return
    const container = containerRef.current
    if (!container) return

    let disposed = false
    const cleanups: Array<() => void> = []

    loadLightweightCharts().then((lightweightCharts) => {
      if (disposed || !container.isConnected) return

      const chart = lightweightCharts.createChart(container, {
        ...buildIndicatorChartOptions(lightweightCharts, {
          showTimeAxis: false,
          horzLinesVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.05 },
        }),
        handleScale: false,
        handleScroll: false,
        rightPriceScale: { visible: false },
      })

      const series = chart.addSeries(lightweightCharts.AreaSeries, {
        lineColor: 'oklch(0.7 0.15 250)',
        lineWidth: 2,
        topColor: 'oklch(0.7 0.15 250 / 0.25)',
        bottomColor: 'oklch(0.7 0.15 250 / 0)',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
      })

      chartRef.current = chart
      seriesRef.current = series

      // Follow the indicator charts' visible time window.
      const applySharedRange = () => {
        const range = getChartRangeSnapshot()
        if (
          range.sourceId == null ||
          range.sourceId === SCRUB_SOURCE_ID ||
          range.fromEpochSeconds == null ||
          range.toEpochSeconds == null ||
          range.toEpochSeconds <= range.fromEpochSeconds
        )
          return
        chart.timeScale().setVisibleRange({
          from: range.fromEpochSeconds as Time,
          to: range.toEpochSeconds as Time,
        })
      }

      // The data effect may have run before the async chart creation finished;
      // seed the series from the latest normalized data now.
      if (normalizedDataRef.current.length > 0) {
        series.setData(normalizedDataRef.current)
        chart.timeScale().fitContent()
        applySharedRange()
      }

      cleanups.push(attachChartResize(chart, container, MINI_CHART_HEIGHT))
      cleanups.push(attachChartScrubSync(chart, container, SCRUB_SOURCE_ID, { publishVisibleRange: false }))
      cleanups.push(subscribeToChartRange(applySharedRange))
    })

    return () => {
      disposed = true
      for (const cleanup of cleanups.reverse()) cleanup()
      chartRef.current?.remove()
      chartRef.current = null
      seriesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRenderCard])

  // Feed data into the series (also handles timescale changes while visible).
  useEffect(() => {
    const normalized = normalizeSeries(
      chartData
        .map((point) => ({ time: toEpochSeconds(point.time), value: point.value }))
        .filter((point): point is { time: number; value: number } => point.time != null),
    )
    normalizedDataRef.current = normalized

    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) return
    series.setData(normalized)
    chart.timeScale().fitContent()
  }, [chartData, shouldRenderCard])

  return (
    // In-flow slot: keeps its footprint next to the heading so the layout
    // doesn't jump when the strip docks to the bottom-right corner.
    <div
      ref={wrapperRef}
      className="hidden w-64 max-w-full sm:block"
      style={{ height: MINI_CHART_HEIGHT }}
    >
      {shouldRenderCard ? (
        <div
          className={cn(
            'flex items-center gap-3',
            showDocked &&
              'fixed bottom-6 right-6 z-40 w-64 max-w-[calc(100vw-3rem)] rounded-full border border-zinc-800/70 bg-black/85 px-4 py-1.5 shadow-2xl backdrop-blur-md',
          )}
          role="complementary"
          aria-label={`${symbol.toUpperCase()} mini price chart`}
        >
          <div
            ref={containerRef}
            className="relative min-w-0 flex-1"
            style={{ height: MINI_CHART_HEIGHT }}
          />
          {showDocked ? (
            <button
              type="button"
              onClick={() => setIsDockDismissed(true)}
              aria-label="Dismiss mini price chart"
              className="shrink-0 rounded-md px-1 text-zinc-500 transition-colors hover:text-white"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
