'use client'

import React, { useMemo, useState, useTransition, useDeferredValue, useCallback, memo } from 'react'
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
import type { CoinMarketData } from '@/types/coins'
import { SectionHeader } from "../_components/section-header"
import { MarketVisionChart } from './marketvision-chart'
import { BollingerBandsChart } from './bollinger-bands-chart'
import { BBWPChart } from './bbwp-chart'
import { RsiDivergencesChart } from './rsi-divergences-chart'
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { useCoinGeckoQuote } from '@/hooks/use-coingecko-quotes'
import { marketVisionConfig } from '@/hooks/market-vision/market-vision-config'
import { useMarketVisionB, calculateBollingerBands, calculateBBWP } from '@/hooks/market-vision'
import { calculateRsiDivergences, type RsiDivergenceType } from '@/hooks/market-vision/rsi-divergences'
import { getAlignedPriceFromChartPoints } from '@/lib/aligned-price'
import { getTokenLogoURL } from '@/lib/logo-overrides'
import { Card, CardContent, CardHeader } from '@v1/ui/card'
import { Badge } from '@v1/ui/badge'
import { cn } from '@v1/ui/cn'
import { IndicatorExplainDialog } from './indicator-explain-dialog'
import { TokenCoingeckoNews } from './token-coingecko-news'
import { useRealtimeQuote } from "@/hooks/use-realtime-quote"

type IndicatorChipTone = 'neutral' | 'positive' | 'negative'

function toEpochSeconds(time: unknown): number | null {
  if (typeof time === "number") return Math.floor(time > 1e10 ? time / 1000 : time)
  if (typeof time === "string") {
    const parsed = Number(time)
    if (Number.isFinite(parsed)) return Math.floor(parsed > 1e10 ? parsed / 1000 : parsed)
    const ms = Date.parse(time)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
  }
  return null
}

interface OhlcvBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function bucketizeOhlcv(points: ReadonlyArray<OhlcvBar>, bucketSeconds: number): OhlcvBar[] {
  if (!points.length) return []

  const out: Array<OhlcvBar> = []
  let currentBucketStart: number | null = null
  let current: OhlcvBar | null = null

  for (const p of points) {
    if (!Number.isFinite(p.time)) continue
    const bucketStart = Math.floor(p.time / bucketSeconds) * bucketSeconds

    if (currentBucketStart === bucketStart && current) {
      current.high = Math.max(current.high, p.high)
      current.low = Math.min(current.low, p.low)
      current.close = p.close
      current.volume += p.volume
      continue
    }

    if (current) out.push(current)
    currentBucketStart = bucketStart
    current = {
      time: bucketStart,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }
  }

  if (current) out.push(current)
  return out
}

const SECONDS_PER_HOUR = 60 * 60
const SECONDS_PER_DAY = 24 * 60 * 60
const EXPLAIN_MAX_BARS = 180

function getChipClasses(tone: IndicatorChipTone): string {
  if (tone === 'positive') return 'border-emerald-500/15 bg-emerald-500/10 text-emerald-200'
  if (tone === 'negative') return 'border-rose-500/15 bg-rose-500/10 text-rose-200'
  return 'border-white/10 bg-white/5 text-muted-foreground'
}

function lastFiniteValue(points: Array<{ value: number }> | undefined): number | null {
  if (!points || points.length === 0) return null
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i]?.value
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

function labelRsi(value: number | null): { label: string; tone: IndicatorChipTone } {
  if (value == null) return { label: 'RSI —', tone: 'neutral' }
  if (value >= 70) return { label: `RSI ${value.toFixed(0)} Overbought`, tone: 'negative' }
  if (value <= 30) return { label: `RSI ${value.toFixed(0)} Oversold`, tone: 'positive' }
  return { label: `RSI ${value.toFixed(0)} Neutral`, tone: 'neutral' }
}

function labelMoneyFlow(value: number | null): { label: string; tone: IndicatorChipTone } {
  if (value == null) return { label: 'Money flow —', tone: 'neutral' }
  if (value > 0) return { label: 'Money flow Inflow', tone: 'positive' }
  if (value < 0) return { label: 'Money flow Outflow', tone: 'negative' }
  return { label: 'Money flow Neutral', tone: 'neutral' }
}

function labelBbwp(value: number | null): { label: string; tone: IndicatorChipTone } {
  if (value == null) return { label: 'BBWP —', tone: 'neutral' }
  if (value <= 20) return { label: `BBWP ${value.toFixed(0)} Compression`, tone: 'neutral' }
  if (value >= 80) return { label: `BBWP ${value.toFixed(0)} Expansion`, tone: 'negative' }
  return { label: `BBWP ${value.toFixed(0)} Normal`, tone: 'neutral' }
}

function labelRsiDivergence(type: RsiDivergenceType | null): { label: string; tone: IndicatorChipTone } {
  if (!type) return { label: 'Divergence —', tone: 'neutral' }
  if (type === 'bullish') return { label: 'Divergence Bull', tone: 'positive' }
  if (type === 'bearish') return { label: 'Divergence Bear', tone: 'negative' }
  if (type === 'h_bullish') return { label: 'Divergence H_Bull', tone: 'positive' }
  return { label: 'Divergence H_Bear', tone: 'negative' }
}


interface TokenPageClientProps {
  id: string
  tokenData: CoinMarketData
  isPending?: boolean
}

export const TokenPageClient = memo(function TokenPageClient({ id, tokenData, isPending }: TokenPageClientProps) {
  // React 19: Add concurrent features
  const [isTransitionPending, startTransition] = useTransition()
  
  // React 19: Defer expensive computations
  const deferredId = useDeferredValue(id)
  const deferredTokenData = useDeferredValue(tokenData)

  // Local state for active time scale (this is fine - it's not derived from props)
  const [activeTimeScale, setActiveTimeScale] = useState<string>("30d")
  const deferredTimeScale = useDeferredValue(activeTimeScale)
  const indicatorWindowDays = React.useMemo(() => {
    if (deferredTimeScale === '2y') return 60
    if (deferredTimeScale === 'max') return 30
    return 14
  }, [deferredTimeScale])

  // React 19: Use deferred values for data fetching
  const { chartData, volumeData, ohlcData, isLoading } = useCoinGeckoChartData(
    deferredId, 
    deferredTimeScale, 
    deferredTokenData.quote.USD
  )

  // Don’t start realtime streaming until we have at least some historical series.
  const canStartRealtimeStream = Boolean(deferredId) && !isLoading && chartData.length >= 2

  // Canonical quote source for headline + metrics (keeps price consistent everywhere).
  const quoteQuery = useCoinGeckoQuote(deferredId)
  const realtimeSymbol = quoteQuery.data?.symbol ?? deferredTokenData.symbol

  // Realtime warm start + streaming spot price (dynamic Hermes feed resolution).
  const spotStatus = useRealtimeQuote({
    coingeckoId: deferredId,
    symbol: realtimeSymbol,
    enabled: Boolean(deferredId),
    streamEnabled: canStartRealtimeStream,
  })

  const metricsData = React.useMemo(() => {
    const quote = quoteQuery.data
    if (!quote) return null

    const alignedPrice =
      getAlignedPriceFromChartPoints(chartData) ??
      quote.current_price

    return {
      current_price: alignedPrice,
      total_volume: quote.total_volume,
      market_cap: quote.market_cap,
      price_change_percentage_24h: quote.price_change_percentage_24h,
      market_cap_rank: quote.market_cap_rank,
      circulating_supply: quote.circulating_supply ?? null,
      max_supply: quote.max_supply ?? null,
      symbol: quote.symbol,
    }
  }, [quoteQuery.data, chartData])

  /** Page passes placeholder tokenData; canonical name/symbol come from CoinGecko quote once loaded. */
  const explainTokenName = quoteQuery.data?.name ?? deferredTokenData.name

  // React 19: Enhanced time scale change handler with transition
  const handleTimeScaleChange = useCallback((scale: string) => {
    startTransition(() => {
      setActiveTimeScale(scale)
    })
  }, [setActiveTimeScale])

  // React 19: Optimized indicator data with deferred values
  const indicatorData = React.useMemo(() => {
    if (ohlcData.length === 0) return []

    const volumeByEpoch = new Map<number, number>()
    for (const volumePoint of volumeData) {
      const epoch = toEpochSeconds(volumePoint.time)
      if (epoch == null) continue
      if (!Number.isFinite(volumePoint.value)) continue
      volumeByEpoch.set(epoch, volumePoint.value)
    }

    const outByEpoch = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>()

    for (const point of ohlcData) {
      const epoch = toEpochSeconds(point.time)
      if (epoch == null) continue

      outByEpoch.set(epoch, {
        time: epoch,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: volumeByEpoch.get(epoch) ?? 0,
      })
    }

    return Array.from(outByEpoch.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value)
  }, [ohlcData, volumeData])

  const dailyOhlcv = React.useMemo(() => {
    if (indicatorData.length === 0) return []
    const daily = bucketizeOhlcv(indicatorData as ReadonlyArray<OhlcvBar>, SECONDS_PER_DAY)
    return daily.map((bar) => ({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }))
  }, [indicatorData])

  const marketVisionCalculations = useMarketVisionB(indicatorData, marketVisionConfig)
  const marketVisionRsiValue = lastFiniteValue(marketVisionCalculations.series.rsi)
  const marketVisionMoneyFlowValue = lastFiniteValue(marketVisionCalculations.series.rsiMfi)
  const marketVisionWt1 = lastFiniteValue(marketVisionCalculations.series.wt1)
  const marketVisionWt2 = lastFiniteValue(marketVisionCalculations.series.wt2)
  const marketVisionBias: { label: string; tone: IndicatorChipTone } = React.useMemo(() => {
    if (marketVisionWt1 == null || marketVisionWt2 == null) return { label: 'WaveTrend —', tone: 'neutral' }
    if (marketVisionWt1 > marketVisionWt2) return { label: 'WaveTrend Bullish bias', tone: 'positive' }
    if (marketVisionWt1 < marketVisionWt2) return { label: 'WaveTrend Bearish bias', tone: 'negative' }
    return { label: 'WaveTrend Neutral', tone: 'neutral' }
  }, [marketVisionWt1, marketVisionWt2])

  const bollingerConfig = React.useMemo(() => ({
    drawRSI: true,
    drawMFI: false,
    highlightBreaches: true,
    length: 14,
    source: 'hlc3' as const,
    bbLength: 20,
    multiplier: 2.0,
    lineWidth: 2,
    fillOpacity: 0.1,
  }), [])
  const bollingerResult = React.useMemo(() => {
    if (indicatorData.length === 0) return null
    return calculateBollingerBands(indicatorData, bollingerConfig)
  }, [indicatorData, bollingerConfig])
  const bbIndicator = lastFiniteValue(bollingerResult?.indicator)
  const bbUpper = lastFiniteValue(bollingerResult?.upper)
  const bbLower = lastFiniteValue(bollingerResult?.lower)
  const bollingerPosition: { label: string; tone: IndicatorChipTone } = React.useMemo(() => {
    if (bbIndicator == null || bbUpper == null || bbLower == null) return { label: 'Band position —', tone: 'neutral' }
    if (bbIndicator > bbUpper) return { label: 'Band position Above upper', tone: 'negative' }
    if (bbIndicator < bbLower) return { label: 'Band position Below lower', tone: 'positive' }
    return { label: 'Band position Inside', tone: 'neutral' }
  }, [bbIndicator, bbUpper, bbLower])

  const bbwpConfig = React.useMemo(() => ({
    priceSource: 'close' as const,
    basisType: 'SMA' as const,
    basisLength: 7,
    lookback: 100,
    maType: 'SMA' as const,
    maLength: 5,
    extremeHigh: 98,
    extremeLow: 2,
  }), [])
  const bbwpResult = React.useMemo(() => {
    if (indicatorData.length === 0) return null
    return calculateBBWP(indicatorData, bbwpConfig)
  }, [indicatorData, bbwpConfig])
  const bbwpValue = lastFiniteValue(bbwpResult?.bbwp)

  const rsiDivergencesResult = React.useMemo(() => {
    if (indicatorData.length === 0) return null
    return calculateRsiDivergences(indicatorData)
  }, [indicatorData])
  const rsiDivergencesRsiValue = lastFiniteValue(rsiDivergencesResult?.rsiSeries)
  const rsiDivergencesLatestType: RsiDivergenceType | null =
    rsiDivergencesResult?.divergences.length
      ? (rsiDivergencesResult.divergences[rsiDivergencesResult.divergences.length - 1]?.type ?? null)
      : null

  const explainSpec = React.useMemo(() => {
    // TimeScaleSelector labels:
    // - "30d" => "1Q"
    // - "max" => "1Y"
    // - "2y"  => "Max"
    if (deferredTimeScale === "30d") return { bucketSeconds: SECONDS_PER_HOUR, targetBars: 7 * 24 }
    if (deferredTimeScale === "max") return { bucketSeconds: SECONDS_PER_DAY, targetBars: 30 }
    if (deferredTimeScale === "2y") return { bucketSeconds: SECONDS_PER_DAY, targetBars: 90 }
    return { bucketSeconds: SECONDS_PER_DAY, targetBars: 30 }
  }, [deferredTimeScale])

  const explainOhlcv = React.useMemo(() => {
    const bucketed = bucketizeOhlcv(indicatorData as ReadonlyArray<OhlcvBar>, explainSpec.bucketSeconds)
    const bars = Math.min(EXPLAIN_MAX_BARS, explainSpec.targetBars)
    return bucketed.slice(-bars)
  }, [indicatorData, explainSpec.bucketSeconds, explainSpec.targetBars])

  const indicatorExplainCloseHistory = React.useMemo(
    () => explainOhlcv.map((b) => b.close),
    [explainOhlcv],
  )
  const indicatorExplainCloseTimesUtc = React.useMemo(
    () => explainOhlcv.map((b) => b.time),
    [explainOhlcv],
  )

  // Explain-payload indicator computations — aligned to the candles we send to /api/analyze-indicator.
  const marketVisionExplainCalculations = useMarketVisionB(explainOhlcv, marketVisionConfig)
  const marketVisionExplainRsiValue = lastFiniteValue(marketVisionExplainCalculations.series.rsi)
  const marketVisionExplainMoneyFlowValue = lastFiniteValue(marketVisionExplainCalculations.series.rsiMfi)
  const marketVisionExplainWt1 = lastFiniteValue(marketVisionExplainCalculations.series.wt1)
  const marketVisionExplainWt2 = lastFiniteValue(marketVisionExplainCalculations.series.wt2)

  const bollingerExplainResult = React.useMemo(() => {
    if (explainOhlcv.length === 0) return null
    return calculateBollingerBands(explainOhlcv, bollingerConfig)
  }, [explainOhlcv, bollingerConfig])

  const bbExplainIndicator = lastFiniteValue(bollingerExplainResult?.indicator)
  const bbExplainUpper = lastFiniteValue(bollingerExplainResult?.upper)
  const bbExplainLower = lastFiniteValue(bollingerExplainResult?.lower)
  const bbExplainBasis = lastFiniteValue(bollingerExplainResult?.basis)

  const bbwpExplainResult = React.useMemo(() => {
    if (explainOhlcv.length === 0) return null
    return calculateBBWP(explainOhlcv, bbwpConfig)
  }, [explainOhlcv, bbwpConfig])
  const bbwpExplainValue = lastFiniteValue(bbwpExplainResult?.bbwp)

  const rsiDivergencesExplainResult = React.useMemo(() => {
    if (explainOhlcv.length === 0) return null
    return calculateRsiDivergences(explainOhlcv)
  }, [explainOhlcv])
  const rsiDivergencesExplainRsiValue = lastFiniteValue(rsiDivergencesExplainResult?.rsiSeries)

  const marketVisionExplainBadges = React.useMemo(() => {
    const rsiChip = labelRsi(marketVisionRsiValue)
    const mfChip = labelMoneyFlow(marketVisionMoneyFlowValue)
    return (
      <>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(rsiChip.tone))}>
          {rsiChip.label}
        </Badge>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(marketVisionBias.tone))}>
          {marketVisionBias.label}
        </Badge>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(mfChip.tone))}>
          {mfChip.label}
        </Badge>
      </>
    )
  }, [marketVisionRsiValue, marketVisionMoneyFlowValue, marketVisionBias])

  const bollingerExplainBadges = React.useMemo(() => {
    const rsiChip = labelRsi(bbIndicator)
    return (
      <>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(rsiChip.tone))}>
          {rsiChip.label}
        </Badge>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(bollingerPosition.tone))}>
          {bollingerPosition.label}
        </Badge>
      </>
    )
  }, [bbIndicator, bollingerPosition])

  const bbwpExplainBadges = React.useMemo(() => {
    const bbwpChip = labelBbwp(bbwpValue)
    return (
      <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(bbwpChip.tone))}>
        {bbwpChip.label}
      </Badge>
    )
  }, [bbwpValue])

  const rsiDivergencesExplainBadges = React.useMemo(() => {
    const rsiChip = labelRsi(rsiDivergencesRsiValue)
    const divChip = labelRsiDivergence(rsiDivergencesLatestType)
    return (
      <>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(rsiChip.tone))}>
          {rsiChip.label}
        </Badge>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(divChip.tone))}>
          {divChip.label}
        </Badge>
      </>
    )
  }, [rsiDivergencesRsiValue, rsiDivergencesLatestType])

  const EXPLAIN_DIALOG_CHART_HEIGHT = 220
  const marketVisionExplainChart = React.useMemo(
    () =>
      indicatorData.length === 0
        ? null
        : (
            <MarketVisionChart
              data={indicatorData}
              config={marketVisionConfig}
              height={EXPLAIN_DIALOG_CHART_HEIGHT}
              showTimeAxis={true}
              initialWindowDays={indicatorWindowDays}
            />
          ),
    [indicatorData, indicatorWindowDays],
  )
  const bollingerExplainChart = React.useMemo(
    () =>
      indicatorData.length === 0
        ? null
        : (
            <BollingerBandsChart
              data={indicatorData}
              config={bollingerConfig}
              height={EXPLAIN_DIALOG_CHART_HEIGHT}
              showTimeAxis={true}
              initialWindowDays={indicatorWindowDays}
            />
          ),
    [indicatorData, bollingerConfig, indicatorWindowDays],
  )
  const bbwpExplainChart = React.useMemo(
    () =>
      indicatorData.length === 0
        ? null
        : (
            <BBWPChart
              data={indicatorData}
              config={{
                ...bbwpConfig,
                colorType: "Spectrum",
                spectrumPreset: "5point",
                lineWidth: 2,
                maWidth: 2,
              }}
              height={EXPLAIN_DIALOG_CHART_HEIGHT}
              showTimeAxis={true}
              initialWindowDays={indicatorWindowDays}
            />
          ),
    [indicatorData, bbwpConfig, indicatorWindowDays],
  )

  const rsiDivergencesExplainChart = React.useMemo(
    () =>
      indicatorData.length === 0
        ? null
        : (
            <RsiDivergencesChart
              data={indicatorData}
              height={EXPLAIN_DIALOG_CHART_HEIGHT}
              showTimeAxis={true}
              initialWindowDays={indicatorWindowDays}
              showLabels={true}
            />
          ),
    [indicatorData, indicatorWindowDays],
  )

  const explainTokenLogoUrl = React.useMemo(
    () =>
      getTokenLogoURL(
        metricsData?.symbol ?? deferredTokenData.symbol,
        deferredTokenData.image,
      ),
    [metricsData?.symbol, deferredTokenData.symbol, deferredTokenData.image],
  )

  // React 19: Show pending states
  const showPending = isPending || isTransitionPending || isLoading || quoteQuery.isLoading

  return (
    <main className={cn("mx-auto py-6 relative z-10", showPending && "opacity-90 transition-opacity duration-200")}>
      <div className="grid grid-cols-1 md:grid-cols-12">
        <div className="col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 xl:col-span-8 min-w-0 sm:space-y-0">
            <PriceChart
              coinId={deferredId}
              initialData={deferredTokenData.quote.USD}
              activeTimeScale={deferredTimeScale}
              setActiveTimeScale={handleTimeScaleChange}
              isPending={showPending}
              spotStatus={spotStatus}
            />
          </div>
          <div className="lg:col-span-4 xl:col-span-4 min-w-0">
            <TokenCoingeckoNews coinId={deferredId} isPending={showPending} />
          </div>
        </div>
        <div className="col-span-12 my-12 mt-8">
          {metricsData ? (
            <MarketMetrics data={metricsData} isPending={showPending} dailyOhlcv={dailyOhlcv} />
          ) : quoteQuery.error ? (
            <div className={`h-[120px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center ${showPending ? 'opacity-60' : ''}`}>
              <div className="text-center">
                <p className="text-xs text-red-400 mb-2">Failed to load market data</p>
                <p className="text-xs text-muted-foreground">ID: {deferredId}</p>
                <p className="text-xs text-muted-foreground">Error: {quoteQuery.error?.message}</p>
              </div>
            </div>
          ) : (
            <div className={`h-[120px] bg-zinc-950/50 border border-zinc-800/30 rounded-[20px] flex items-center justify-center ${showPending ? 'opacity-60' : ''}`}>
              <div className="text-center">
                <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Loading market data...</p>
                <p className="text-xs text-muted-foreground">ID: {deferredId}</p>
              </div>
            </div>
          )}
        </div>
        <div className="col-span-12 mt-16 mb-4">
          <span className="text-2xl font-semibold text-white">Technical Indicators</span>  
        </div>  
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 col-span-12">
        <div className="col-span-12 md:col-span-6">
          <Card className={cn("border-zinc-800/70 bg-black rounded-2xl overflow-hidden", showPending && "opacity-90")}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Momentum &amp; Money Flow</div>
                <div className="text-xs text-muted-foreground text-pretty">
                  Tracks momentum shifts using WaveTrend + money flow.
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {marketVisionExplainBadges}
                </div>
              </div>
              <IndicatorExplainDialog
                coinId={deferredId}
                tokenName={explainTokenName}
                tokenSymbol={metricsData?.symbol ?? deferredTokenData.symbol}
                tokenLogoUrl={explainTokenLogoUrl}
                isPricePending={showPending}
                timeframe={deferredTimeScale}
                indicatorTitle="Momentum & Money Flow"
                indicatorChart={marketVisionExplainChart}
                indicatorContext={marketVisionExplainBadges}
                indicatorType="marketVision"
                marketContext={{
                  priceUsd: metricsData?.current_price ?? null,
                  change24hPct: metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: metricsData?.total_volume ?? null,
                  marketCapUsd: metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  rsiCurrent: marketVisionExplainRsiValue,
                  rsiHistory: marketVisionExplainCalculations.series.rsi
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                  wt1Current: marketVisionExplainWt1,
                  wt2Current: marketVisionExplainWt2,
                  moneyFlowCurrent: marketVisionExplainMoneyFlowValue,
                  moneyFlowHistory: marketVisionExplainCalculations.series.rsiMfi
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                }}
                disabled={showPending || isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {isLoading ? (
                <div className={cn("h-[250px] flex items-center justify-center", showPending && "opacity-60")}>
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Loading indicator data…</p>
                  </div>
                </div>
              ) : (
                <MarketVisionChart
                  data={indicatorData}
                  config={marketVisionConfig}
                  height={250}
                  showTimeAxis={true}
                  initialWindowDays={indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-6">
          <Card className={cn("border-zinc-800/70 bg-black rounded-2xl overflow-hidden", showPending && "opacity-90")}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Bolinger Bands</div>
                <div className="text-xs text-muted-foreground text-pretty">
                  Shows RSI relative to its own bands (overextension vs mean).
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {bollingerExplainBadges}
                </div>
              </div>
              <IndicatorExplainDialog
                coinId={deferredId}
                tokenName={explainTokenName}
                tokenSymbol={metricsData?.symbol ?? deferredTokenData.symbol}
                tokenLogoUrl={explainTokenLogoUrl}
                isPricePending={showPending}
                timeframe={deferredTimeScale}
                indicatorTitle="Bolinger Bands"
                indicatorChart={bollingerExplainChart}
                indicatorContext={bollingerExplainBadges}
                indicatorType="bollinger"
                marketContext={{
                  priceUsd: metricsData?.current_price ?? null,
                  change24hPct: metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: metricsData?.total_volume ?? null,
                  marketCapUsd: metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  indicatorCurrent: bbExplainIndicator,
                  upperCurrent: bbExplainUpper,
                  lowerCurrent: bbExplainLower,
                  basisCurrent: bbExplainBasis,
                  indicatorHistory: (bollingerExplainResult?.indicator ?? [])
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                  upperHistory: (bollingerExplainResult?.upper ?? [])
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                  lowerHistory: (bollingerExplainResult?.lower ?? [])
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                }}
                disabled={showPending || isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {isLoading ? (
                <div className={cn("h-[250px] flex items-center justify-center", showPending && "opacity-60")}>
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Loading indicator data…</p>
                  </div>
                </div>
              ) : (
                <BollingerBandsChart
                  data={indicatorData}
                  config={bollingerConfig}
                  height={250}
                  showTimeAxis={true}
                  initialWindowDays={indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12">
          <Card className={cn("border-zinc-800/70 bg-black rounded-2xl overflow-hidden", showPending && "opacity-90")}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Volatility</div>
                <div className="text-xs text-muted-foreground text-pretty">
                  Percentile rank of bandwidth (detects compression vs expansion).
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {bbwpExplainBadges}
                </div>
              </div>
              <IndicatorExplainDialog
                coinId={deferredId}
                tokenName={explainTokenName}
                tokenSymbol={metricsData?.symbol ?? deferredTokenData.symbol}
                tokenLogoUrl={explainTokenLogoUrl}
                isPricePending={showPending}
                timeframe={deferredTimeScale}
                indicatorTitle="Volatility"
                indicatorChart={bbwpExplainChart}
                indicatorContext={bbwpExplainBadges}
                indicatorType="bbwp"
                marketContext={{
                  priceUsd: metricsData?.current_price ?? null,
                  change24hPct: metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: metricsData?.total_volume ?? null,
                  marketCapUsd: metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  bbwpCurrent: bbwpExplainValue,
                  bbwpHistory: (bbwpExplainResult?.bbwp ?? [])
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                  lookback: bbwpConfig.lookback,
                }}
                disabled={showPending || isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {isLoading ? (
                <div className={cn("h-[250px] flex items-center justify-center", showPending && "opacity-60")}>
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Loading indicator data…</p>
                  </div>
                </div>
              ) : (
                <BBWPChart
                  data={indicatorData}
                  config={{
                    ...bbwpConfig,
                    colorType: 'Spectrum',
                    spectrumPreset: '5point',
                    lineWidth: 2,
                    maWidth: 2,
                  }}
                  height={250}
                  showTimeAxis={true}
                  initialWindowDays={indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </main>
  )
})