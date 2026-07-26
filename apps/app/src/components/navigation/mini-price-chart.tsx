'use client'

import { useEffect, useMemo, useRef } from "react"
import { AlertTriangle } from "lucide-react"
import { Spinner } from "@v1/ui/spinner"
import { RateLimitErrorBoundary } from "@/components/error-boundary/rate-limit-error-boundary"
import { useCoinGeckoChartData } from "@/hooks/use-coingecko-chart-data"
import { useHullSuite } from "@/hooks/use-hull-suite"
import { formatUsdPrice } from "@/lib/format-usd"
import { CHART_COLOR_PARSERS } from "@/lib/oklch"
import { loadLightweightCharts } from "@/lib/load-lightweight-charts"
import type { IChartApi, LineData, MouseEventParams, Time } from "lightweight-charts"

interface MiniPriceChartProps {
  coinId: string
  tokenSymbol?: string
  currentPrice?: number
}

function normalizeNumericTimePriceSeries(
  points: ReadonlyArray<{ time: Time; value: number }>,
): Array<{ time: Time; value: number }> {
  const byTimeSec = new Map<number, { time: Time; value: number }>()
  for (const point of points) {
    if (typeof point.time !== "number") continue
    const timeSec = Math.floor(point.time)
    if (!Number.isFinite(timeSec)) continue
    if (!Number.isFinite(point.value) || point.value <= 0) continue
    byTimeSec.set(timeSec, { time: timeSec as Time, value: point.value })
  }
  return Array.from(byTimeSec.entries())
    .sort(([a], [b]) => a - b)
    .map(([, value]) => value)
}

function normalizeNumericTimeVolumeSeries(
  points: ReadonlyArray<{ time: Time; value: number; color?: string }>,
): Array<{ time: Time; value: number; color?: string }> {
  const byTimeSec = new Map<number, { time: Time; value: number; color?: string }>()
  for (const point of points) {
    if (typeof point.time !== "number") continue
    const timeSec = Math.floor(point.time)
    if (!Number.isFinite(timeSec)) continue
    if (!Number.isFinite(point.value) || point.value < 0) continue
    byTimeSec.set(timeSec, { ...point, time: timeSec as Time })
  }
  return Array.from(byTimeSec.entries())
    .sort(([a], [b]) => a - b)
    .map(([, value]) => value)
}

function timeToEpochSeconds(time: Time): number | null {
  if (typeof time === "number") return time > 1e10 ? Math.floor(time / 1000) : Math.floor(time)
  if (typeof time === "string") {
    const parsed = Date.parse(time)
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
  }
  // BusinessDay (midnight UTC)
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000)
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- single irreducible chart-lifecycle effect; no cohesive JSX regions to extract (validated)
export function MiniPriceChart({ coinId, currentPrice }: MiniPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const initialData = useMemo(
    () => ({
      price: currentPrice || 0,
      volume_24h: 0,
      market_cap: 0,
      percent_change_24h: 0,
    }),
    [currentPrice],
  )

  const { chartData, volumeData, isLoading } = useCoinGeckoChartData(coinId, "7d", initialData, {
    preferMarketChart: true,
  })

  const normalizedChartData = useMemo(
    () => normalizeNumericTimePriceSeries(chartData),
    [chartData],
  )

  const normalizedVolumeData = useMemo(
    () => normalizeNumericTimeVolumeSeries(volumeData),
    [volumeData],
  )

  const priceChange = useMemo(() => {
    if (normalizedChartData.length < 2) return 0
    const firstPrice = normalizedChartData[0]?.value || 0
    const lastPrice = normalizedChartData[normalizedChartData.length - 1]?.value || 0
    if (firstPrice === 0) return 0
    return ((lastPrice - firstPrice) / firstPrice) * 100
  }, [normalizedChartData])

  const ohlcvData = useMemo(() => {
    if (normalizedChartData.length === 0) return []

    return normalizedChartData.map((point, idx) => {
      const price = point.value
      const volume = normalizedVolumeData[idx]?.value || 0
      const prevPrice = idx > 0 ? normalizedChartData[idx - 1]?.value || price : price
      const open = prevPrice
      const close = price
      const high = Math.max(open, close)
      const low = Math.min(open, close)
      return {
        time: point.time,
        open,
        high,
        low,
        close,
        volume,
      }
    })
  }, [normalizedChartData, normalizedVolumeData])

  const hullSuite = useHullSuite(ohlcvData, {
    src: "close",
    modeSwitch: "Ehma",
    length: 55,
    lengthMult: 1.0,
    useHtf: false,
    htf: "240",
    switchColor: true,
    candleCol: false,
    visualSwitch: true,
    thicknesSwitch: 1,
    transpSwitch: 40,
  })

  const normalizedHullData = useMemo(
    () => normalizeNumericTimePriceSeries(hullSuite.MHULL),
    [hullSuite.MHULL],
  )

  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup -- observer creation is isCancelled-guarded post-await; returned teardown disconnects it on every path
  useEffect(() => {
    if (!chartContainerRef.current) return
    if (normalizedChartData.length === 0) return

    let isCancelled = false
    let chart: IChartApi | null = null
    let resizeObserver: ResizeObserver | null = null
    let resizeRafId: number | null = null
    let windowResizeHandler: (() => void) | null = null
    let crosshairMoveHandler: ((param: MouseEventParams<Time>) => void) | null = null
    let scrubEl: HTMLDivElement | null = null

    // Defensive: avoid leaving behind previous instances.
    try {
      chartRef.current?.remove()
    } catch {
      // noop
    }
    chartRef.current = null

    void (async () => {
      const lw = await loadLightweightCharts()
      if (isCancelled || !chartContainerRef.current) return

      const { createChart, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle } = lw

      // Ensure we can attach an absolute-positioned scrub label.
      chartContainerRef.current.style.position = chartContainerRef.current.style.position || "relative"

      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "oklch(0.7137 0.0192 261.32)",
          fontSize: 10,
          attributionLogo: false,
          colorParsers: CHART_COLOR_PARSERS,
        },
        width: chartContainerRef.current.clientWidth,
        height: 160,
        rightPriceScale: { visible: false },
        leftPriceScale: { visible: false },
        timeScale: { visible: false, borderVisible: false },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            width: 1,
            color: "oklch(0.3729 0.0306 259.73)",
            style: LineStyle.Solid,
            visible: true,
          },
          horzLine: {
            visible: false,
          },
        },
        handleScroll: true,
        handleScale: true,
      })

      if (isCancelled) {
        try {
          chart.remove()
        } catch {
          // noop
        }
        return
      }

      const createdChart = chart
      chartRef.current = createdChart

      const handleResize = () => {
        const containerEl = chartContainerRef.current
        if (!containerEl) return
        createdChart.applyOptions({
          width: containerEl.clientWidth,
          height: containerEl.clientHeight || 160,
        })
      }

      if (typeof ResizeObserver !== "undefined" && chartContainerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId) cancelAnimationFrame(resizeRafId)
          resizeRafId = requestAnimationFrame(() => handleResize())
        })
        resizeObserver.observe(chartContainerRef.current)
      } else {
        windowResizeHandler = handleResize
        window.addEventListener("resize", handleResize)
      }

      handleResize()

      // Scrub label (price + %) — no chrome; sits to the right of the vertical crosshair.
      scrubEl = document.createElement("div")
      scrubEl.className =
        "pointer-events-none absolute top-2 left-0 z-10 hidden whitespace-nowrap text-[11px] leading-tight text-white drop-shadow-sm"
      const scrubStack = document.createElement("div")
      scrubStack.className = "flex flex-col gap-0.5"
      const scrubPrice = document.createElement("span")
      scrubPrice.className = "font-berkeley-mono font-semibold text-white"
      const scrubPct = document.createElement("span")
      scrubPct.className = "font-berkeley-mono text-white/90"

      scrubStack.appendChild(scrubPrice)
      scrubStack.appendChild(scrubPct)
      scrubEl.appendChild(scrubStack)
      chartContainerRef.current.appendChild(scrubEl)

      const volumeSeries = createdChart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        color: "oklch(1 0 0 / 0.1882)",
        priceLineVisible: false,
        lastValueVisible: false,
      })

      createdChart.priceScale("volume").applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      })

      const lineSeries = createdChart.addSeries(LineSeries, {
        color: priceChange >= 0 ? "oklch(0.6959 0.1491 162.48)" : "oklch(0.6368 0.2078 25.33)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      })

      lineSeries.setData(normalizedChartData)
      if (normalizedVolumeData.length > 0) volumeSeries.setData(normalizedVolumeData)

      if (normalizedHullData.length > 0) {
        const hullSeries = createdChart.addSeries(LineSeries, {
          color: "oklch(0.6231 0.188 259.81 / 0.7)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        hullSeries.setData(normalizedHullData)
      }

      createdChart.timeScale().fitContent()

      const priceByTimeSec = new Map<number, number>()
      for (const point of normalizedChartData) {
        if (typeof point.time !== "number") continue
        if (!Number.isFinite(point.value)) continue
        priceByTimeSec.set(Math.floor(point.time), point.value)
      }

      crosshairMoveHandler = (param: MouseEventParams<Time>) => {
        if (
          param.point === undefined ||
          param.time === undefined ||
          param.point.x < 0 ||
          param.point.y < 0
        ) {
          scrubEl?.classList.add("hidden")
          return
        }

        const timeSec = timeToEpochSeconds(param.time)
        if (timeSec == null) return

        const priceData = param.seriesData.get(lineSeries) as LineData<Time> | undefined
        const priceValue =
          typeof priceData?.value === "number" ? priceData.value : (priceByTimeSec.get(timeSec) ?? null)
        if (priceValue == null) return

        const firstPrice = normalizedChartData[0]?.value || priceValue
        const percentChange = firstPrice ? ((priceValue - firstPrice) / firstPrice) * 100 : 0

        scrubPrice.textContent = formatUsdPrice(priceValue)
        scrubPct.textContent = `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(2)}%`
        scrubPct.className =
          percentChange >= 0
            ? "font-berkeley-mono text-emerald-400"
            : "font-berkeley-mono text-rose-400"

        const containerEl = chartContainerRef.current
        if (!containerEl) return
        const gapPx = 8
        const minReservePx = 96
        // Anchor left edge just past the crosshair line (not centered on it).
        let left = param.point.x + gapPx
        left = Math.max(0, Math.min(left, Math.max(0, containerEl.clientWidth - minReservePx)))
        scrubEl?.style.setProperty("left", `${Math.round(left)}px`)
        scrubEl?.classList.remove("hidden")
      }

      createdChart.subscribeCrosshairMove(crosshairMoveHandler)
    })()

    return () => {
      isCancelled = true

      const activeChart = chartRef.current ?? chart

      try {
        if (activeChart && crosshairMoveHandler) {
          activeChart.unsubscribeCrosshairMove(crosshairMoveHandler)
        }
      } catch {
        // noop
      }

      if (resizeRafId) cancelAnimationFrame(resizeRafId)
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (windowResizeHandler) window.removeEventListener("resize", windowResizeHandler)
      if (scrubEl && chartContainerRef.current?.contains(scrubEl)) {
        chartContainerRef.current.removeChild(scrubEl)
      }

      try {
        activeChart?.remove()
      } catch {
        // noop
      }
      chartRef.current = null
    }
  }, [
    normalizedChartData,
    normalizedHullData,
    normalizedVolumeData,
    priceChange,
  ])

  if (isLoading) {
    return (
      <div className="flex h-[160px] w-full items-center justify-center">
        <Spinner className="h-4 w-4" />
      </div>
    )
  }

  if (normalizedChartData.length === 0) {
    return (
      <div className="flex h-[160px] w-full flex-col items-center justify-center space-y-2 text-xs text-gray-500">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <div>No chart data available</div>
      </div>
    )
  }

  return (
    <RateLimitErrorBoundary>
      <div className="relative w-full">
        <div
          className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />
        <div ref={chartContainerRef} className="h-[160px] w-full" />
      </div>
    </RateLimitErrorBoundary>
  )
}

