'use client'

import React from 'react'
import { Badge } from '@v1/ui/badge'
import { 
  IconDollarsign,
  IconDollarsignBankBuilding,
  IconChartBarXaxis,
  IconTengesign,
  IconShadow,
  IconWaveformPathEcgRectangle,
  IconFibrechannel,
  IconTrapezoidAndLineHorizontal,
  IconGaugeWithDotsNeedle67percent,
  IconCharacterDuployan,
  IconGlobe,
  IconCalendarDayTimelineRight,
  IconDropHalffull,
  IconChartLineDowntrendXyaxis,
  IconChartLineUptrendXyaxis,
  IconChartLineFlattrendXyaxis
} from 'symbols-react'
import { formatNumber, getTrendBadgeVariant, getBuySellPressure, calculateDivergence, calculateSupportResistance } from '@/lib/analysis-utils'
import { formatUsdPrice } from "@/lib/format-usd"
import { MiniPriceChart } from './mini-price-chart'
import { TickMeter } from '@/components/tick-meter'
import type { Time } from 'lightweight-charts'
import { getAlignedPriceFromChartPoints } from '@/lib/aligned-price'
import type { MarketVisionBResult } from '@/hooks/market-vision'

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
  marketVisionData: MarketVisionBResult
  openInterestData: OpenInterestData
  liquidationData: LiquidationData
  takerBuySellData: TakerBuySellData
}

// Reusable Components
interface MetricRowProps {
  icon?: React.ReactNode
  label: string
  value: string | React.ReactNode
  badge?: React.ReactNode
  /** Optional tick meter rendered before the value (decorative reinforcement). */
  meter?: React.ReactNode
  className?: string
}

function MetricRow({ icon = <IconChartBarXaxis className="w-3 h-3 fill-zinc-100" />, label, value, badge, meter, className = "" }: MetricRowProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-1">
        <div className="flex items-center justify-center p-1 rounded-md bg-zinc-800/40 gap-2">
          {icon}
        </div>
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {meter}
        {typeof value === 'string' ? (
          <span className="font-berkeley-mono text-xs text-white">{value}</span>
        ) : value}
        {badge}
      </div>
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="px-3 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] uppercase font-medium text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Divider() {
  return <div className="w-full h-[1px] my-3 bg-zinc-800/50 scale-125" />
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
  
  // Data calculations
  const calculations = React.useMemo(() => {
    // Volume trend calculation
    const recentVolume = volumeData.slice(-7).reduce((a, b) => a + (b?.value || 0), 0) / 7
    const previousVolume = volumeData.slice(-14, -7).reduce((a, b) => a + (b?.value || 0), 0) / 7
    const volumeTrend = recentVolume > previousVolume * 1.2 ? 'up' : 
                       recentVolume < previousVolume * 0.8 ? 'down' : 'stable'
    
    const alignedSpotPrice =
      getAlignedPriceFromChartPoints(chartData) ??
      marketData?.quote?.USD?.price ??
      0

    // Support/resistance calculation
    const priceHistory = chartData?.map(d => d.value) || []
    const recentPriceData = priceHistory.slice(-21)
    const { support, resistance } = calculateSupportResistance(recentPriceData, alignedSpotPrice)
    
    // Latest indicators
    const latestBBIndicator = bbData.indicator?.length > 0 ? bbData.indicator[bbData.indicator.length - 1] : null
    const latestBBUpper = bbData.upper?.length > 0 ? bbData.upper[bbData.upper.length - 1] : null
    const latestBBLower = bbData.lower?.length > 0 ? bbData.lower[bbData.lower.length - 1] : null
    
    // Money flow and wave trend
    const latestMoneyFlow = marketVisionData.series.rsiMfi?.length > 0 ? 
      marketVisionData.series.rsiMfi[marketVisionData.series.rsiMfi.length - 1] : null
    const latestWT1 = marketVisionData.series.wt1?.length > 0 ? 
      marketVisionData.series.wt1[marketVisionData.series.wt1.length - 1] : null
    const latestWT2 = marketVisionData.series.wt2?.length > 0 ? 
      marketVisionData.series.wt2[marketVisionData.series.wt2.length - 1] : null
    
    // Open Interest trend
    const latestOI = openInterestData?.data && openInterestData.data.length > 0 ? 
      openInterestData.data[openInterestData.data.length - 1] : null
    const previousOI = openInterestData?.data && openInterestData.data.length >= 2 ? 
      openInterestData.data[openInterestData.data.length - 2] : null
    
    // Liquidations
    const latestLiquidations = liquidationData?.data && liquidationData.data.length > 0 ? 
      liquidationData.data[liquidationData.data.length - 1] : null
    
    return {
      volumeTrend,
      support,
      resistance,
      latestBBIndicator,
      latestBBUpper,
      latestBBLower,
      latestMoneyFlow,
      latestWT1,
      latestWT2,
      latestOI,
      previousOI,
      latestLiquidations,
      priceHistory,
      alignedSpotPrice,
    }
  }, [marketData, chartData, volumeData, bbData, marketVisionData, openInterestData, liquidationData])

  // Divergence calculation (separate to avoid nested useMemo)
  const divergence = React.useMemo(() => {
    if (!calculations.latestBBIndicator || !chartData || chartData.length < 14) return null
    
    const rsiHistory = bbData.indicator?.map(d => d.value) || []
    if (rsiHistory.length < 14) return null
    
    const currentPrice = calculations.priceHistory[calculations.priceHistory.length - 1] || 0
    const previousAvg = calculations.priceHistory.slice(-14, -7).reduce((a, b) => a + b, 0) / 7
    const currentRSIAvg = rsiHistory.slice(-7).reduce((a, b) => a + b, 0) / 7
    const previousRSIAvg = rsiHistory.slice(-14, -7).reduce((a, b) => a + b, 0) / 7
    
    return calculateDivergence(currentPrice, previousAvg, currentRSIAvg, previousRSIAvg)
  }, [calculations.latestBBIndicator, chartData, bbData.indicator, calculations.priceHistory])

  // Helper functions for common badge patterns
  const getVolumeTrendBadge = (trend: string) => (
    <Badge variant={getTrendBadgeVariant(
      trend === 'up' ? 'bullish' : trend === 'down' ? 'bearish' : 'neutral'
    )} className="text-xs px-1">
      {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}
    </Badge>
  )

  const getTrendIcon = (change: number) => {
    if (change > 2) return <IconChartLineUptrendXyaxis className="w-3 h-3 fill-green-400" />
    if (change < -2) return <IconChartLineDowntrendXyaxis className="w-3 h-3 fill-red-400" />
    return <IconChartLineFlattrendXyaxis className="w-3 h-3 fill-zinc-100" />
  }

  const getTrendLabel = (change: number) => {
    if (change > 2) return 'Uptrend'
    if (change < -2) return 'Downtrend'
    return 'Sideways'
  }

  return (
    <div className="lg:col-span-1 space-y-6 overflow-hidden">
      <div className="">
        {/* Mini Price Chart */}
        <MiniPriceChart 
          coinId={coinId}
          tokenSymbol={tokenSymbol}
          currentPrice={calculations.alignedSpotPrice}
        />
        
        <div className="w-full h-[1px] mb-3 bg-zinc-800/50 scale-125" />

        {/* Market Metrics */}
        <Section title="Market Metrics">
          <MetricRow
            icon={<IconDollarsign className="w-3 h-3 fill-zinc-100" />}
            label="Current Price"
            value={formatUsdPrice(calculations.alignedSpotPrice ?? 0)}
          />
          
          <MetricRow
            icon={<IconDollarsignBankBuilding className="w-3 h-3 fill-zinc-100" />}
            label="Market Cap"
            value={`$${formatNumber(marketData?.quote?.USD?.market_cap || 0)}`}
          />
          
          <MetricRow
            icon={<IconChartBarXaxis className="w-3 h-3 fill-zinc-100" />}
            label="24h Volume"
            value={`$${formatNumber(marketData?.quote?.USD?.volume_24h || 0)}`}
            badge={getVolumeTrendBadge(calculations.volumeTrend)}
          />
        </Section>

        <Divider />

        {/* Price Levels */}
        <Section title="Price Levels">
          <MetricRow
            icon={<IconTengesign className="w-3 h-3 fill-red-500" />}
            label="Resistance (21d)"
            value={<span className="font-berkeley-mono text-xs text-red-400">{formatUsdPrice(calculations.resistance)}</span>}
          />
          <MetricRow
            icon={<IconTengesign className="w-3 h-3 fill-green-500 rotate-180" />}
            label="Support (21d)"
            value={<span className="font-berkeley-mono text-xs text-green-400">{formatUsdPrice(calculations.support)}</span>}
          />
        </Section>

        <Divider />

        {/* Technical Indicators */}
        <Section title="Technical Indicators">
          {/* Hull Suite Trend */}
          <MetricRow
            icon={<IconShadow className="w-3 h-3 fill-zinc-100" />}
            label="Hull Suite"
            value=""
            badge={
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
            }
          />

          {/* Enhanced RSI with Bollinger Bands */}
          {calculations.latestBBIndicator && (
            <>
              <MetricRow
                icon={<IconWaveformPathEcgRectangle className="w-3 h-3 fill-zinc-100" />}
                label="Relative Strength"
                value={calculations.latestBBIndicator.value.toFixed(1)}
                meter={
                  <TickMeter
                    value={calculations.latestBBIndicator.value}
                    min={0}
                    max={100}
                    className={
                      calculations.latestBBIndicator.value > 70
                        ? "text-red-400"
                        : calculations.latestBBIndicator.value < 30
                          ? "text-green-400"
                          : "text-zinc-400"
                    }
                  />
                }
                badge={
                  <Badge variant={getTrendBadgeVariant(
                    calculations.latestBBIndicator.value > 70 ? 'bearish' : 
                    calculations.latestBBIndicator.value < 30 ? 'bullish' : 'neutral'
                  )}>
                    {calculations.latestBBIndicator.value > 70 ? 'Overbought' : 
                     calculations.latestBBIndicator.value < 30 ? 'Oversold' : 'Neutral'}
                  </Badge>
                }
              />
              
              {calculations.latestBBUpper && calculations.latestBBLower && (
                <MetricRow
                  icon={<IconFibrechannel className="w-3 h-3 fill-zinc-100" />}
                  label="Bands"
                  value={<span className="font-berkeley-mono text-white">
                    {calculations.latestBBLower.value.toFixed(1)} - {calculations.latestBBUpper.value.toFixed(1)}
                  </span>}
                  className="text-xs"
                />
              )}
            </>
          )}

          {/* Divergence Detection */}
          {divergence && divergence !== 'none' && (
            <MetricRow
              icon={<IconTrapezoidAndLineHorizontal className="w-3 h-3 fill-zinc-100" />}
              label="Divergence"
              value=""
              badge={
                <Badge variant={getTrendBadgeVariant(divergence === 'bullish' ? 'bullish' : 'bearish')} className="text-xs px-1">
                  {divergence === 'bullish' ? 'Bullish' : 'Bearish'} Signal
                </Badge>
              }
            />
          )}
          
          {/* Money Flow */}
          {calculations.latestMoneyFlow && (
            <MetricRow
              icon={<IconGaugeWithDotsNeedle67percent className="w-3 h-3 fill-zinc-100" />}
              label="Money Flow"
              value={Math.abs(calculations.latestMoneyFlow.value).toFixed(1)}
              meter={
                <TickMeter
                  value={calculations.latestMoneyFlow.value}
                  min={-Math.max(15, Math.abs(calculations.latestMoneyFlow.value) * 1.25)}
                  max={Math.max(15, Math.abs(calculations.latestMoneyFlow.value) * 1.25)}
                  origin={0}
                  className={
                    calculations.latestMoneyFlow.value > 0
                      ? "text-green-400"
                      : "text-red-400"
                  }
                />
              }
              badge={
                <Badge variant={getTrendBadgeVariant(
                  calculations.latestMoneyFlow.value > 0 ? 'bullish' : 'bearish'
                )} className="text-xs px-1">
                  {calculations.latestMoneyFlow.value > 0 ? 'Inflow' : 'Outflow'}
                </Badge>
              }
            />
          )}

          {/* Wave Trend */}
          {calculations.latestWT1 && calculations.latestWT2 && (
            <MetricRow
              icon={<IconCharacterDuployan className="w-3 h-3 fill-zinc-100" />}
              label="Wave Trend"
              value={calculations.latestWT1.value.toFixed(1)}
              meter={
                <TickMeter
                  value={calculations.latestWT1.value}
                  min={-Math.max(60, Math.abs(calculations.latestWT1.value) * 1.1)}
                  max={Math.max(60, Math.abs(calculations.latestWT1.value) * 1.1)}
                  origin={0}
                  className={
                    calculations.latestWT1.value > calculations.latestWT2.value
                      ? "text-green-400"
                      : "text-red-400"
                  }
                />
              }
              badge={
                <Badge variant={getTrendBadgeVariant(
                  calculations.latestWT1.value > calculations.latestWT2.value ? 'bullish' : 'bearish'
                )} className="text-xs px-1">
                  {calculations.latestWT1.value > calculations.latestWT2.value ? 'Bullish' : 'Bearish'}
                </Badge>
              }
            />
          )}
        </Section>

        <Divider />

        {/* Market Structure */}
        <Section title="Market Structure">
          {/* Open Interest */}
          {calculations.latestOI && (
            <MetricRow
              icon={<IconGlobe className="w-3 h-3 fill-zinc-100" />}
              label="Open Interest"
              value={`$${formatNumber(calculations.latestOI.close)}`}
              badge={calculations.previousOI && (
                <Badge variant={getTrendBadgeVariant(
                  calculations.latestOI.close > calculations.previousOI.close ? 'bullish' : 'bearish'
                )} className="text-xs px-1">
                  {(((calculations.latestOI.close - calculations.previousOI.close) / calculations.previousOI.close) * 100).toFixed(1)}%
                </Badge>
              )}
            />
          )}

          {/* Order Flow */}
          {takerBuySellData?.data?.overall && (
            <MetricRow
              icon={<IconCalendarDayTimelineRight className="w-3 h-3 fill-zinc-100" />}
              label="Order Flow"
              value=""
              meter={
                <TickMeter
                  value={takerBuySellData.data.overall.buyRatio || 50}
                  min={0}
                  max={100}
                  origin={50}
                  className={
                    (takerBuySellData.data.overall.buyRatio || 50) >= 50
                      ? "text-green-400"
                      : "text-red-400"
                  }
                />
              }
              badge={
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
              }
            />
          )}

          {/* Liquidations */}
          {calculations.latestLiquidations && (
            <MetricRow
              icon={<IconDropHalffull className="w-3 h-3 fill-zinc-100" />}
              label="24h Liquidations"
              value={`$${formatNumber(calculations.latestLiquidations.longLiquidations + calculations.latestLiquidations.shortLiquidations)}`}
              badge={
                <Badge variant={getTrendBadgeVariant(
                  calculations.latestLiquidations.longLiquidations > calculations.latestLiquidations.shortLiquidations ? 'bearish' : 'bullish'
                )} className="text-xs px-1">
                  {calculations.latestLiquidations.longLiquidations > calculations.latestLiquidations.shortLiquidations ? 'Long Heavy' : 'Short Heavy'}
                </Badge>
              }
            />
          )}

          {/* Trend Summary */}
          <MetricRow
            icon={getTrendIcon(marketData?.quote?.USD?.percent_change_24h || 0)}
            label="Trend"
            value={
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-300">
                  {getTrendLabel(marketData?.quote?.USD?.percent_change_24h || 0)}
                </span>
                <span className="font-berkeley-mono text-xs text-zinc-500">
                  {Math.abs(marketData?.quote?.USD?.percent_change_24h || 0).toFixed(1)}%
                </span>
              </div>
            }
          />
        </Section>
      </div>
    </div>
  )
} 