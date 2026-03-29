'use client'

import React, { useTransition, useDeferredValue, useCallback, useMemo, memo, useState } from 'react'
import { useIsomorphicTheme } from '@/hooks/use-isomorphic-theme'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { motion, useReducedMotion } from 'motion/react'
import { cn } from "@v1/ui/cn"
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { useChartInstance, type HullSuiteOverlay } from '@/hooks/use-chart-instance'
import { usePriceCalculations } from '@/hooks/use-price-calculations'
import type { CoinMarketData } from '@/types/coins'
import { useHullSuite } from '@/hooks/use-hull-suite'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { IconArrowUpRight } from 'symbols-react'
import Image from 'next/image'
import NumberFlow from '@/components/number-flow'
import { useQuery as useTanStackQuery } from '@tanstack/react-query'
import { CoinsInternalApi } from '@/lib/effect/coins-internal-api'
import { runPromise } from '@/lib/effect/runtime-coins-internal'
import { useCoinGeckoQuote } from '@/hooks/use-coingecko-quotes'
import { getUsdPriceFormatOptions } from '@/lib/format-usd'
import type { Format } from '@/lib/number-flow/lite'
import type { Time } from 'lightweight-charts'

interface PriceChartProps {
  coinId: string;
  initialData: CoinMarketData['quote']['USD'];
  activeTimeScale: string;
  setActiveTimeScale: (scale: string) => void;
  isPending?: boolean;
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
    { value: "30d", label: "1Q" },   // 30 days focus with 90 days context
    { value: "max", label: "1Y" },    // 1 year of data
    { value: "2y", label: "Max" },    // Maximum data possible
  ]

  return (
    <div className="flex gap-1 bg-white/95 dark:bg-zinc-950/10 backdrop-blur-xl border border-gray-200/50 dark:border-zinc-800/30 rounded-[12px] p-1">
      {scales.map((scale) => (
        <button
          type="button"
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "px-2 py-1 text-xs rounded-lg transition-all duration-200",
            activeTimeScale === scale.value
              ? "bg-gray-200 border border-gray-300 shadow-md shadow-gray-500/20 text-gray-900 dark:bg-zinc-800/50 dark:border-zinc-800/50 dark:shadow-zinc-950/50 dark:text-white"
              : "bg-transparent text-muted-foreground hover:bg-muted/80"
          )}
        >
          {scale.label}
        </button>
      ))}
    </div>
  )
})

export const PriceChart = memo(function PriceChart({ coinId, initialData, activeTimeScale, setActiveTimeScale, isPending }: PriceChartProps) {
  // React 19: Add concurrent features
  const [isDataPending, startDataTransition] = useTransition()
  const [crosshairPrice, setCrosshairPrice] = useState<number | null>(null)
  const [crosshairTime, setCrosshairTime] = useState<Time | null>(null)
  
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
    setCrosshairTime(time)
  }, [])

  const handleCrosshairMove = useCallback((price: number | null) => {
    setCrosshairPrice(price)
  }, [])

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
  
  // React 19: Get line chart data with OHLC data for tooltips using deferred values
  const { chartData, volumeData, ohlcData, isLoading, tokenData } = useCoinGeckoChartData(deferredCoinId, deferredTimeScale, deferredInitialData)
  const { displayPrice, calculatePercentageChange } = usePriceCalculations(chartData, tokenData, deferredInitialData, deferredTimeScale)
  
  // Use isomorphic theme hook - eliminates hydration mismatch
  const { isDarkMode } = useIsomorphicTheme()
  

  // Generate Hull Suite colors - theme-aware
  const hullColors = generatePastelColors(1)
  const baseHullColor = isDarkMode ? 'hsl(210, 40%, 75%)' : 'hsl(210, 60%, 30%)'
  const primaryHullColor = addOpacityToColor(hullColors[0] || baseHullColor, isDarkMode ? 0.4 : 0.6)
  
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

    return ohlcData.map((point) => {
      const epochSeconds = timeToEpochSeconds(point.time)
      if (epochSeconds == null || volumePoints.length === 0) return { ...point }

      const nearest = findNearestVolumeValue(epochSeconds, volumePoints)
      const volume =
        nearest && nearest.diffSeconds <= maxDiffSeconds && Number.isFinite(nearest.value) ? nearest.value : undefined

      return { ...point, volume }
    })
  }, [ohlcData, volumeData])

  // Highlight the period under the crosshair and dim the rest:
  // - 1Q + 1Y: highlight month
  // - Max: highlight quarter
  const highlightRange = useMemo(() => {
    if (crosshairTime == null) return null

    const crosshairEpochSeconds = timeToEpochSeconds(crosshairTime)
    if (crosshairEpochSeconds == null) return null

    const isQuarterly = deferredTimeScale === '2y'
    const range = isQuarterly
      ? getUtcQuarterRange(crosshairEpochSeconds)
      : getUtcMonthRange(crosshairEpochSeconds)

    const boundaryColor = isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)'

    return {
      from: range.fromEpochSeconds as Time,
      to: range.toEpochSeconds as Time,
      dimOpacity: 0.18,
      boundaryColor,
    }
  }, [crosshairTime, deferredTimeScale, isDarkMode])

  const chartContainerRef = useChartInstance(ohlcvDataForChart, {
    chartType: 'line',
    showVolume: true,
    isDarkMode,
    hullSuite: hullSuiteOverlay,
    onCrosshairMove: handleCrosshairMove,
    onCrosshairTimeMove: handleCrosshairTimeMove,
    highlightRange,
  })

  // Get coin info from CoinGecko database
  const coinName = coingeckoCoinData?.name || 'Loading...'
  const coinImage = coingeckoCoinData?.logoUrl
  
  // React 19: Show pending states and optimize price display
  const basePrice = ohlcvDataForChart[0]?.open || ohlcvDataForChart[0]?.close || null
  const scrubPriceChange =
    crosshairPrice != null && basePrice != null && Number.isFinite(basePrice) && basePrice !== 0
      ? ((crosshairPrice - basePrice) / basePrice) * 100
      : null

  const liveChange24h = liveQuote?.price_change_percentage_24h ?? calculatePercentageChange ?? 0
  const livePrice = liveQuote?.current_price ?? deferredInitialData?.price ?? displayPrice ?? 0
  const currentPrice = crosshairPrice ?? livePrice
  const priceChange24h = scrubPriceChange ?? liveChange24h

  const isLoadingPrice = quoteQuery.isLoading || isLoading
  const showPending = isPending || isDataPending || isLoadingPrice
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className={cn(
      "will-change-auto transform-gpu",
      showPending ? 'opacity-90 transition-opacity duration-200' : ''
    )}>
      {/* React 19: Enhanced Main Price Chart with hardware acceleration */}
      <div className={cn(
        "bg-white dark:bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)] will-change-auto",
        showPending && "opacity-95"
      )}>
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-20"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader className="flex flex-row items-start justify-between p-6 pl-6">
              {/* Left side - Coin info */}
              <div className="flex gap-3 justify-between items-start w-full">
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center gap-2">
                    <Image 
                      src={coinImage?.startsWith('http') || coinImage?.startsWith('/') ? coinImage : '/favicon.ico'} 
                      alt={coinName} 
                      width={20} 
                      height={20}
                      className="rounded-full w-3 h-3"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/favicon.ico';
                      }}
                    />
                    <span className="text-gray-900 dark:text-white font-bold text-xs">{coinName}</span>
                    <span className="text-muted-foreground text-xs">is currently</span>
                    </div>
                    <div className="flex items-center">
                      <NumberFlow
                        value={currentPrice}
                        format={getUsdPriceFormatOptions(currentPrice) as Format}
                        willChange
                        className={cn(
                          "text-3xl font-bold font-sans text-gray-900 dark:text-white",
                          showPending && "animate-pulse motion-reduce:animate-none",
                        )}
                      />
                      {showPending && (
                        <div className="inline-flex items-center ml-2">
                          <div className="w-2 h-2 bg-gray-400 dark:bg-white/50 rounded-full animate-pulse motion-reduce:animate-none" />
                        </div>
                      )}
                    </div>

                  <div className={`text-xs font-bold font-diatype-mono ${Number.isNaN(priceChange24h) ? 'text-muted-foreground' : priceChange24h >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {Number.isNaN(priceChange24h) ? (
                      <span>N/A</span>
                    ) : (
                      <>
                        <motion.span
                          key={priceChange24h >= 0 ? 'up' : 'down'}
                          initial={{ rotate: priceChange24h >= 0 ? 0 : 90 }}
                          animate={{ rotate: priceChange24h >= 0 ? 0 : 90 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.3, duration: 0.3 }}
                          className="inline-block mr-2"
                          style={{ transformOrigin: 'center' }}
                        >
                          <IconArrowUpRight className={`w-2 h-2 ${priceChange24h >= 0 ? 'fill-emerald-500' : 'fill-rose-500'}`} />
                        </motion.span>
                        <span>
                          {Math.abs(priceChange24h).toFixed(2)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pl-8">
              <div className={cn(
                "p-0 relative will-change-auto",
                showPending && "opacity-80 transition-opacity duration-300"
              )}>
                <div 
                  ref={chartContainerRef} 
                  className="min-h-[400px] w-full will-change-auto transform-gpu"
                  style={{ 
                    minHeight: '400px',
                    contain: 'layout style paint'
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* React 19: Enhanced Chart Controls with optimized handlers */}
      <div className={cn(
        "flex items-center justify-between mt-4",
        showPending && "opacity-80"
      )}>
        <TimeScaleSelector
          activeTimeScale={deferredTimeScale}
          setActiveTimeScale={handleTimeScaleChange}
        />
      </div>
    </div>
  )
})