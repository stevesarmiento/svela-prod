'use client'

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { CoinGeckoApi } from "@/lib/effect/coingecko-api"
import { runPromise } from "@/lib/effect/runtime-coingecko"
import type { CoinMarketData } from '@/types/coins'
import { Liveline } from "liveline"
import type { LivelinePoint } from "liveline"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"

interface InlinePriceChartProps {
  coingeckoId: string // CoinGecko ID to fetch real data
  percentChange24h: number // Fallback when series unavailable
  symbol?: string // For debugging
  sparkline7d?: ReadonlyArray<number> // Prefer quotes sparkline to avoid per-row market-chart requests
  initialData: CoinMarketData['quote']['USD'] // Required for useCoinGeckoChartData
  onError?: () => void
  className?: string
  enabled?: boolean
}

type InlineChartTimeScale = "1d" | "7d" | "14d" | "30d" | "max" | "2y"

const INLINE_TIME_SCALE_DAYS: Record<InlineChartTimeScale, string> = {
  "1d": "1",
  "7d": "7",
  "14d": "14",
  "30d": "30",
  "max": "365",
  "2y": "730",
} as const

const DAY_SECONDS = 24 * 60 * 60

function clampEvenDownsample<T>(items: Array<T>, maxItems: number): Array<T> {
  if (items.length <= maxItems) return items
  if (maxItems <= 1) return [items[items.length - 1] as T]

  const step = (items.length - 1) / (maxItems - 1)
  const out: Array<T> = []
  for (let i = 0; i < maxItems; i++) {
    out.push(items[Math.round(i * step)] as T)
  }
  return out
}

function buildFallbackSeries(args: {
  timeScale: InlineChartTimeScale
  basePrice: number
  nowMs?: number
}): Array<{ time: number; value: number }> {
  if (!Number.isFinite(args.basePrice) || args.basePrice <= 0) return []

  const nowMs = args.nowMs ?? Date.now()
  const days = Number(INLINE_TIME_SCALE_DAYS[args.timeScale] ?? "7")
  const points = Math.max(2, Math.min(7 * 24, days * 24)) // <= 168 points
  const startMs = nowMs - days * 24 * 60 * 60 * 1000
  const stepMs = Math.max(60 * 60 * 1000, Math.floor((nowMs - startMs) / (points - 1))) // >= 1h

  const out: Array<{ time: number; value: number }> = []
  for (let i = 0; i < points; i++) {
    const t = startMs + i * stepMs
    out.push({ time: Math.floor(t / 1000), value: args.basePrice })
  }
  return out
}

function buildSparklineSeries(args: {
  sparkline: ReadonlyArray<number>
  timeScale: InlineChartTimeScale
  nowMs?: number
}): Array<{ time: number; value: number }> {
  const raw = args.sparkline
  if (!raw || raw.length < 2) return []

  const cleaned = raw.filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0)
  if (cleaned.length < 2) return []

  const nowMs = args.nowMs ?? Date.now()
  const days = Number(INLINE_TIME_SCALE_DAYS[args.timeScale] ?? "7")
  const startMs = nowMs - days * 24 * 60 * 60 * 1000
  const stepMs = (nowMs - startMs) / Math.max(1, cleaned.length - 1)

  return cleaned.map((value, i) => ({
    time: Math.floor((startMs + i * stepMs) / 1000),
    value,
  }))
}

function upsertLatestValue(
  series: ReadonlyArray<{ time: number; value: number }>,
  latestValue: number,
): Array<{ time: number; value: number }> {
  if (!Number.isFinite(latestValue) || latestValue <= 0) return series.slice()
  if (series.length === 0) return []
  const next = series.slice()
  next[next.length - 1] = { ...next[next.length - 1]!, value: latestValue }
  return next
}

function toTimeScale(range: string | undefined): InlineChartTimeScale {
  if (range === "1d" || range === "7d" || range === "14d" || range === "30d" || range === "max" || range === "2y") return range
  return "7d"
}

function useInlineMarketChartSeries(args: {
  coingeckoId: string
  timeScale: InlineChartTimeScale
  enabled?: boolean
}) {
  const days = INLINE_TIME_SCALE_DAYS[args.timeScale] ?? "7"

  return useQuery({
    queryKey: ["coingecko-inline-market-chart", args.coingeckoId, args.timeScale],
    queryFn: async (): Promise<{ points: Array<{ time: number; value: number }>; cached: boolean }> => {
      const swallowToNull = (_: unknown) => Effect.succeed(null)

      const result = await runPromise(
        CoinGeckoApi.getMarketChart({
          coinId: args.coingeckoId,
          days,
          vsCurrency: "usd",
        }).pipe(
          Effect.catchTags({
            CoinGeckoInvalidParamsError: swallowToNull,
            CoinGeckoUnauthorizedError: swallowToNull,
            CoinGeckoNotFoundError: swallowToNull,
            CoinGeckoRateLimitedError: swallowToNull,
            CoinGeckoApiError: swallowToNull,
            CoinGeckoDecodeError: swallowToNull,
          }),
        ),
      )

      const prices = result?.data?.prices
      if (!Array.isArray(prices) || prices.length === 0) {
        return { points: [], cached: false }
      }

      // De-dupe + ensure strict ascending time ordering.
      const unique = new Map<number, number>()
      for (const point of prices) {
        if (!point) continue
        if (typeof point.time !== "number") continue
        if (!Number.isFinite(point.value) || point.value <= 0) continue
        unique.set(point.time, point.value)
      }

      const points = Array.from(unique.entries())
        .sort(([a], [b]) => a - b)
        .map(([time, value]) => ({ time, value }))

      return { points, cached: result?.status?.cached ?? false }
    },
    staleTime: 30 * 1000, // keep inline charts feeling fresh without spamming
    refetchInterval: (q) => {
      const points = (q.state.data as { points: Array<{ time: number; value: number }> } | undefined)?.points?.length ?? 0
      if (points < 2) return 5_000
      return 2 * 60 * 1000
    },
    enabled: (args.enabled ?? true) && args.coingeckoId.length > 0,
    retry: 1,
    refetchOnWindowFocus: true,
  })
}

export function InlinePriceChart({ 
  coingeckoId,
  percentChange24h,
  symbol = '',
  initialData,
  onError: _onError,
  className,
  enabled = true,
}: InlinePriceChartProps) {
  const timeScale = "14d" as const
  const basePrice = initialData?.price && initialData.price > 0 ? initialData.price : 0
  const fallbackTrendPct =
    typeof initialData?.percent_change_7d === "number" ? initialData.percent_change_7d : percentChange24h

  const marketChartQuery = useInlineMarketChartSeries({
    coingeckoId,
    timeScale: toTimeScale(timeScale),
    enabled,
  })

  const rawChartData = marketChartQuery.data?.points ?? []
  const rawChartDataWithLatest = useMemo(
    () => upsertLatestValue(rawChartData, basePrice),
    [rawChartData, basePrice],
  )
  const chartData =
    rawChartDataWithLatest.length >= 2
      ? rawChartDataWithLatest
      : buildFallbackSeries({ timeScale: toTimeScale(timeScale), basePrice })
  const isLoading = marketChartQuery.isLoading

  const chartData14dWindow = useMemo(() => {
    if (!chartData || chartData.length < 2) return []
    const end = chartData[chartData.length - 1]?.time
    if (typeof end !== "number" || !Number.isFinite(end)) return []
    const start = end - 14 * DAY_SECONDS
    return chartData.filter((p) => typeof p.time === "number" && p.time >= start && p.time <= end)
  }, [chartData])

  const cleanedChartData = useMemo(() => {
    if (!chartData14dWindow || chartData14dWindow.length === 0) return []

    const filtered = chartData14dWindow.filter(
      (point) =>
        point &&
        typeof point.time === "number" &&
        typeof point.value === "number" &&
        point.value > 0 &&
        !Number.isNaN(point.value),
    )

    const unique = new Map<number, number>()
    for (const point of filtered) unique.set(point.time, point.value)
    return Array.from(unique.entries())
      .sort(([a], [b]) => a - b)
      .map(([time, value]) => ({ time, value }))
  }, [chartData14dWindow])

  const cleanedChartDataWithLiveTip = useMemo(() => {
    if (cleanedChartData.length < 2) return cleanedChartData
    const last = cleanedChartData[cleanedChartData.length - 1]!
    const nowSec = Math.floor(Date.now() / 1000)

    // If the last point is stale, append a "live" point at now so Liveline doesn't draw a long tail.
    if (nowSec - last.time <= 90) return cleanedChartData
    return [...cleanedChartData, { time: nowSec, value: last.value }]
  }, [cleanedChartData])

  const last7dChangePct = useMemo(() => {
    const points = cleanedChartDataWithLiveTip
    if (points.length < 2) return fallbackTrendPct
    const endTime = points[points.length - 1]!.time
    const boundaryTime = endTime - 7 * DAY_SECONDS

    let boundaryIdx = points.findIndex((p) => p.time >= boundaryTime)
    if (boundaryIdx === -1) boundaryIdx = points.length - 1
    boundaryIdx = Math.min(Math.max(boundaryIdx, 0), points.length - 1)

    const boundaryValue = points[boundaryIdx]?.value ?? 0
    const lastValue = points[points.length - 1]?.value ?? 0
    if (!Number.isFinite(boundaryValue) || boundaryValue <= 0) return fallbackTrendPct
    if (!Number.isFinite(lastValue) || lastValue <= 0) return fallbackTrendPct

    return ((lastValue - boundaryValue) / boundaryValue) * 100
  }, [cleanedChartDataWithLiveTip, fallbackTrendPct])

  const isPositive = last7dChangePct >= 0

  const points = useMemo((): LivelinePoint[] => {
    if (cleanedChartDataWithLiveTip.length === 0) return []
    const downsampled = clampEvenDownsample(cleanedChartDataWithLiveTip.slice(), 128)
    return downsampled.map((p) => ({ time: p.time, value: p.value }))
  }, [cleanedChartDataWithLiveTip])

  const latestValue = points[points.length - 1]?.value ?? 0

  const windowSecs = useMemo(() => {
    if (points.length < 2) return 30
    const first = points[0]?.time
    const last = points[points.length - 1]?.time
    if (typeof first !== "number" || typeof last !== "number") return 30
    return Math.max(30, last - first)
  }, [points])

  const livelineTheme = "dark"

  const livelineValue = points.length > 0 ? latestValue : basePrice

  const tooltipText = useMemo(() => {
    const changeText = `${last7dChangePct > 0 ? "+" : ""}${last7dChangePct.toFixed(2)}%`
    const dataInfo = marketChartQuery.data?.cached ? "cached data" : "live data"
    const pointsInfo = `${points.length} points`
    return `${symbol} last 7d: ${changeText} | 14d window | ${dataInfo} | ${pointsInfo}`
  }, [symbol, last7dChangePct, marketChartQuery.data?.cached, points.length])

  return (
    <div 
      className={cn(
        "h-8 rounded-sm overflow-hidden bg-transparent",
        className ?? "w-56",
      )}
      title={
        isLoading
          ? `${symbol} loading data...`
          : points.length === 0
            ? `${symbol} no data available`
            : tooltipText
      }
    >
      <div className="relative size-full">
        {/* Base: full 14d line in neutral */}
        <div className="absolute inset-0 pointer-events-none">
          <Liveline
            data={points}
            value={livelineValue}
            theme={livelineTheme}
            color="#ffffff30"
            showValue={false}
            dot={false}
            lineWidth={1}
            window={windowSecs}
            grid={false}
            badge={false}
            fill={false}
            pulse={false}
            scrub={false}
            momentum={false}
            loading={isLoading}
            exaggerate
            emptyText="No data"
            formatTime={() => ""}
            padding={{ top: 8, right: 0, bottom: 8, left: 8 }}
            className="size-full"
          />
        </div>

        {/* Overlay: same line, clipped to the most recent 7d half */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ clipPath: "inset(0 0 0 50%)" }}
        >
          <Liveline
            data={points}
            value={livelineValue}
            theme={livelineTheme}
            color={isPositive ? "#00d492" : "#ff6467"}
            showValue={false}
            dot={false}
            lineWidth={1}
            window={windowSecs}
            grid={false}
            badge={false}
            fill={false}
            pulse={false}
            scrub={false}
            momentum={false}
            loading={isLoading}
            exaggerate
            emptyText="No data"
            formatTime={() => ""}
            padding={{ top: 8, right: 0, bottom: 8, left: 8 }}
            className="size-full"
          />
        </div>
      </div>
    </div>
  )
}

export function LazyInlinePriceChart(props: InlinePriceChartProps & { rootMarginPx?: number }) {
  const rootMarginPx = props.rootMarginPx ?? 400
  const ref = useRef<HTMLDivElement | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver !== "function") {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        setIsInView(entry.isIntersecting)
      },
      {
        root: null,
        rootMargin: `${rootMarginPx}px`,
        threshold: 0,
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMarginPx])

  return (
    <div ref={ref} className={cn("w-full", props.className)}>
      {isInView ? (
        <InlinePriceChart {...props} enabled />
      ) : (
        <Skeleton className="h-8 w-full max-w-56 rounded-sm" />
      )}
    </div>
  )
}
