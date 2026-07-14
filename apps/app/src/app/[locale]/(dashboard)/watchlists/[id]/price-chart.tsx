'use client'

import React, { useTransition, useDeferredValue, useCallback, useEffect, useMemo, memo, useRef, useState, useSyncExternalStore } from 'react'
import { useIsomorphicTheme } from '@/hooks/use-isomorphic-theme'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import { Badge } from "@v1/ui/badge"
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { useChartInstance, type HullSuiteOverlay, type ProjectionOverlay } from '@/hooks/use-chart-instance'
import { usePriceCalculations } from '@/hooks/use-price-calculations'
import type { CoinMarketData } from '@/types/coins'
import { useHullSuite } from '@/hooks/use-hull-suite'
import { usePriceProjection } from '@/hooks/use-price-projection'
import { generatePastelColors, addOpacityToColor, CANDLE_UP_COLOR, CANDLE_DOWN_COLOR } from '@/lib/chart-colors'
import { IconTriangleFill } from 'symbols-react'
import { useQuery as useTanStackQuery } from '@tanstack/react-query'
import { CoinsInternalApi } from '@/lib/effect/coins-internal-api'
import { runPromise } from '@/lib/effect/runtime-coins-internal'
import { useCoinGeckoQuote } from '@/hooks/use-coingecko-quotes'
import { formatUsdPrice } from '@/lib/format-usd'
import type { Time } from 'lightweight-charts'
import { cleanTokenName, getTokenLogoURL } from '@/lib/logo-overrides'
import { TokenLogo } from "@/components/token-logo"
import type { RealtimeQuoteStatus } from "@/hooks/use-realtime-quote"
import { useLiveSpotPrice } from "@/lib/realtime-prices/live-spot-store"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import { ChartLoadingSkeleton } from "@/components/charts/chart-loading-skeleton"

interface PriceChartProps {
  coinId: string;
  initialData: CoinMarketData['quote']['USD'];
  activeTimeScale: string;
  setActiveTimeScale: (scale: string) => void;
  isPending?: boolean;
  spotStatus?: RealtimeQuoteStatus;
}

function clampPercentChange(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value > 9999) return 9999
  if (value < -9999) return -9999
  return value
}

function PriceChangeBadge(props: { pct: number }) {
  const clamped = clampPercentChange(props.pct)
  const isPositive = clamped > 0
  const isNegative = clamped < 0
  const isNeutral = !isPositive && !isNegative
  return (
    <Badge
      variant={isPositive ? "success" : isNegative ? "destructive" : "outline"}
      className={cn(
        "inline-flex align-middle h-6 px-2 font-berkeley-mono text-[12px] tabular-nums gap-1",
        isNeutral &&
          "border-zinc-200/60 text-muted-foreground dark:border-white/10",
      )}
    >
      <IconTriangleFill
        aria-hidden="true"
        className={cn(
          "size-[6px] shrink-0 fill-current",
          isNegative && "rotate-180",
        )}
      />
      {Math.abs(clamped).toFixed(2)}%
    </Badge>
  )
}

function getSpotStatusLabel(
  status: RealtimeQuoteStatus | undefined,
): { label: string; title: string; className: string; href?: string; hrefLabel?: string } | null {
  if (!status) return null
  if (status.kind === "disabled") return null

  if (status.kind === "realtime") {
    return {
      label: "LIVE",
      title: "Realtime price via",
      className:
        "text-emerald-600 dark:text-emerald-400 bg-black border-zinc-800/80",
      href: "https://docs.pyth.network/price-feeds/core/api-instances-and-providers/hermes",
      hrefLabel: "Pyth Hermes",
    }
  }

  if (status.kind === "last-known") {
    return {
      label: "WARM",
      title: "Warm-started from last-known spot snapshot (Pyth)",
      className: "text-zinc-700 dark:text-zinc-300 bg-zinc-500/10 border-zinc-500/15",
      href: "https://docs.pyth.network/price-feeds/fetch-price-updates",
      hrefLabel: "How Pyth price updates work",
    }
  }

  return {
    label: "CACHED",
    title: "Fallback to",
    className: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/15",
    href: "https://docs.coingecko.com/reference/simple-price",
    hrefLabel: "CoinGecko quotes",
  }
}

interface IndicatorSettings {
  showWaveTrend: boolean
  showFastMoneyFlow: boolean
  showSlowMoneyFlow: boolean
  showRSI: boolean
  showStochRSI: boolean
  showHullSuite: boolean
}

// Stable settings objects to avoid chart re-creation from changing identity.
const PRICE_CHART_INDICATORS: IndicatorSettings = {
  showWaveTrend: false,
  showFastMoneyFlow: false,
  showSlowMoneyFlow: false,
  showRSI: false,
  showStochRSI: false,
  showHullSuite: true,
}

const HULL_SUITE_CONFIG: Parameters<typeof useHullSuite>[1] = {
  src: 'close',
  modeSwitch: 'Ehma',
  length: 55,
  lengthMult: 1.0,
  useHtf: false,
  htf: '240',
  switchColor: true,
  candleCol: false,
  visualSwitch: true,
  thicknesSwitch: 1,
  transpSwitch: 40,
}

interface VolumePointByEpoch {
  epochSeconds: number
  value: number
}

function isBusinessDay(value: unknown): value is { year: number; month: number; day: number } {
  if (!value || typeof value !== 'object') return false
  return (
    'year' in value &&
    'month' in value &&
    'day' in value &&
    typeof (value as { year?: unknown }).year === 'number' &&
    typeof (value as { month?: unknown }).month === 'number' &&
    typeof (value as { day?: unknown }).day === 'number'
  )
}

function timeToEpochSeconds(time: Time): number | null {
  if (typeof time === 'number') return (time > 1e10 ? Math.floor(time / 1000) : Math.floor(time))
  if (typeof time === 'string') {
    const ms = Date.parse(time)
    if (!Number.isFinite(ms)) return null
    return Math.floor(ms / 1000)
  }
  if (isBusinessDay(time)) {
    const ms = Date.UTC(time.year, time.month - 1, time.day, 0, 0, 0, 0)
    return Math.floor(ms / 1000)
  }
  return null
}

function estimateAverageIntervalSeconds(epochSeconds: number[]): number | null {
  if (epochSeconds.length < 2) return null
  const sorted = epochSeconds.slice().sort((a, b) => a - b)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const span = last - first
  if (span <= 0) return null
  return span / (sorted.length - 1)
}

function findNearestVolumeValue(
  targetEpochSeconds: number,
  volumePoints: Array<VolumePointByEpoch>,
): { value: number; diffSeconds: number } | null {
  if (volumePoints.length === 0) return null

  let lo = 0
  let hi = volumePoints.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const midEpoch = volumePoints[mid]!.epochSeconds
    if (midEpoch === targetEpochSeconds) return { value: volumePoints[mid]!.value, diffSeconds: 0 }
    if (midEpoch < targetEpochSeconds) lo = mid + 1
    else hi = mid - 1
  }

  const right = volumePoints[Math.min(lo, volumePoints.length - 1)]!
  const left = volumePoints[Math.max(0, lo - 1)]!

  const diffRight = Math.abs(right.epochSeconds - targetEpochSeconds)
  const diffLeft = Math.abs(left.epochSeconds - targetEpochSeconds)

  return diffLeft <= diffRight
    ? { value: left.value, diffSeconds: diffLeft }
    : { value: right.value, diffSeconds: diffRight }
}

function getUtcMonthRange(epochSeconds: number): { fromEpochSeconds: number; toEpochSeconds: number } {
  const date = new Date(epochSeconds * 1000)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return {
    fromEpochSeconds: Math.floor(Date.UTC(year, month, 1, 0, 0, 0, 0) / 1000),
    toEpochSeconds: Math.floor(Date.UTC(year, month + 1, 1, 0, 0, 0, 0) / 1000),
  }
}

function getUtcQuarterRange(epochSeconds: number): { fromEpochSeconds: number; toEpochSeconds: number } {
  const date = new Date(epochSeconds * 1000)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const quarterStartMonth = Math.floor(month / 3) * 3
  return {
    fromEpochSeconds: Math.floor(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0, 0) / 1000),
    toEpochSeconds: Math.floor(Date.UTC(year, quarterStartMonth + 3, 1, 0, 0, 0, 0) / 1000),
  }
}

// React 19: Memoized time scale selector
const TimeScaleSelector = memo(function TimeScaleSelector({ activeTimeScale, setActiveTimeScale }: { 
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void 
}) {
  const scales = [
    { value: "30d", label: "1M" },   // 30 days focus with 90 days context
    { value: "max", label: "1Y" },    // 1 year of data
    { value: "2y", label: "2Y" },    // Maximum data possible
  ]

  return (
    <div className="flex gap-1 bg-white/95 dark:bg-black border border-gray-200/50 dark:border-zinc-800/80 rounded-[14px] p-1">
      {scales.map((scale) => (
        <button
          type="button"
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "px-2 py-1 text-xs rounded-lg transition-colors duration-[var(--duration-micro)] cursor-pointer",
            activeTimeScale === scale.value
              ? "border border-gray-300 shadow-md shadow-gray-500/20 text-gray-900 bg-zinc-800/50 hover:bg-zinc-800/70 dark:border-zinc-800/50 dark:shadow-zinc-950/50 dark:text-white"
              : "bg-transparent border border-transparent text-muted-foreground hover:bg-muted/70"
          )}
        >
          {scale.label}
        </button>
      ))}
    </div>
  )
})

// Crosshair position lives in a tiny external store instead of React state:
// lightweight-charts fires crosshair callbacks at mousemove frequency, and a
// setState here re-rendered the entire 600-line PriceChart per pointer frame.
// Only the small ScrubPriceValue component subscribes.
interface CrosshairSnapshot {
  price: number | null
  timeEpochSec: number | null
}

function createCrosshairStore() {
  let snapshot: CrosshairSnapshot = { price: null, timeEpochSec: null }
  const listeners = new Set<() => void>()
  return {
    get: () => snapshot,
    set(next: Partial<CrosshairSnapshot>) {
      const merged = { ...snapshot, ...next }
      if (merged.price === snapshot.price && merged.timeEpochSec === snapshot.timeEpochSec) return
      snapshot = merged
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

type CrosshairStore = ReturnType<typeof createCrosshairStore>

// The only part of the header that changes while scrubbing. Subscribes to the
// crosshair store so pointer moves re-render just this fragment.
function ScrubPriceValue(props: {
  store: CrosshairStore
  livePrice: number
  liveChange24h: number
  basePrice: number | null
  showPending: boolean
}) {
  const { store, livePrice, liveChange24h, basePrice, showPending } = props
  const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get)

  const crosshairPrice = snapshot.price
  const scrubPriceChange =
    crosshairPrice != null && basePrice != null && Number.isFinite(basePrice) && basePrice !== 0
      ? ((crosshairPrice - basePrice) / basePrice) * 100
      : null

  const currentPrice = crosshairPrice ?? livePrice
  const priceChange24h = scrubPriceChange ?? liveChange24h

  // De-emphasize the "$" and the cents so the whole-dollar amount leads.
  const formattedPrice = formatUsdPrice(currentPrice)
  const priceParts = formattedPrice.match(/^\$([\d,]+)(\.\d+)?$/)

  return (
    <>
      <div className="flex items-center">
        <span className={cn("text-4xl font-bold font-sans text-gray-900 dark:text-white", showPending && "animate-pulse motion-reduce:animate-none",)}>
          {priceParts ? (
            <>
              <span className="opacity-50">$</span>
              {priceParts[1]}
              {priceParts[2] ? <span className="opacity-50">{priceParts[2]}</span> : null}
            </>
          ) : (
            formattedPrice
          )}
        </span>
        {showPending && (
          <div className="inline-flex items-center ml-2">
            <div className="w-2 h-2 bg-gray-400 dark:bg-white/50 rounded-full animate-pulse motion-reduce:animate-none" />
          </div>
        )}
      </div>

      <div className="mt-1">
        {Number.isNaN(priceChange24h) ? (
          <Badge
            variant="outline"
            className="inline-flex align-middle h-6 px-2 font-berkeley-mono text-[12px] tabular-nums border-zinc-200/60 text-muted-foreground dark:border-white/10"
          >
            N/A
          </Badge>
        ) : (
          <PriceChangeBadge pct={priceChange24h} />
        )}
      </div>
    </>
  )
}

export const PriceChart = memo(function PriceChart({
  coinId,
  initialData,
  activeTimeScale,
  setActiveTimeScale,
  isPending,
  spotStatus,
}: PriceChartProps) {
  // React 19: Add concurrent features
  const [isDataPending, startDataTransition] = useTransition()

  const crosshairStoreRef = useRef<CrosshairStore | null>(null)
  if (!crosshairStoreRef.current) crosshairStoreRef.current = createCrosshairStore()
  const crosshairStore = crosshairStoreRef.current

  // React 19: Defer expensive computations
  const deferredCoinId = useDeferredValue(coinId)
  const deferredTimeScale = useDeferredValue(activeTimeScale)
  const deferredInitialData = useDeferredValue(initialData)
  // React 19: Enhanced time scale change handler
  const handleTimeScaleChange = useCallback((scale: string) => {
    startDataTransition(() => {
      setActiveTimeScale(scale)
    })
  }, [setActiveTimeScale])

  const handleCrosshairTimeMove = useCallback((time: Time | null) => {
    crosshairStore.set({ timeEpochSec: time == null ? null : timeToEpochSeconds(time) })
  }, [crosshairStore])

  const handleCrosshairMove = useCallback((price: number | null) => {
    crosshairStore.set({ price })
  }, [crosshairStore])

  const { data: coingeckoCoinData } = useTanStackQuery({
    queryKey: ["coingecko-coin", deferredCoinId],
    queryFn: async () => {
      if (!deferredCoinId) return null
      return await runPromise(CoinsInternalApi.getCoinGeckoCoinById({ id: deferredCoinId }))
    },
    enabled: !!deferredCoinId,
    staleTime: 10 * 60 * 1000,
  })
  
  // Canonical quote source (shared cache across token page + tables).
  const quoteQuery = useCoinGeckoQuote(deferredCoinId)
  const liveQuote = quoteQuery.data
  const liveSpot = useLiveSpotPrice(coinId)
  const liveSpotPriceUsd = liveSpot?.priceUsd ?? null
  
  // React 19: Get line chart data with OHLC data for tooltips using deferred values
  const { chartData, volumeData, ohlcData, isLoading, isWarmingUp, tokenData } = useCoinGeckoChartData(
    deferredCoinId,
    deferredTimeScale,
    deferredInitialData,
  )
  const { displayPrice, calculatePercentageChange } = usePriceCalculations(chartData, tokenData, deferredInitialData, deferredTimeScale)
  
  // Use isomorphic theme hook - eliminates hydration mismatch
  const { isDarkMode } = useIsomorphicTheme()
  

  // Generate Hull Suite colors - theme-aware
  const hullColors = generatePastelColors(1)
  const baseHullColor = isDarkMode ? 'oklch(0.8141 0 0)' : 'oklch(0.6498 0.0452 248.52)'
  const primaryHullColor = addOpacityToColor(hullColors[0] || baseHullColor, isDarkMode ? 0.7 : 0.6)
  
  // Always use line chart - simplified approach

  // Use OHLC data for Hull Suite (add volume=0 for compatibility).
  const ohlcvDataForHull = useMemo(() => {
    return ohlcData.map((point) => ({ ...point, volume: 0 }))
  }, [ohlcData])

  const hullSuiteData = useHullSuite(ohlcvDataForHull, HULL_SUITE_CONFIG)

  const hullSuiteOverlay = useMemo<HullSuiteOverlay>(() => {
    return {
      mhull: hullSuiteData.MHULL,
      shull: hullSuiteData.SHULL,
      color: primaryHullColor,
      lineStyle: 'dotted',
      lineWidth: 1,
    }
  }, [hullSuiteData, primaryHullColor])

  // Forward projection (dashed base trend + bull/bear scenario curves).
  // Always on. Never projects off a warming/stale tail — recomputes when the
  // backfill lands. The Hull Suite MHULL line feeds the trend-slope blend;
  // BBWP + RSI divergences are derived inside the hook from the same bars.
  const projectionData = usePriceProjection(ohlcData, !isWarmingUp, hullSuiteData.MHULL)

  const projectionOverlay = useMemo<ProjectionOverlay | null>(() => {
    if (!projectionData) return null
    return {
      base: projectionData.base,
      bull: projectionData.bull,
      bear: projectionData.bear,
      baseColor: isDarkMode ? 'oklch(1 0 0 / 0.55)' : 'oklch(0 0 0 / 0.55)',
      bullColor: addOpacityToColor(CANDLE_UP_COLOR, 0.55),
      bearColor: addOpacityToColor(CANDLE_DOWN_COLOR, 0.55),
      lineWidth: 1,
    }
  }, [projectionData, isDarkMode])

  const ohlcvDataForChart = useMemo(() => {
    if (!ohlcData.length) return []

    const volumePoints: Array<VolumePointByEpoch> = volumeData
      .map((point) => {
        const epochSeconds = timeToEpochSeconds(point.time)
        return epochSeconds == null || !Number.isFinite(point.value)
          ? null
          : { epochSeconds, value: point.value }
      })
      .filter((point): point is VolumePointByEpoch => point !== null)
      .sort((a, b) => a.epochSeconds - b.epochSeconds)

    const ohlcEpochSeconds = ohlcData
      .map((point) => timeToEpochSeconds(point.time))
      .filter((t): t is number => t != null)
    const averageIntervalSeconds = estimateAverageIntervalSeconds(ohlcEpochSeconds)
    const maxDiffSeconds = Math.max(2 * 60 * 60, Math.floor((averageIntervalSeconds ?? 0) / 2) || 12 * 60 * 60)

    const base = ohlcData.map((point) => {
      const epochSeconds = timeToEpochSeconds(point.time)
      if (epochSeconds == null || volumePoints.length === 0) return { ...point }

      const nearest = findNearestVolumeValue(epochSeconds, volumePoints)
      const volume =
        nearest && nearest.diffSeconds <= maxDiffSeconds && Number.isFinite(nearest.value) ? nearest.value : undefined

      return { ...point, volume }
    })

    // NOTE: the realtime spot price is intentionally NOT merged here — it
    // flows to the chart as an O(1) last-bar update via the livePriceUsd
    // option. Including it in this memo re-mapped/re-sorted the entire
    // series (and re-fed setData) on every ~1s tick.
    return base
  }, [ohlcData, volumeData])

  const isSeriesReady = ohlcvDataForChart.length >= 2

  // Highlight the period under the crosshair and dim the rest:
  // - 1Q + 1Y: highlight month
  // - Max: highlight quarter
  // Derived from the crosshair store via subscription: the range only
  // changes when the cursor crosses a month/quarter boundary, so the
  // identity-preserving setState below makes pointer moves render-free
  // for this component.
  type HighlightRange = { from: Time; to: Time; dimOpacity: number; boundaryColor: string }
  const [highlightRange, setHighlightRange] = useState<HighlightRange | null>(null)

  useEffect(() => {
    const compute = () => {
      const { timeEpochSec } = crosshairStore.get()
      if (timeEpochSec == null) {
        setHighlightRange((prev) => (prev == null ? prev : null))
        return
      }

      const isQuarterly = deferredTimeScale === '2y' || deferredTimeScale === 'max'
      const range = isQuarterly
        ? getUtcQuarterRange(timeEpochSec)
        : getUtcMonthRange(timeEpochSec)

      const boundaryColor = isDarkMode ? 'oklch(1 0 0 / 0.25)' : 'oklch(0 0 0 / 0.25)'

      setHighlightRange((prev) =>
        prev != null &&
        prev.from === (range.fromEpochSeconds as Time) &&
        prev.to === (range.toEpochSeconds as Time) &&
        prev.boundaryColor === boundaryColor
          ? prev
          : {
              from: range.fromEpochSeconds as Time,
              to: range.toEpochSeconds as Time,
              dimOpacity: 0.18,
              boundaryColor,
            },
      )
    }

    compute()
    return crosshairStore.subscribe(compute)
  }, [crosshairStore, deferredTimeScale, isDarkMode])

  const chartContainerRef = useChartInstance(isSeriesReady ? ohlcvDataForChart : [], {
    chartType: 'line',
    showVolume: true,
    // Honest gaps: while the series is warming (stored tail un-fetched),
    // pinning the live spot price to the last bar draws a fake straight
    // segment across the gap — hold off until the backfill lands.
    livePriceUsd: isWarmingUp ? undefined : liveSpotPriceUsd,
    isDarkMode,
    hullSuite: hullSuiteOverlay,
    projection: projectionOverlay,
    onCrosshairMove: handleCrosshairMove,
    onCrosshairTimeMove: handleCrosshairTimeMove,
    highlightRange,
  })

  // Get coin info from CoinGecko database, with local logo overrides.
  const coinName = cleanTokenName(coingeckoCoinData?.name || 'Loading...')
  const coinLogoUrl = getTokenLogoURL(coingeckoCoinData?.symbol, coingeckoCoinData?.logoUrl)
  const safeCoinLogoUrl =
    coinLogoUrl && (coinLogoUrl.startsWith('http') || coinLogoUrl.startsWith('/'))
      ? coinLogoUrl
      : '/favicon.ico'
  
  // React 19: Show pending states and optimize price display
  const basePrice = ohlcvDataForChart[0]?.open || ohlcvDataForChart[0]?.close || null

  const liveChange24h = liveQuote?.price_change_percentage_24h ?? calculatePercentageChange ?? 0
  const chartLastPrice =
    chartData.length > 0 ? chartData[chartData.length - 1]?.value ?? null : null

  const referencePrice =
    (typeof liveQuote?.current_price === "number" && Number.isFinite(liveQuote.current_price) && liveQuote.current_price > 0
      ? liveQuote.current_price
      : null) ??
    (typeof chartLastPrice === "number" && Number.isFinite(chartLastPrice) && chartLastPrice > 0
      ? chartLastPrice
      : null) ??
    (typeof deferredInitialData?.price === "number" && Number.isFinite(deferredInitialData.price) && deferredInitialData.price > 0
      ? deferredInitialData.price
      : null)

  const isLiveSpotTrusted = (() => {
    const spot = liveSpotPriceUsd
    if (typeof spot !== "number" || !Number.isFinite(spot) || spot <= 0) return false
    if (referencePrice == null) return true
    const ratio = spot / referencePrice
    // Guard against wrong Pyth feed selection (e.g. META equity feed, KPEPE 1000x unit feed).
    if (!Number.isFinite(ratio) || ratio <= 0) return false
    return ratio < 20 && ratio > 0.05
  })()

  const trustedSpotPriceUsd = isLiveSpotTrusted ? liveSpotPriceUsd : null
  const livePrice =
    (typeof trustedSpotPriceUsd === "number" && Number.isFinite(trustedSpotPriceUsd) && trustedSpotPriceUsd > 0
      ? trustedSpotPriceUsd
      : null) ??
    (typeof chartLastPrice === "number" && Number.isFinite(chartLastPrice) && chartLastPrice > 0
      ? chartLastPrice
      : null) ??
    deferredInitialData?.price ??
    displayPrice ??
    liveQuote?.current_price ??
    0

  // Only treat loading as "blocking" when we can’t render a proper series yet.
  // Warmup (stale DB refresh) can run in the background without pulsing the whole chart.
  const isBlockingLoading = quoteQuery.isLoading || (isLoading && !isSeriesReady) || !isSeriesReady
  const showPending = isPending || isDataPending || isBlockingLoading
  const effectiveSpotStatus = useMemo(() => {
    if (!spotStatus) return spotStatus
    if (spotStatus.kind !== "realtime") return spotStatus
    return isLiveSpotTrusted
      ? spotStatus
      : { kind: "fallback" as const, updatedAtMs: spotStatus.updatedAtMs, source: "coingecko" as const }
  }, [spotStatus, isLiveSpotTrusted])
  const spotStatusLabel = useMemo(() => getSpotStatusLabel(effectiveSpotStatus), [effectiveSpotStatus])

  return (
    <div className={cn(
      "will-change-auto transform-gpu",
      showPending ? 'opacity-90 transition-opacity duration-200' : ''
    )}>
      {/* React 19: Enhanced Main Price Chart with hardware acceleration */}
      <div className={cn(
        showPending && "opacity-95"
      )}>
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
              maskImage:
                "radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)",
              WebkitMaskImage:
                 "radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader className="flex flex-row items-start justify-between">
              {/* Left side - Coin info */}
              <div className="relative flex gap-3 justify-between items-start w-full">
                <div className="absolute left-0 flex flex-col space-y-1">
                  <div className="flex items-center gap-2">
                    <TokenLogo
                      src={safeCoinLogoUrl}
                      alt={coinName}
                      sizePx={16}
                      fallbackText={coingeckoCoinData?.symbol}
                      className="ring-0 bg-transparent"
                      quality={70}
                    />
                    <span className="text-gray-900 dark:text-white font-bold text-sm">{coinName}</span>
                    <span className="text-primary/60 text-sm">is currently</span>
                    </div>
                  <ScrubPriceValue
                    store={crosshairStore}
                    livePrice={livePrice}
                    liveChange24h={liveChange24h}
                    basePrice={basePrice}
                    showPending={showPending}
                  />
                </div>
              </div>
               <div className="absolute right-0 top-0 z-20 pointer-events-auto flex flex-col items-end gap-2">
                  <TimeScaleSelector
                    activeTimeScale={deferredTimeScale}
                    setActiveTimeScale={handleTimeScaleChange}
                  />
                </div>
                <div className="hidden absolute right-4 top-[57px] z-20 pointer-events-auto flex flex-col items-end gap-2">
                  {spotStatusLabel ? (
                    <Tooltip delayDuration={250}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Price feed source"
                          className={cn(
                            "inline-flex gap-1.5 items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold font-berkeley-mono tracking-wider tabular-nums cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950",
                            spotStatusLabel.className,
                          )}
                        >
                          <div className="relative h-1.5 w-1.5">
                            <span
                              aria-hidden="true"
                              className="absolute top-0 left-0 inline-block h-1.5 w-1.5 rounded-full bg-current"
                            />
                            <span
                              aria-hidden="true"
                              className="absolute top-0 left-0 inline-block h-1.5 w-1.5 rounded-full bg-current animate-ping"
                            />
                          </div>
                          {spotStatusLabel.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="left"
                        align="center"
                        sideOffset={8}
                        className="flex items-center gap-2 rounded-md border bg-white/95 p-2 py-1 text-xs text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <span>{spotStatusLabel.title}</span>
                        {spotStatusLabel.href ? (
                          <a
                            href={spotStatusLabel.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="ml-1 inline-flex items-center rounded-sm text-xs font-medium text-primary underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
                          >
                            {spotStatusLabel.hrefLabel ?? "Learn more"}
                          </a>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
            </CardHeader>
            <CardContent className="">
              <div className={cn(
                "p-0 relative will-change-auto",
                showPending && "opacity-80 transition-opacity duration-300"
              )}>
                <div className="relative h-[400px] w-full">
                  {!isSeriesReady ? (
                    <ChartLoadingSkeleton height={400} lines={1} className="opacity-80" />
                  ) : (
                    <div
                      ref={chartContainerRef}
                      className="h-[400px] w-full will-change-auto transform-gpu"
                      style={{ contain: 'layout style paint' }}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
})