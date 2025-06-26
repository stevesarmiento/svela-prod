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

interface PriceChartProps {
  coinId: string;
  initialData: CoinMarketData['quote']['USD'];
}

const TimeScaleSelector = ({ activeTimeScale, setActiveTimeScale }: { 
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void 
}) => {
  const scales = [
    { value: "1d", label: "1H" },
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

export function PriceChart({ coinId, initialData }: PriceChartProps) {
  const [activeTimeScale, setActiveTimeScale] = useState<string>("max")
  
  const { chartData, volumeData, isLoading, tokenData } = useChartData(coinId, activeTimeScale, initialData)
  const { displayPrice, calculatePercentageChange, setActivePrice } = usePriceCalculations(chartData, tokenData, initialData)
  const chartContainerRef = useChartInstance(chartData, volumeData, setActivePrice)

  return (
    <div className="border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
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
                    value={displayPrice}
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
            <TimeScaleSelector
              activeTimeScale={activeTimeScale}
              setActiveTimeScale={setActiveTimeScale}
            />
          </CardHeader>
          <CardContent className="pl-8">
            <div className="p-0 relative">
              <div ref={chartContainerRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}