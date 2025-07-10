'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { motion } from 'framer-motion'
import { cn } from "@v1/ui/cn"
import { useOptimizedChartData } from '@/hooks/use-optimized-chart-data'
import { useChartInstance } from '@/hooks/use-chart-instance'
import { usePriceCalculations } from '@/hooks/use-price-calculations'
import type { CoinMarketData } from '@/types/coins'
import { useHullSuite } from '@/hooks/use-hull-suite'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { IconDistributeHorizontalCenter, IconChartLineUptrendXyaxis, IconArrowUpRight } from 'symbols-react'
import Image from 'next/image'

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

type ChartType = 'line' | 'candlestick'

const TimeScaleSelector = ({ activeTimeScale, setActiveTimeScale }: { 
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void 
}) => {
  const scales = [
    { value: "7d", label: "1D" },
    { value: "30d", label: "1W" },
    { value: "max", label: "1Y" },
    { value: "2y", label: "2Y" },
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

const ChartTypeSelector = ({ chartType, setChartType }: { 
  chartType: ChartType
  setChartType: (type: ChartType) => void 
}) => {
  const types = [
    { 
      value: "candlestick" as const, 
      label: "Candles", 
      icon: IconDistributeHorizontalCenter 
    },
    { 
      value: "line" as const, 
      label: "Line", 
      icon: IconChartLineUptrendXyaxis 
    },
  ]

  return (
    <div className="flex gap-1 bg-zinc-900/10 border border-zinc-800/30 rounded-[12px] p-1">
      {types.map((type) => {
        const IconComponent = type.icon
        return (
          <button
            key={type.value}
            onClick={() => setChartType(type.value)}
            className={cn(
              "px-3 py-1 text-xs rounded-lg flex items-center gap-1.5",
              chartType === type.value
                ? "bg-zinc-800/50 border border-zinc-800/50 text-white shadow-md shadow-zinc-950/50"
                : "bg-transparent text-muted-foreground hover:bg-muted/80"
            )}
          >
            <IconComponent size={14} className="w-3 h-3 fill-white/50" />
            {type.label}
          </button>
        )
      })}
    </div>
  )
}

export function PriceChart({ coinId, initialData, activeTimeScale, setActiveTimeScale }: PriceChartProps) {
  // Now we get proper OHLCV data from the optimized hook with intelligent caching
  const { chartData, volumeData, ohlcvData, isLoading, tokenData } = useOptimizedChartData(coinId, activeTimeScale, initialData)
  const { displayPrice, calculatePercentageChange } = usePriceCalculations(chartData, tokenData, initialData)
  
  // Generate Hull Suite colors - same as hook to ensure consistency
  const hullColors = generatePastelColors(1)
  const primaryHullColor = addOpacityToColor(hullColors[0] || 'hsl(210, 40%, 75%)', 0.7)
  
  // State for chart type only - crosshair updates handled by tooltip
  const [chartType, setChartType] = useState<ChartType>('line')

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

  // Use proper OHLCV data for Hull Suite (no need to create fake data anymore)
  const hullSuiteData = useHullSuite(ohlcvData || [], {
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
    chartType, // Chart type (line or candlestick)
    ohlcvData // Real OHLCV data for candlestick chart
  )

  // Get coin info from tokenData or use fallbacks
  const coinName = tokenData?.fullData?.name || '...'

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
                      src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coinId}.png`} 
                      alt={coinName} 
                      width={20} 
                      height={20}
                      className="rounded-full w-3 h-3"
                    />
                    <span className="text-white font-bold text-xs">{coinName}</span>
                    <span className="text-muted-foreground text-xs">is currently</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-3xl font-bold font-sans">
                      ${displayPrice.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                    {isLoading && <div className="w-2 h-2 bg-white/50 rounded-full animate-pulse" />}
                  </div>
                  <div className={`text-xs font-bold font-mono ${calculatePercentageChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    <motion.span
                      key={calculatePercentageChange >= 0 ? 'up' : 'down'}
                      initial={{ rotate: calculatePercentageChange >= 0 ? 0 : 90 }}
                      animate={{ rotate: calculatePercentageChange >= 0 ? 0 : 90 }}
                      transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
                      className="inline-block mr-2"
                      style={{ transformOrigin: 'center' }}
                    >
                      <IconArrowUpRight className={`w-2 h-2 ${calculatePercentageChange >= 0 ? 'fill-emerald-500' : 'fill-rose-500'}`} />
                    </motion.span>
                    <span>
                      {Math.abs(calculatePercentageChange).toFixed(2)}%
                    </span>
                  </div>
                </div>
                <ChartTypeSelector
                  chartType={chartType}
                  setChartType={setChartType}
                />
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