'use client'

import React from 'react'
import { Badge } from '@v1/ui/badge'
import { IconArrowUpRight, IconArrowDownRight, IconArrowRight } from 'symbols-react'
import { formatNumber, getTrendBadgeVariant, getBuySellPressure, calculateDivergence, calculateSupportResistance } from '@/lib/analysis-utils'
import { MiniPriceChart } from './mini-price-chart'
import type { Time } from 'lightweight-charts'

interface MarketData {
  quote?: {
    USD?: {
      price?: number
      market_cap?: number
      volume_24h?: number
      percent_change_24h?: number
    }
  }
}

interface ChartDataPoint {
  time: Time
  value: number
}

interface VolumeDataPoint {
  value: number
}

interface IndicatorPoint {
  value: number
}

interface BBData {
  indicator: IndicatorPoint[]
  upper: IndicatorPoint[]
  lower: IndicatorPoint[]
}

interface MarketVisionData {
  moneyFlow: {
    fast: IndicatorPoint[]
  }
  waveTrend: {
    wt1: IndicatorPoint[]
    wt2: IndicatorPoint[]
  }
}

interface OpenInterestData {
  data?: Array<{
    close: number
  }>
}

interface LiquidationData {
  data?: Array<{
    longLiquidations: number
    shortLiquidations: number
  }>
}

interface TakerBuySellData {
  data?: {
    overall?: {
      buyRatio: number
      sellRatio: number
    }
  }
}

interface MarketMetricsSidebarProps {
  coinId: string
  tokenSymbol?: string
  marketData: MarketData
  chartData: ChartDataPoint[]
  volumeData: VolumeDataPoint[]
  bbData: BBData
  marketVisionData: MarketVisionData
  openInterestData: OpenInterestData
  liquidationData: LiquidationData
  takerBuySellData: TakerBuySellData
}

export function MarketMetricsSidebar({
  coinId,
  tokenSymbol,
  marketData,
  chartData,
  volumeData,
  bbData,
  marketVisionData,
  openInterestData,
  liquidationData,
  takerBuySellData,
}: MarketMetricsSidebarProps) {
  // Get latest BB values for UI display
  const latestBBIndicator = bbData.indicator && bbData.indicator.length > 0 
    ? bbData.indicator[bbData.indicator.length - 1] 
    : null

  // Calculate volume trend
  const recentVolume = volumeData.slice(-7).reduce((a: number, b: VolumeDataPoint) => a + (b?.value || 0), 0) / 7
  const previousVolume = volumeData.slice(-14, -7).reduce((a: number, b: VolumeDataPoint) => a + (b?.value || 0), 0) / 7
  const volumeTrend = recentVolume > previousVolume * 1.2 ? 'up' : 
                     recentVolume < previousVolume * 0.8 ? 'down' : 'stable'

  // Calculate support/resistance
  const priceHistory = chartData?.map((d: ChartDataPoint) => d.value) || []
  const recentPriceData = priceHistory.slice(-21)
  const { support, resistance } = calculateSupportResistance(recentPriceData, marketData?.quote?.USD?.price || 0)

  // Calculate divergence if we have enough data
  const divergence = React.useMemo(() => {
    if (!latestBBIndicator || !chartData || chartData.length < 14) return null
    
    const rsiHistory = bbData.indicator?.map((d: IndicatorPoint) => d.value) || []
    if (rsiHistory.length < 14) return null
    
    const currentPrice = priceHistory[priceHistory.length - 1] || 0
    const previousAvg = priceHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7
    const currentRSIAvg = rsiHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7
    const previousRSIAvg = rsiHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7
    
    return calculateDivergence(currentPrice, previousAvg, currentRSIAvg, previousRSIAvg)
  }, [latestBBIndicator, chartData, bbData.indicator, priceHistory])

  return (
    <div className="lg:col-span-1 space-y-6 overflow-hidden">
      <div className="">
        {/* Mini Price Chart */}
        <div className="">
          <MiniPriceChart 
            coinId={coinId}
            tokenSymbol={tokenSymbol}
            currentPrice={marketData?.quote?.USD?.price}
          />
        </div>
        <div className="w-full h-[1px] mb-3 bg-zinc-800/50 scale-125" />

        {/* Market Metrics */}
        <div className="px-3 space-y-3">
            <div className="flex items-center gap-2">
                <h3 className="text-[10px] uppercase font-medium text-white">Market Metrics</h3>
            </div>
            
            <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Current Price</span>
            <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white">
                ${marketData?.quote?.USD?.price?.toLocaleString() || '0.00'}
                </span>
            </div>
            </div>

            <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Market Cap</span>
            <span className="font-mono text-xs text-white">
                ${formatNumber(marketData?.quote?.USD?.market_cap || 0)}
            </span>
            </div>

            <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">24h Volume</span>
            <div className="flex items-center gap-1">
                <span className="font-mono text-xs text-white">
                ${formatNumber(marketData?.quote?.USD?.volume_24h || 0)}
                </span>
                <Badge variant={getTrendBadgeVariant(
                volumeTrend === 'up' ? 'bullish' : 
                volumeTrend === 'down' ? 'bearish' : 'neutral'
                )} className="text-xs px-1">
                {volumeTrend === 'up' ? '↗' : volumeTrend === 'down' ? '↘' : '→'}
                </Badge>
            </div>
            </div>            
        </div>

        <div className="w-full h-[1px] my-3 bg-zinc-800/50 scale-125" />

        {/* Price Levels */}
        <div className="px-3 space-y-3">
            <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2">
                <h3 className="text-[10px] uppercase font-medium text-white">Price Levels</h3>
            </div>
            
            <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Support (21d)</span>
                <span className="font-mono text-xs text-green-400">
                ${support.toLocaleString()}
                </span>
            </div>
            
            <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Resistance (21d)</span>
                <span className="font-mono text-xs text-red-400">
                ${resistance.toLocaleString()}
                </span>
            </div>
            </div>
        </div>

        <div className="w-full h-[1px] my-3 bg-zinc-800/50 scale-125" />

        {/* Technical Indicators */}
        <div className="px-3 space-y-3">

        <div className="flex flex-col space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] uppercase font-medium text-white">Technical Indicators</h3>
          </div>
          
          {/* Hull Suite Trend */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Hull Suite</span>
            <div className="flex items-center gap-1">
              <Badge variant={getTrendBadgeVariant(
                (marketData?.quote?.USD?.percent_change_24h || 0) > 0 ? 'bullish' : 'bearish'
              )} className="text-xs px-1">
                {(marketData?.quote?.USD?.percent_change_24h || 0) > 0 ? 'Bullish' : 'Bearish'}
              </Badge>
              <Badge variant="secondary" className="text-xs px-1">
                {Math.abs(marketData?.quote?.USD?.percent_change_24h || 0) > 3 ? 'Strong' : 'Moderate'}
              </Badge>
            </div>
          </div>

          {/* Enhanced RSI with Bollinger Bands */}
          {latestBBIndicator && (
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">RSI (Bollinger)</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-white">
                    {latestBBIndicator.value.toFixed(1)}
                  </span>
                  <Badge variant={getTrendBadgeVariant(
                    (latestBBIndicator?.value || 50) > 70 ? 'bearish' : 
                    (latestBBIndicator?.value || 50) < 30 ? 'bullish' : 'neutral'
                  )}>
                    {(latestBBIndicator?.value || 50) > 70 ? 'Overbought' : 
                     (latestBBIndicator?.value || 50) < 30 ? 'Oversold' : 'Neutral'}
                  </Badge>
                </div>
              </div>
              
              {/* BB Bands */}
              {bbData.upper && bbData.lower && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Bands:</span>
                  <span className="font-mono text-zinc-500">
                    {bbData.lower[bbData.lower.length - 1]?.value.toFixed(1)} - {bbData.upper[bbData.upper.length - 1]?.value.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Divergence Detection */}
          {divergence && divergence !== 'none' && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Divergence</span>
              <Badge variant={getTrendBadgeVariant(divergence === 'bullish' ? 'bullish' : 'bearish')} className="text-xs px-1">
                {divergence === 'bullish' ? 'Bullish' : 'Bearish'} Signal
              </Badge>
            </div>
          )}
          
          {/* Money Flow */}
          {marketVisionData.moneyFlow.fast.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Money Flow</span>
              <div className="flex items-center gap-1">
                <Badge variant={getTrendBadgeVariant(
                  (marketVisionData.moneyFlow.fast[marketVisionData.moneyFlow.fast.length - 1]?.value || 0) > 0 
                    ? 'bullish' : 'bearish'
                )} className="text-xs px-1">
                  {(marketVisionData.moneyFlow.fast[marketVisionData.moneyFlow.fast.length - 1]?.value || 0) > 0 
                    ? 'Inflow' : 'Outflow'}
                </Badge>
                <span className="font-mono text-xs text-zinc-500">
                  {Math.abs(marketVisionData.moneyFlow.fast[marketVisionData.moneyFlow.fast.length - 1]?.value || 0).toFixed(1)}
                </span>
              </div>
            </div>
          )}

          {/* Wave Trend */}
          {marketVisionData.waveTrend.wt1.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Wave Trend</span>
              <div className="flex items-center gap-1">
                <Badge variant={getTrendBadgeVariant(
                  (marketVisionData.waveTrend.wt1[marketVisionData.waveTrend.wt1.length - 1]?.value || 0) > 
                  (marketVisionData.waveTrend.wt2[marketVisionData.waveTrend.wt2.length - 1]?.value || 0)
                    ? 'bullish' : 'bearish'
                )} className="text-xs px-1">
                  {(marketVisionData.waveTrend.wt1[marketVisionData.waveTrend.wt1.length - 1]?.value || 0) > 
                   (marketVisionData.waveTrend.wt2[marketVisionData.waveTrend.wt2.length - 1]?.value || 0)
                    ? 'Bullish' : 'Bearish'}
                </Badge>
                <span className="font-mono text-xs text-zinc-500">
                  {(marketVisionData.waveTrend.wt1[marketVisionData.waveTrend.wt1.length - 1]?.value || 0).toFixed(1)}
                </span>
              </div>
            </div>
          )}

        <div className="w-full h-[1px] my-3 bg-zinc-800/50 scale-125" />
          {/* Market Structure Section */}
          <div className="flex flex-col space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[10px] uppercase font-medium text-white">Market Structure</h3>
            </div>

            {/* Open Interest */}
            {openInterestData?.data && openInterestData.data.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Open Interest</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-white">
                    ${formatNumber(openInterestData.data[openInterestData.data.length - 1]?.close || 0)}
                  </span>
                  {openInterestData.data.length >= 2 && (
                    <Badge variant={getTrendBadgeVariant(
                      (openInterestData.data[openInterestData.data.length - 1]?.close || 0) > 
                      (openInterestData.data[openInterestData.data.length - 2]?.close || 0)
                        ? 'bullish' : 'bearish'
                    )} className="text-xs px-1">
                      {(((openInterestData.data[openInterestData.data.length - 1]?.close || 0) - 
                        (openInterestData.data[openInterestData.data.length - 2]?.close || 0)) / 
                        (openInterestData.data[openInterestData.data.length - 2]?.close || 1) * 100).toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Order Flow */}
            {takerBuySellData?.data?.overall && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Order Flow</span>
                <div className="flex items-center gap-1">
                  <Badge variant={getTrendBadgeVariant(
                    getBuySellPressure(takerBuySellData.data.overall.buyRatio || 50) === 'high' ? 'bullish' :
                    getBuySellPressure(takerBuySellData.data.overall.buyRatio || 50) === 'low' ? 'bearish' : 'neutral'
                  )} className="text-xs px-1">
                    {(takerBuySellData.data.overall.buyRatio || 50).toFixed(1)}% Buy
                  </Badge>
                  <span className="text-xs text-gray-500">/</span>
                  <Badge variant={getTrendBadgeVariant(
                    getBuySellPressure(takerBuySellData.data.overall.sellRatio || 50) === 'high' ? 'bearish' :
                    getBuySellPressure(takerBuySellData.data.overall.sellRatio || 50) === 'low' ? 'bullish' : 'neutral'
                  )} className="text-xs px-1">
                    {(takerBuySellData.data.overall.sellRatio || 50).toFixed(1)}% Sell
                  </Badge>
                </div>
              </div>
            )}

            {/* Liquidations */}
            {liquidationData?.data && liquidationData.data.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">24h Liquidations</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-white">
                    ${formatNumber((liquidationData.data[liquidationData.data.length - 1]?.longLiquidations || 0) + 
                                  (liquidationData.data[liquidationData.data.length - 1]?.shortLiquidations || 0))}
                  </span>
                  <Badge variant={getTrendBadgeVariant(
                    (liquidationData.data[liquidationData.data.length - 1]?.longLiquidations || 0) > 
                    (liquidationData.data[liquidationData.data.length - 1]?.shortLiquidations || 0)
                      ? 'bearish' : 'bullish'
                  )} className="text-xs px-1">
                    {(liquidationData.data[liquidationData.data.length - 1]?.longLiquidations || 0) > 
                     (liquidationData.data[liquidationData.data.length - 1]?.shortLiquidations || 0)
                      ? 'Long Heavy' : 'Short Heavy'}
                  </Badge>
                </div>
              </div>
            )}

            {/* Trend Summary */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Trend</span>
              <div className="flex items-center gap-1">
                {(marketData?.quote?.USD?.percent_change_24h || 0) > 2 ? (
                  <IconArrowUpRight className="w-3 h-3 fill-green-400" />
                ) : (marketData?.quote?.USD?.percent_change_24h || 0) < -2 ? (
                  <IconArrowDownRight className="w-3 h-3 fill-red-400" />
                ) : (
                  <IconArrowRight className="w-3 h-3 fill-gray-400" />
                )}
                <span className="text-xs text-gray-300">
                  {(marketData?.quote?.USD?.percent_change_24h || 0) > 2 ? 'Uptrend' :
                   (marketData?.quote?.USD?.percent_change_24h || 0) < -2 ? 'Downtrend' : 'Sideways'}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {Math.abs(marketData?.quote?.USD?.percent_change_24h || 0).toFixed(1)}%
                </span>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 