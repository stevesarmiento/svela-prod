'use client'

import React, { useTransition, useDeferredValue, useCallback, useMemo, memo } from 'react'
import { useIsomorphicTheme } from '@/hooks/use-isomorphic-theme'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { motion } from 'framer-motion'
import { cn } from "@v1/ui/cn"
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { useChartInstance } from '@/hooks/use-chart-instance'
import { usePriceCalculations } from '@/hooks/use-price-calculations'
import type { CoinMarketData } from '@/types/coins'
import { useHullSuite } from '@/hooks/use-hull-suite'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { IconArrowUpRight } from 'symbols-react'
import Image from 'next/image'
import { useQuery as useTanStackQuery } from '@tanstack/react-query'

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

  const { data: coingeckoCoinData } = useTanStackQuery({
    queryKey: ["coingecko-coin", deferredCoinId],
    queryFn: async () => {
      const response = await fetch(`/api/internal/coins/coingecko/${deferredCoinId}`)
      if (!response.ok) throw new Error("Failed to load coin metadata")
      return await response.json()
    },
    enabled: !!deferredCoinId,
    staleTime: 10 * 60 * 1000,
  })
  
  // Get live price data from CoinGecko API
  const { data: livePrice, isLoading: isPriceLoading } = useTanStackQuery({
    queryKey: ['coingecko-price', deferredCoinId],
    queryFn: async () => {
      const response = await fetch(`/api/coingecko/quotes?ids=${deferredCoinId}`)
      if (!response.ok) throw new Error('Failed to fetch price')
      const data = await response.json()
      return data.data[deferredCoinId]
    },
    enabled: !!deferredCoinId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
  })
  
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

  // Convert Hull Suite data for the legacy chart instance format (stable identity).
  const legacyHullSuiteData = useMemo(() => {
    return {
      mhull: hullSuiteData.MHULL,
      shull: hullSuiteData.SHULL,
      trend: hullSuiteData.hullColor.map((item) => ({
        time: item.time,
        isUp: true, // Always use same color as requested
        color: primaryHullColor, // Use consistent pastel color with opacity
      })),
    }
  }, [hullSuiteData, primaryHullColor])

  // React 19: Memoized chart instance creation
  const chartContainerRef = useChartInstance(
    chartData, 
    volumeData, 
    undefined, // No Market Cipher indicators
    PRICE_CHART_INDICATORS, // Hull Suite indicator settings (stable object)
    legacyHullSuiteData,
    undefined, // No callback - tooltip handles dynamic updates
    'line', // Always use line chart
    ohlcvDataForHull, // Pass OHLC data for tooltips
    isDarkMode // Pass theme state for consistent theming
  )

  // Get coin info from CoinGecko database
  const coinName = coingeckoCoinData?.name || 'Loading...'
  const coinImage = coingeckoCoinData?.logoUrl
  
  // React 19: Show pending states and optimize price display
  const currentPrice = livePrice?.current_price || displayPrice || 0
  const priceChange24h = livePrice?.price_change_percentage_24h || calculatePercentageChange || 0
  const isLoadingPrice = isPriceLoading || isLoading
  const showPending = isPending || isDataPending || isLoadingPrice

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
                      <span className={cn(
                        "text-3xl font-bold font-sans text-gray-900 dark:text-white",
                        showPending && "animate-pulse"
                      )}>
                        ${currentPrice.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 8
                        })}
                      </span>
                      {showPending && (
                        <div className="inline-flex items-center ml-2">
                          <div className="w-2 h-2 bg-gray-400 dark:bg-white/50 rounded-full animate-pulse" />
                        </div>
                      )}
                    </div>

                  <div className={`text-xs font-bold font-diatype-mono ${isNaN(priceChange24h) ? 'text-muted-foreground' : priceChange24h >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isNaN(priceChange24h) ? (
                      <span>N/A</span>
                    ) : (
                      <>
                        <motion.span
                          key={priceChange24h >= 0 ? 'up' : 'down'}
                          initial={{ rotate: priceChange24h >= 0 ? 0 : 90 }}
                          animate={{ rotate: priceChange24h >= 0 ? 0 : 90 }}
                          transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
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