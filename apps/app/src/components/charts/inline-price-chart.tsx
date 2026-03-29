'use client'

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { CoinGeckoApi } from "@/lib/effect/coingecko-api"
import { runPromise } from "@/lib/effect/runtime-coingecko"
import type { CoinMarketData } from '@/types/coins'
import { Liveline } from "liveline"
import type { LivelinePoint } from "liveline"
import { useTheme } from "next-themes"
import { cn } from "@v1/ui/cn"

interface InlinePriceChartProps {
  coingeckoId: string // CoinGecko ID to fetch real data
  percentChange24h: number // Fallback when series unavailable
  symbol?: string // For debugging
  initialData: CoinMarketData['quote']['USD'] // Required for useCoinGeckoChartData
  onError?: () => void
  className?: string
}

type InlineChartTimeScale = "1d" | "7d" | "30d" | "max" | "2y"

const INLINE_TIME_SCALE_DAYS: Record<InlineChartTimeScale, string> = {
  "1d": "1",
  "7d": "7",
  "30d": "30",
  "max": "365",
  "2y": "730",
} as const

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

function toTimeScale(range: string | undefined): InlineChartTimeScale {
  if (range === "1d" || range === "7d" || range === "30d" || range === "max" || range === "2y") return range
  return "7d"
}

function useInlineMarketChartSeries(args: {
  coingeckoId: string
  timeScale: InlineChartTimeScale
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
    enabled: args.coingeckoId.length > 0,
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
}: InlinePriceChartProps) {
  const { resolvedTheme } = useTheme()

  const timeScale = "7d" as const
  const basePrice = initialData?.price && initialData.price > 0 ? initialData.price : 0
  const fallbackTrendPct =
    typeof initialData?.percent_change_7d === "number" ? initialData.percent_change_7d : percentChange24h

  const marketChartQuery = useInlineMarketChartSeries({
    coingeckoId,
    timeScale: toTimeScale(timeScale),
  })

  const rawChartData = marketChartQuery.data?.points ?? []
  const chartData =
    rawChartData.length >= 2 ? rawChartData : buildFallbackSeries({ timeScale: toTimeScale(timeScale), basePrice })
  const isLoading = marketChartQuery.isLoading

  // Filter and prepare chart data
  const validChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return []

    const filtered = chartData.filter(
      (point) =>
        point &&
        typeof point.time === "number" &&
        typeof point.value === "number" &&
        point.value > 0 &&
        !Number.isNaN(point.value),
    )

    // Liveline is tiny here; keep render cost bounded.
    return clampEvenDownsample(filtered, 128)
  }, [chartData])

  const seriesChangePct = useMemo(() => {
    if (validChartData.length < 2) return null
    const first = validChartData[0]?.value ?? 0
    const last = validChartData[validChartData.length - 1]?.value ?? 0
    if (!Number.isFinite(first) || first <= 0) return null
    return ((last - first) / first) * 100
  }, [validChartData])

  const trendPct = seriesChangePct ?? fallbackTrendPct
  const isPositive = trendPct >= 0

  // Prepare tooltip text
  const tooltipText = useMemo(() => {
    const changeText = `${trendPct > 0 ? "+" : ""}${trendPct.toFixed(2)}%`
    const dataInfo = marketChartQuery.data?.cached ? "cached data" : "live data"
    const pointsInfo = `${validChartData.length} points`
    
    return `${symbol} 7d trend: ${changeText} | ${dataInfo} | ${pointsInfo}`
  }, [symbol, trendPct, validChartData.length, marketChartQuery.data?.cached])

  const points = useMemo((): LivelinePoint[] => {
    const result: LivelinePoint[] = []
    for (const point of validChartData) {
      if (typeof point.time !== "number") continue
      if (!Number.isFinite(point.value)) continue
      result.push({ time: Number(point.time), value: point.value })
    }
    return result
  }, [validChartData])

  const latestValue = points[points.length - 1]?.value ?? 0

  const windowSecs = useMemo(() => {
    if (points.length < 2) return 30
    const first = points[0]?.time
    const last = points[points.length - 1]?.time
    if (typeof first !== "number" || typeof last !== "number") return 30
    return Math.max(30, last - first)
  }, [points])

  const livelineTheme = resolvedTheme === "light" ? "light" : "dark"

  const livelineValue = points.length > 0 ? latestValue : basePrice

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
      <Liveline
        data={points}
        value={livelineValue}
        theme={livelineTheme}
        color={isPositive ? "#10b981" : "#ef4444"}
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
        padding={{ top: 8, right: 8, bottom: 8, left: 8 }}
        className="size-full"
      />
    </div>
  )
}
