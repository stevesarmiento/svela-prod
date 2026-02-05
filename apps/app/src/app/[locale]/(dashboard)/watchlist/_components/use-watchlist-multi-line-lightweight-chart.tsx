'use client'

import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react"
import { createRoot } from "react-dom/client"
import type { IChartApi, ISeriesApi, LineData, MouseEventParams, Time } from "lightweight-charts"
import { loadLightweightCharts, type LightweightChartsModule } from "@/lib/load-lightweight-charts"
import { subscribeToWindowResize } from "@/hooks/window-resize-store"
import { WatchlistMultiLineTooltipContent } from "./watchlist-multi-line-tooltip"
import type { TooltipWatchlistDataRow, WatchlistChartSeries, WatchlistPriceDataPoint } from "./watchlist-multi-line.types"

interface WatchlistLineSeriesData {
  series: ISeriesApi<"Line">
  watchlistData: WatchlistChartSeries
}

export interface UseWatchlistMultiLineLightweightChartArgs {
  series: WatchlistChartSeries[]
  isDarkMode: boolean
  height?: number
}

export interface UseWatchlistMultiLineLightweightChartResult {
  chartContainerRef: RefObject<HTMLDivElement | null>
  lineSeriesMapRef: MutableRefObject<Map<string, WatchlistLineSeriesData>>
}

function toTimestampMs(time: Time): number {
  if (typeof time === "number") return time * 1000
  if (typeof time === "string") {
    const [year, month, day] = time.split("-").map((part) => Number(part))
    if (!year || !month || !day) return Date.now()
    return Date.UTC(year, month - 1, day)
  }
  return Date.UTC(time.year, time.month - 1, time.day)
}

function findClosestValue(data: WatchlistPriceDataPoint[], targetTimeSec: number): number | null {
  if (data.length === 0) return null

  let low = 0
  let high = data.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midTime = data[mid]?.time as number | undefined
    if (midTime === undefined) break
    if (midTime === targetTimeSec) return data[mid]?.value ?? null
    if (midTime < targetTimeSec) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  const right = data[low]
  const left = data[low - 1]
  if (!left) return right?.value ?? null
  if (!right) return left.value

  const leftDiff = Math.abs((left.time as number) - targetTimeSec)
  const rightDiff = Math.abs((right.time as number) - targetTimeSec)
  return leftDiff <= rightDiff ? left.value : right.value
}

export function useWatchlistMultiLineLightweightChart({
  series,
  isDarkMode,
  height = 400,
}: UseWatchlistMultiLineLightweightChartArgs): UseWatchlistMultiLineLightweightChartResult {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const lightweightRef = useRef<LightweightChartsModule | null>(null)
  const tooltipElRef = useRef<HTMLDivElement | null>(null)
  const tooltipRootRef = useRef<ReturnType<typeof createRoot> | null>(null)
  const seriesOrderRef = useRef<WatchlistChartSeries[]>([])
  const lineSeriesMapRef = useRef<Map<string, WatchlistLineSeriesData>>(new Map())

  const tooltipClassName = useMemo(
    () =>
      `fixed overflow-hidden text-[11px] rounded-xl w-[220px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl transition-opacity duration-100 ease-out ${
        isDarkMode
          ? "text-white bg-zinc-900/95 border border-zinc-700/50"
          : "text-gray-900 bg-white/95 border border-gray-200/50"
      }`,
    [isDarkMode],
  )

  const hasRenderableChart = series.length > 0

  useEffect(() => {
    seriesOrderRef.current = series
  }, [series])

  const heightRef = useRef(height)
  useEffect(() => {
    heightRef.current = height
  }, [height])

  // Create/destroy chart once per mounted container.
  useEffect(() => {
    if (!hasRenderableChart) return
    if (!chartContainerRef.current) return
    if (chartRef.current) return

    let isCancelled = false
    let chart: IChartApi | null = null
    let resizeObserver: ResizeObserver | null = null
    let resizeRafId: number | null = null
    let unsubscribeWindowResize: (() => void) | null = null
    let tooltipEl: HTMLDivElement | null = null
    let tooltipRoot: ReturnType<typeof createRoot> | null = null
    let crosshairMoveHandler: ((param: MouseEventParams) => void) | null = null
    let isTooltipActive = false

    void (async () => {
      const lw = await loadLightweightCharts()
      if (isCancelled || !chartContainerRef.current) return
      if (chartRef.current) return

      lightweightRef.current = lw
      const { createChart, ColorType, CrosshairMode, LineStyle, LineSeries, LastPriceAnimationMode } = lw

      chart = createChart(chartContainerRef.current, {
        handleScale: false,
        handleScroll: false,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: isDarkMode ? "#ffffff50" : "#00000050",
          attributionLogo: false,
        },
        grid: {
          vertLines: {
            visible: false,
            color: isDarkMode ? "#e5e7eb20" : "#00000020",
            style: LineStyle.Dotted,
          },
          horzLines: {
            visible: false,
            color: isDarkMode ? "#ffffff10" : "#00000010",
            style: LineStyle.Dotted,
          },
        },
        rightPriceScale: {
          borderVisible: false,
          autoScale: true,
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            labelVisible: true,
            width: 1 as const,
            color: isDarkMode ? "#d1d5db40" : "#00000040",
            visible: true,
            style: LineStyle.Solid,
          },
          horzLine: {
            visible: false,
            labelVisible: false,
          },
        },
        timeScale: {
          visible: false,
          timeVisible: true,
          secondsVisible: false,
          borderVisible: false,
        },
      })

      const createdChart = chart
      chartRef.current = createdChart

      const handleResize = () => {
        const containerEl = chartContainerRef.current
        if (!containerEl) return
        createdChart.applyOptions({
          width: containerEl.clientWidth,
          height: heightRef.current,
        })
      }

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

      // Tooltip
      tooltipEl = document.createElement("div")
      tooltipRoot = createRoot(tooltipEl)
      const localTooltipEl = tooltipEl
      const localTooltipRoot = tooltipRoot
      localTooltipEl.className = tooltipClassName
      localTooltipEl.style.left = "0px"
      localTooltipEl.style.top = "0px"
      localTooltipEl.style.opacity = "0"
      localTooltipEl.style.visibility = "hidden"
      localTooltipEl.style.transform = "translate3d(0px, 0px, 0)"
      document.body.appendChild(localTooltipEl)
      tooltipElRef.current = localTooltipEl
      tooltipRootRef.current = localTooltipRoot
      let isTooltipVisible = false
      isTooltipActive = true

      crosshairMoveHandler = (param: MouseEventParams) => {
        if (!isTooltipActive) return
        if (
          param.point === undefined ||
          !param.time ||
          param.point.x < 0 ||
          param.point.y < 0
        ) {
          localTooltipEl.style.opacity = "0"
          localTooltipEl.style.visibility = "hidden"
          isTooltipVisible = false
          return
        }

        if (!chartContainerRef.current) return
        const chartRect = chartContainerRef.current.getBoundingClientRect()

        const targetTimeSec =
          typeof param.time === "number"
            ? param.time
            : Math.floor(toTimestampMs(param.time as Time) / 1000)

        const rows: TooltipWatchlistDataRow[] = []
        for (const watchlistSeries of seriesOrderRef.current) {
          const lineData = lineSeriesMapRef.current.get(watchlistSeries.id)
          if (!lineData) continue

          const seriesPoint = param.seriesData.get(lineData.series) as LineData<Time> | undefined
          const valueFromSeries = typeof seriesPoint?.value === "number" ? seriesPoint.value : null
          const valueFromClosest =
            valueFromSeries ?? findClosestValue(lineData.watchlistData.data, targetTimeSec)

          rows.push({
            name: lineData.watchlistData.name,
            color: lineData.watchlistData.color,
            value: valueFromClosest,
            icon: lineData.watchlistData.icon,
          })
        }

        rows.sort((a, b) => a.name.localeCompare(b.name))

        const hasAnyValue = rows.some((row) => row.value !== null)
        if (!hasAnyValue) {
          localTooltipEl.style.opacity = "0"
          localTooltipEl.style.visibility = "hidden"
          isTooltipVisible = false
          return
        }

        if (!isTooltipVisible) {
          localTooltipEl.style.opacity = "1"
          localTooltipEl.style.visibility = "visible"
          isTooltipVisible = true
        }

        if (!isTooltipActive) return
        localTooltipRoot.render(
          <WatchlistMultiLineTooltipContent
            watchlistData={rows}
            timestamp={toTimestampMs(param.time as Time)}
          />,
        )

        const tooltipWidth = localTooltipEl.offsetWidth
        const tooltipHeight = localTooltipEl.offsetHeight

        let left = chartRect.left + param.point.x + 15
        let top = chartRect.top + 12

        if (left + tooltipWidth > window.innerWidth - 10) {
          left = chartRect.left + param.point.x - tooltipWidth - 15
        }

        if (top + tooltipHeight > window.innerHeight - 10) {
          top = window.innerHeight - tooltipHeight - 10
        }

        if (top < 10) top = 10

        localTooltipEl.style.transform = `translate3d(${left}px, ${top}px, 0)`
      }

      createdChart.subscribeCrosshairMove(crosshairMoveHandler)

      // Initialize series
      const nextMap = new Map<string, WatchlistLineSeriesData>()
      for (const watchlistSeries of seriesOrderRef.current) {
        const lineSeries = createdChart.addSeries(LineSeries, {
          lineWidth: 1,
          lastValueVisible: true,
          visible: true,
          priceLineVisible: false,
          color: watchlistSeries.color,
          lastPriceAnimation: LastPriceAnimationMode.Continuous,
          priceFormat: {
            type: "custom",
            formatter: (price: number) => `${price > 0 ? "+" : ""}${price.toFixed(2)}%`,
          },
        })

        lineSeries.setData(watchlistSeries.data)
        nextMap.set(watchlistSeries.id, { series: lineSeries, watchlistData: watchlistSeries })
      }

      lineSeriesMapRef.current = nextMap
      createdChart.timeScale().fitContent()
    })()

    return () => {
      isCancelled = true
      isTooltipActive = false
      const activeChart = chartRef.current ?? chart

      // Unsubscribe crosshair handler (best-effort) to avoid late renders.
      try {
        if (activeChart && crosshairMoveHandler) {
          activeChart.unsubscribeCrosshairMove(crosshairMoveHandler)
        }
      } catch {
        // noop
      }

      if (resizeRafId) cancelAnimationFrame(resizeRafId)
      resizeObserver?.disconnect()
      unsubscribeWindowResize?.()

      const rootToUnmount = tooltipRoot
      const elToRemove = tooltipEl
      tooltipElRef.current = null
      tooltipRootRef.current = null
      tooltipEl = null
      tooltipRoot = null

      requestAnimationFrame(() => {
        try {
          rootToUnmount?.unmount()
        } catch {
          // noop
        }
        if (elToRemove && document.body.contains(elToRemove)) {
          document.body.removeChild(elToRemove)
        }
      })

      activeChart?.remove()
      chartRef.current = null
      lineSeriesMapRef.current = new Map()
    }
  }, [hasRenderableChart])

  // Reconcile series data/appearance without recreating the chart.
  useEffect(() => {
    const chart = chartRef.current
    const lw = lightweightRef.current
    if (!chart || !lw) return

    const nextIds = new Set(series.map((row) => row.id))
    const seriesMap = lineSeriesMapRef.current

    for (const [id, lineData] of Array.from(seriesMap.entries())) {
      if (nextIds.has(id)) continue
      try {
        chart.removeSeries(lineData.series)
      } catch {
        // noop
      }
      seriesMap.delete(id)
    }

    const { LineSeries, LastPriceAnimationMode } = lw
    for (const row of series) {
      const existing = seriesMap.get(row.id)
      if (!existing) {
        const lineSeries = chart.addSeries(LineSeries, {
          lineWidth: 1,
          lastValueVisible: true,
          visible: true,
          priceLineVisible: false,
          color: row.color,
          lastPriceAnimation: LastPriceAnimationMode.Continuous,
          priceFormat: {
            type: "custom",
            formatter: (price: number) => `${price > 0 ? "+" : ""}${price.toFixed(2)}%`,
          },
        })
        lineSeries.setData(row.data)
        seriesMap.set(row.id, { series: lineSeries, watchlistData: row })
        continue
      }

      existing.watchlistData = row
      existing.series.applyOptions({ color: row.color })
      existing.series.setData(row.data)
    }

    chart.timeScale().fitContent()
  }, [series])

  // Theme updates should not recreate the chart.
  useEffect(() => {
    const chart = chartRef.current
    const lw = lightweightRef.current
    if (!chart || !lw) return

    const { ColorType, CrosshairMode, LineStyle } = lw
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDarkMode ? "#ffffff50" : "#00000050",
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          visible: false,
          color: isDarkMode ? "#e5e7eb20" : "#00000020",
          style: LineStyle.Dotted,
        },
        horzLines: {
          visible: false,
          color: isDarkMode ? "#ffffff10" : "#00000010",
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          labelVisible: true,
          width: 1 as const,
          color: isDarkMode ? "#d1d5db40" : "#00000040",
          visible: true,
          style: LineStyle.Solid,
        },
        horzLine: {
          visible: false,
          labelVisible: false,
        },
      },
    })

    const tooltipEl = tooltipElRef.current
    if (tooltipEl) tooltipEl.className = tooltipClassName
  }, [isDarkMode, tooltipClassName])

  return { chartContainerRef, lineSeriesMapRef }
}
