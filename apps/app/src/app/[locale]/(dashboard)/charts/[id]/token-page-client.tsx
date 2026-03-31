'use client'

import React, { useState, useTransition, useDeferredValue, useCallback, memo } from 'react'
import { PriceChart } from "./price-chart"
import { MarketMetrics } from "./market-metrics"
import type { CoinMarketData } from '@/types/coins'
import { SectionHeader } from "../_components/section-header"
import { MarketVisionChart } from './marketvision-chart'
import { BollingerBandsChart } from './bollinger-bands-chart'
import { BBWPChart } from './bbwp-chart'
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { useCoinGeckoQuote } from '@/hooks/use-coingecko-quotes'
import { marketVisionConfig } from '@/hooks/market-vision/market-vision-config'
import { useMarketVisionB, calculateBollingerBands, calculateBBWP } from '@/hooks/market-vision'
import { useScrollThreshold } from '@/hooks/use-scroll-effect'
import { getAlignedPriceFromChartPoints } from '@/lib/aligned-price'
import { getTokenLogoURL } from '@/lib/logo-overrides'
import { Card, CardContent, CardHeader } from '@v1/ui/card'
import { Badge } from '@v1/ui/badge'
import { cn } from '@v1/ui/cn'
import { IndicatorExplainDialog } from './indicator-explain-dialog'

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

  // Use optimized scroll hook - eliminates useState/useEffect pattern
  const isSticky = useScrollThreshold(100)
  
  // Local state for active time scale (this is fine - it's not derived from props)
  const [activeTimeScale, setActiveTimeScale] = useState<string>("30d")
  const deferredTimeScale = useDeferredValue(activeTimeScale)
  const indicatorWindowDays = React.useMemo(() => {
    if (deferredTimeScale === '2y') return 60
    if (deferredTimeScale === 'max') return 30
    return 3
  }, [deferredTimeScale])

  // React 19: Use deferred values for data fetching
  const { chartData, volumeData, ohlcData, isLoading } = useCoinGeckoChartData(
    deferredId, 
    deferredTimeScale, 
    deferredTokenData.quote.USD
  )

  // Canonical quote source for headline + metrics (keeps price consistent everywhere).
  const quoteQuery = useCoinGeckoQuote(deferredId)

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

  const marketVisionCalculations = useMarketVisionB(indicatorData, marketVisionConfig)
  const marketVisionRsiValue = lastFiniteValue(marketVisionCalculations.oscillator1)
  const marketVisionMoneyFlowValue = lastFiniteValue(marketVisionCalculations.moneyFlow.fast)
  const marketVisionWt1 = lastFiniteValue(marketVisionCalculations.waveTrend.wt1)
  const marketVisionWt2 = lastFiniteValue(marketVisionCalculations.waveTrend.wt2)
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

  const INDICATOR_EXPLAIN_BARS = 60
  const indicatorExplainTail = React.useMemo(
    () => indicatorData.slice(-INDICATOR_EXPLAIN_BARS),
    [indicatorData],
  )
  const indicatorExplainCloseHistory = React.useMemo(
    () => indicatorExplainTail.map((b) => b.close),
    [indicatorExplainTail],
  )
  const indicatorExplainCloseTimesUtc = React.useMemo(
    () => indicatorExplainTail.map((b) => b.time),
    [indicatorExplainTail],
  )

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
    <main className={cn("mx-auto py-6 px-4 relative z-10", showPending && "opacity-90 transition-opacity duration-200")}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="col-span-12 sm:space-y-0 sticky top-0 z-[100] will-change-transform">
          <div className={`${isSticky ? 'pt-4' : 'pt-0'}`}>
            <PriceChart 
              coinId={deferredId}
              initialData={deferredTokenData.quote.USD}
              activeTimeScale={deferredTimeScale}
              setActiveTimeScale={handleTimeScaleChange}
              isPending={showPending}
            />              
          </div>
        </div>
        <div className="col-span-12">
          {metricsData ? (
            <MarketMetrics data={metricsData} isPending={showPending} />
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

        <SectionHeader title="Indicators" className="col-span-12 mt-16" />
        
          
        <div className="col-span-12 md:col-span-6">
          <Card className={cn("border-zinc-800/30 bg-zinc-950/50 overflow-hidden", showPending && "opacity-90")}>
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
                  rsiCurrent: marketVisionRsiValue,
                  rsiHistory: marketVisionCalculations.oscillator1
                    .slice(-INDICATOR_EXPLAIN_BARS)
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                  wt1Current: marketVisionWt1,
                  wt2Current: marketVisionWt2,
                  moneyFlowCurrent: marketVisionMoneyFlowValue,
                  moneyFlowHistory: marketVisionCalculations.moneyFlow.fast
                    .slice(-INDICATOR_EXPLAIN_BARS)
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
                  showTimeAxis={false}
                  initialWindowDays={indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-6">
          <Card className={cn("border-zinc-800/30 bg-zinc-950/50 overflow-hidden", showPending && "opacity-90")}>
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
                  indicatorCurrent: bbIndicator,
                  upperCurrent: bbUpper,
                  lowerCurrent: bbLower,
                  basisCurrent: lastFiniteValue(bollingerResult?.basis),
                  indicatorHistory: (bollingerResult?.indicator ?? [])
                    .slice(-INDICATOR_EXPLAIN_BARS)
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                  upperHistory: (bollingerResult?.upper ?? [])
                    .slice(-INDICATOR_EXPLAIN_BARS)
                    .map((p) => (typeof p.value === "number" && Number.isFinite(p.value) ? p.value : null)),
                  lowerHistory: (bollingerResult?.lower ?? [])
                    .slice(-INDICATOR_EXPLAIN_BARS)
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
                  showTimeAxis={false}
                  initialWindowDays={indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12">
          <Card className={cn("border-zinc-800/30 bg-zinc-950/50 overflow-hidden", showPending && "opacity-90")}>
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
                  bbwpCurrent: bbwpValue,
                  bbwpHistory: (bbwpResult?.bbwp ?? [])
                    .slice(-INDICATOR_EXPLAIN_BARS)
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
                  showTimeAxis={false}
                  initialWindowDays={indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
})