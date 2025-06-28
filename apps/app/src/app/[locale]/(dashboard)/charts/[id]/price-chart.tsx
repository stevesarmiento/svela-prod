'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import NumberFlow from '@number-flow/react'
import { motion } from 'framer-motion'
import { cn } from "@v1/ui/cn"
import { useChartData } from '@/hooks/use-chart-data'
import { useChartInstance } from '@/hooks/use-chart-instance'
import { usePriceCalculations } from '@/hooks/use-price-calculations'
import type { CoinMarketData } from '@/types/coins'
import type { Time } from 'lightweight-charts'
import { useHullSuite } from '@/hooks/use-hull-suite'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'

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
    { value: "7d", label: "1D" },
    { value: "30d", label: "1W" },
    { value: "max", label: "1Y" },
    { value: "2y", label: "2Y" },
  ]

  return (
    <div className="flex gap-1 bg-zinc-900 rounded-[12px] p-1">
      {scales.map((scale) => (
        <button
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "px-2 py-1 text-xs rounded-lg",
            activeTimeScale === scale.value
              ? "bg-zinc-800/50 border border-zinc-800/50 text-white"
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
  const { chartData, volumeData, isLoading, tokenData } = useChartData(coinId, activeTimeScale, initialData)
  const { displayPrice, calculatePercentageChange } = usePriceCalculations(chartData, tokenData, initialData)
  
  // Generate Hull Suite colors - same as hook to ensure consistency
  const hullColors = generatePastelColors(1)
  const primaryHullColor = addOpacityToColor(hullColors[0] || 'hsl(210, 40%, 75%)', 0.7)
  
  // State for chart scrub price display
  const [crosshairPrice, setCrosshairPrice] = useState<number | null>(null)
  
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

  // Convert price/volume data to OHLCV format for Hull Suite
  const ohlcvData = React.useMemo(() => {
    if (!chartData.length) return []

    return chartData.map((point: { time: Time; value: number }, index: number) => {
      const price = point.value
      const volume = volumeData[index]?.value || 0
      
      return {
        time: point.time,
        open: price,
        high: price * 1.002, // Small spread for OHLC simulation
        low: price * 0.998,
        close: price,
        volume
      }
    })
  }, [chartData, volumeData])

  // Calculate Hull Suite
  const hullSuiteData = useHullSuite(ohlcvData, {
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

  // Use chart instance with Hull Suite data and crosshair callback
  const chartContainerRef = useChartInstance(
    chartData, 
    volumeData, 
    undefined, // No Market Cipher indicators
    indicators, // Hull Suite indicator settings
    legacyHullSuiteData,
    setCrosshairPrice // Callback for chart scrub price updates
  )



  return (
    <div>
      {/* Main Price Chart */}
      <div className="bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader className="flex flex-row items-start justify-between p-6 pt-4 pr-5">
              <CardTitle className="flex flex-col items-left">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-mono">
                    <NumberFlow
                      value={crosshairPrice || displayPrice}
                      format={{
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }}
                      transformTiming={{ duration: 400, easing: 'ease-out' }}
                      continuous={true}
                    />
                  </span>
                  {isLoading && <div className="w-2 h-2 bg-white/50 rounded-full animate-pulse" />}
                </div>
                <div className={`text-sm ${calculatePercentageChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  <motion.span
                    initial={{ rotate: calculatePercentageChange >= 0 ? 0 : 180 }}
                    animate={{ rotate: calculatePercentageChange >= 0 ? 0 : 180 }}
                    transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
                    className="inline-block mr-2"
                    style={{ transformOrigin: 'center' }}
                  >
                    ▲
                  </motion.span>
                  <NumberFlow
                    value={Math.abs(calculatePercentageChange)}
                    format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                    suffix="%"
                    transformTiming={{ duration: 400, easing: 'ease-out' }}
                    continuous={true}
                  />
                </div>
              </CardTitle>
              <div className="flex items-center gap-2">
                <TimeScaleSelector
                  activeTimeScale={activeTimeScale}
                  setActiveTimeScale={setActiveTimeScale}
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
    </div>
  )
}