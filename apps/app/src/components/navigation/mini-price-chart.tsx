'use client'

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTheme } from "next-themes"
import { createRoot } from "react-dom/client"
import { Liveline } from "liveline"
import type { LivelinePoint } from "liveline"
import { AlertTriangle } from "lucide-react"
import { Spinner } from "@v1/ui/spinner"
import { RateLimitErrorBoundary } from "@/components/error-boundary/rate-limit-error-boundary"
import { useCoinGeckoChartData } from "@/hooks/use-coingecko-chart-data"
import { useHullSuite } from "@/hooks/use-hull-suite"
import { formatUsdPrice } from "@/lib/format-usd"

interface MiniPriceChartProps {
  coinId: string
  tokenSymbol?: string
  currentPrice?: number
}

const TooltipContent = ({
  data,
  tokenSymbol,
}: {
  data: { time: number; price: number; change: number; volume: number; hull?: number }
  tokenSymbol?: string
}) => {
  function formatVolume(vol: number) {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(2)}K`
    return `$${vol.toFixed(2)}`
  }

  function formatPrice(price: number) {
    return formatUsdPrice(price)
  }

  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="px-4 py-3">
        <div className="mb-3 text-[11px] font-medium text-zinc-400">
          {data.time
            ? new Date(data.time * 1000).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              })
            : ""}
        </div>
        <div className="mb-3 h-[1px] w-full scale-125 bg-zinc-700/50" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Price</span>
            <div className="flex items-center gap-2">
              <span
                className={`h-4 rounded px-1.5 font-diatype-mono text-[10px] ${
                  data.change >= 0
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/20 text-rose-400"
                }`}
              >
                {data.change > 0 ? "+" : ""}
                {data.change.toFixed(2)}%
              </span>
              <span className="font-diatype-mono text-[11px] font-bold">
                {formatPrice(data.price)}
              </span>
            </div>
          </div>

          {typeof data.hull === "number" && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Hull MA</span>
              <span className="font-diatype-mono text-[11px] text-blue-300">
                {formatPrice(data.hull)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Volume</span>
            <span className="font-diatype-mono text-[11px] text-zinc-300">
              {formatVolume(data.volume)}
            </span>
          </div>

          {tokenSymbol && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Token</span>
              <span className="font-diatype-mono text-[11px] text-zinc-300">
                {tokenSymbol.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function findClosestPoint(
  data: Array<LivelinePoint>,
  targetTimeSec: number,
): LivelinePoint | null {
  if (data.length === 0) return null

  let low = 0
  let high = data.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midTime = data[mid]?.time
    if (midTime === undefined) break
    if (midTime === targetTimeSec) return data[mid] ?? null
    if (midTime < targetTimeSec) low = mid + 1
    else high = mid - 1
  }

  const right = data[low]
  const left = data[low - 1]
  if (!left) return right ?? null
  if (!right) return left ?? null

  const leftDiff = Math.abs(left.time - targetTimeSec)
  const rightDiff = Math.abs(right.time - targetTimeSec)
  return leftDiff <= rightDiff ? left : right
}

export function MiniPriceChart({ coinId, tokenSymbol, currentPrice }: MiniPriceChartProps) {
  const { resolvedTheme } = useTheme()

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const tooltipElRef = useRef<HTMLDivElement | null>(null)
  const tooltipRootRef = useRef<ReturnType<typeof createRoot> | null>(null)
  const isTooltipVisibleRef = useRef(false)
  const lastTooltipTimeRef = useRef<number | null>(null)

  const initialData = useMemo(
    () => ({
      price: currentPrice || 0,
      volume_24h: 0,
      market_cap: 0,
      percent_change_24h: 0,
    }),
    [currentPrice],
  )

  const { chartData, volumeData, isLoading } = useCoinGeckoChartData(coinId, "7d", initialData)

  const priceChange = useMemo(() => {
    if (chartData.length < 2) return 0
    const firstPrice = chartData[0]?.value || 0
    const lastPrice = chartData[chartData.length - 1]?.value || 0
    if (firstPrice === 0) return 0
    return ((lastPrice - firstPrice) / firstPrice) * 100
  }, [chartData])

  const pricePoints = useMemo((): LivelinePoint[] => {
    const result: LivelinePoint[] = []
    for (const point of chartData) {
      if (typeof point.time !== "number") continue
      if (!Number.isFinite(point.value) || point.value <= 0) continue
      result.push({ time: Number(point.time), value: point.value })
    }
    return result
  }, [chartData])

  const volumePoints = useMemo((): LivelinePoint[] => {
    const result: LivelinePoint[] = []
    for (const point of volumeData) {
      if (typeof point.time !== "number") continue
      if (!Number.isFinite(point.value) || point.value < 0) continue
      result.push({ time: Number(point.time), value: point.value })
    }
    return result
  }, [volumeData])

  const ohlcvData = useMemo(() => {
    if (chartData.length === 0) return []

    return chartData.map((point, idx) => {
      const price = point.value
      const volume = volumeData[idx]?.value || 0
      const prevPrice = idx > 0 ? chartData[idx - 1]?.value || price : price
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
  }, [chartData, volumeData])

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

  const hullPoints = useMemo((): LivelinePoint[] => {
    const result: LivelinePoint[] = []
    for (const point of hullSuite.MHULL) {
      if (typeof point.time !== "number") continue
      if (!Number.isFinite(point.value) || point.value <= 0) continue
      result.push({ time: Number(point.time), value: point.value })
    }
    return result
  }, [hullSuite.MHULL])

  const latestValue = pricePoints[pricePoints.length - 1]?.value ?? 0

  const windowSecs = useMemo(() => {
    if (pricePoints.length < 2) return 30
    const first = pricePoints[0]?.time
    const last = pricePoints[pricePoints.length - 1]?.time
    if (typeof first !== "number" || typeof last !== "number") return 30
    return Math.max(30, last - first)
  }, [pricePoints])

  useEffect(() => {
    const tooltipEl = document.createElement("div")
    const tooltipRoot = createRoot(tooltipEl)
    tooltipElRef.current = tooltipEl
    tooltipRootRef.current = tooltipRoot

    tooltipEl.className =
      "fixed z-[9999] overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900/95 text-[11px] text-white shadow-2xl pointer-events-none backdrop-blur-xl transition-opacity duration-100 ease-out"
    tooltipEl.style.left = "0px"
    tooltipEl.style.top = "0px"
    tooltipEl.style.opacity = "0"
    tooltipEl.style.visibility = "hidden"
    tooltipEl.style.transform = "translate3d(0px, 0px, 0)"
    document.body.appendChild(tooltipEl)

    return () => {
      isTooltipVisibleRef.current = false
      lastTooltipTimeRef.current = null
      tooltipElRef.current = null
      tooltipRootRef.current = null

      requestAnimationFrame(() => {
        try {
          tooltipRoot.unmount()
        } catch {
          // noop
        }
        if (document.body.contains(tooltipEl)) {
          document.body.removeChild(tooltipEl)
        }
      })
    }
  }, [])

  const handleHover = useCallback(
    (hover: { time: number; value: number; x: number; y: number } | null) => {
      const tooltipEl = tooltipElRef.current
      const tooltipRoot = tooltipRootRef.current
      const container = chartContainerRef.current
      if (!tooltipEl || !tooltipRoot || !container) return

      if (!hover) {
        if (isTooltipVisibleRef.current) {
          tooltipEl.style.opacity = "0"
          tooltipEl.style.visibility = "hidden"
          isTooltipVisibleRef.current = false
          lastTooltipTimeRef.current = null
        }
        return
      }

      const closest = findClosestPoint(pricePoints, Math.round(hover.time))
      if (!closest) return

      const timeSec = closest.time
      const firstPrice = pricePoints[0]?.value ?? closest.value
      const percentChange = firstPrice ? ((closest.value - firstPrice) / firstPrice) * 100 : 0
      const volume = findClosestPoint(volumePoints, timeSec)?.value ?? 0
      const hull = findClosestPoint(hullPoints, timeSec)?.value

      if (!isTooltipVisibleRef.current) {
        tooltipEl.style.opacity = "1"
        tooltipEl.style.visibility = "visible"
        isTooltipVisibleRef.current = true
      }

      if (lastTooltipTimeRef.current !== timeSec) {
        lastTooltipTimeRef.current = timeSec
        tooltipRoot.render(
          <TooltipContent
            data={{ time: timeSec, price: closest.value, change: percentChange, volume, hull }}
            tokenSymbol={tokenSymbol}
          />,
        )
      }

      const chartRect = container.getBoundingClientRect()
      const tooltipWidth = tooltipEl.offsetWidth || 200
      const tooltipHeight = tooltipEl.offsetHeight || 120

      let left = chartRect.left + hover.x + 15
      let top = chartRect.top + hover.y - tooltipHeight / 2

      if (left + tooltipWidth > window.innerWidth - 10) {
        left = chartRect.left + hover.x - tooltipWidth - 15
      }

      if (top + tooltipHeight > window.innerHeight - 10) {
        top = window.innerHeight - tooltipHeight - 10
      }

      if (top < 10) top = 10

      tooltipEl.style.transform = `translate3d(${left}px, ${top}px, 0)`
    },
    [hullPoints, pricePoints, tokenSymbol, volumePoints],
  )

  if (isLoading) {
    return (
      <div className="flex h-[160px] w-full items-center justify-center">
        <Spinner className="h-4 w-4" />
      </div>
    )
  }

  if (pricePoints.length === 0) {
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
        <div ref={chartContainerRef} className="h-[160px] w-full">
          <Liveline
            data={pricePoints}
            value={latestValue}
            theme={resolvedTheme === "light" ? "light" : "dark"}
            color={priceChange >= 0 ? "#10B981" : "#EF4444"}
            lineWidth={2}
            window={windowSecs}
            grid={false}
            badge={false}
            fill={false}
            pulse={false}
            momentum={false}
            scrub
            tooltipY={-9999}
            tooltipOutline={false}
            onHover={handleHover}
            formatTime={() => ""}
            padding={{ top: 12, right: 12, bottom: 12, left: 12 }}
            className="size-full"
          />
        </div>
      </div>
    </RateLimitErrorBoundary>
  )
}

