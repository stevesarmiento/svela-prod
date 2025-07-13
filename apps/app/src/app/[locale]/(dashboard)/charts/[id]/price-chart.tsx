'use client'

import React from 'react'
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
import { useQuery } from 'convex/react'
import { api } from '../../../../../../convex/_generated/api'
import { useQuery as useTanStackQuery } from '@tanstack/react-query'

interface PriceChartProps {
  coinId: string;
  initialData: CoinMarketData['quote']['USD'];
  activeTimeScale: string;
  setActiveTimeScale: (scale: string) => void;
}

interface IndicatorSettings {
  showWaveTrend: boolean
  showFastMoneyFlow: boolean
  showSlowMoneyFlow: boolean
  showRSI: boolean
  showStochRSI: boolean
  showHullSuite: boolean
}

const TimeScaleSelector = ({ activeTimeScale, setActiveTimeScale }: { 
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void 
}) => {
  const scales = [
    { value: "30d", label: "1Q" },   // 30 days focus with 90 days context
    { value: "max", label: "1Y" },    // 1 year of data
    { value: "2y", label: "Max" },    // Maximum data possible
  ]

  return (
    <div className="flex gap-1 bg-zinc-950/10 backdrop-blur-xl border border-zinc-800/30 rounded-[12px] p-1">
      {scales.map((scale) => (
        <button
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "px-2 py-1 text-xs rounded-lg",
            activeTimeScale === scale.value
              ? "bg-zinc-800/50 border border-zinc-800/50  shadow-md shadow-zinc-950/50 text-white"
              : "bg-transparent text-muted-foreground hover:bg-muted/80"
          )}
        >
          {scale.label}
        </button>
      ))}
    </div>
  )
}

export function PriceChart({ coinId, initialData, activeTimeScale, setActiveTimeScale }: PriceChartProps) {
  // Get CoinGecko coin data from database
  const coingeckoCoinData = useQuery(
    api.coins.getCoinGeckoCoinById,
    { coingeckoId: coinId }
  )
  
  // Get live price data from CoinGecko API
  const { data: livePrice, isLoading: isPriceLoading } = useTanStackQuery({
    queryKey: ['coingecko-price', coinId],
    queryFn: async () => {
      const response = await fetch(`/api/coingecko/quotes?ids=${coinId}`)
      if (!response.ok) throw new Error('Failed to fetch price')
      const data = await response.json()
      return data.data[coinId]
    },
    enabled: !!coinId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
  })
  
  // Get line chart data with OHLC data for tooltips
  const { chartData, volumeData, ohlcData, isLoading, tokenData } = useCoinGeckoChartData(coinId, activeTimeScale, initialData)
  const { displayPrice, calculatePercentageChange } = usePriceCalculations(chartData, tokenData, initialData, activeTimeScale)
  
  // Generate Hull Suite colors - same as hook to ensure consistency
  const hullColors = generatePastelColors(1)
  const primaryHullColor = addOpacityToColor(hullColors[0] || 'hsl(210, 40%, 75%)', 0.7)
  
  // Always use line chart - simplified approach

  const indicators: IndicatorSettings = {
    showWaveTrend: false,
    showFastMoneyFlow: false,
    showSlowMoneyFlow: false,
    showRSI: false,
    showStochRSI: false,
    showHullSuite: true,
  }

  // Hardcoded Hull Suite settings (EHMA-55)
  const hullSettings = {
    modeSwitch: 'Ehma' as const,
    length: 55,
    visualSwitch: true,
  }

  // Use OHLC data for Hull Suite (add volume=0 for compatibility)
  const ohlcvDataForHull = ohlcData.map(point => ({ ...point, volume: 0 }))
  const hullSuiteData = useHullSuite(ohlcvDataForHull || [], {
    src: 'close',
    modeSwitch: hullSettings.modeSwitch,
    length: hullSettings.length,
    lengthMult: 1.0,
    useHtf: false,
    htf: '240',
    switchColor: true,
    candleCol: false,
    visualSwitch: hullSettings.visualSwitch,
    thicknesSwitch: 1,
    transpSwitch: 40,
  })

  // Convert Hull Suite data for chart instance
  const legacyHullSuiteData = {
    mhull: hullSuiteData.MHULL,
    shull: hullSuiteData.SHULL,
    trend: hullSuiteData.hullColor.map(item => ({ 
      time: item.time, 
      isUp: true, // Always use same color as requested
      color: primaryHullColor // Use consistent pastel color with 70% opacity
    }))
  }

  // Use chart instance with tooltip (no callback needed for header updates)
  const chartContainerRef = useChartInstance(
    chartData, 
    volumeData, 
    undefined, // No Market Cipher indicators
    indicators, // Hull Suite indicator settings
    legacyHullSuiteData,
    undefined, // No callback - tooltip handles dynamic updates
    'line', // Always use line chart
    ohlcvDataForHull // Pass OHLC data for tooltips
  )

  // Get coin info from CoinGecko database
  const coinName = coingeckoCoinData?.name || 'Loading...'
  const coinImage = coingeckoCoinData?.logoUrl
  
  // Use live price data if available, otherwise fall back to display price
  const currentPrice = livePrice?.current_price || displayPrice || 0
  const priceChange24h = livePrice?.price_change_percentage_24h || calculatePercentageChange || 0
  const isLoadingPrice = isPriceLoading || isLoading

  return (
    <div>
      {/* Main Price Chart */}
      <div className="bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/30 rounded-[20px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
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
                    <span className="text-white font-bold text-xs">{coinName}</span>
                    <span className="text-muted-foreground text-xs">is currently</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-3xl font-bold font-sans">
                        ${currentPrice.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 8
                        })}
                      </span>
                      {isLoadingPrice && <div className="w-2 h-2 bg-white/50 rounded-full animate-pulse" />}
                    </div>

                  <div className={`text-xs font-bold font-mono ${isNaN(priceChange24h) ? 'text-muted-foreground' : priceChange24h >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
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
              <div className="p-0 relative">
                <div ref={chartContainerRef} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Chart Controls - Outside the chart box */}
      <div className="flex items-center justify-between mt-4">
        <TimeScaleSelector
          activeTimeScale={activeTimeScale}
          setActiveTimeScale={setActiveTimeScale}
        />
      </div>
    </div>
  )
}