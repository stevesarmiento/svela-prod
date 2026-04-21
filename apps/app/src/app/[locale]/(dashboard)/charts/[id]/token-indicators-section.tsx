'use client'

import React, { useMemo } from 'react'
import { Badge } from '@v1/ui/badge'
import { Card, CardContent, CardHeader } from '@v1/ui/card'
import { cn } from '@v1/ui/cn'
import { IndicatorExplainDialog } from './indicator-explain-dialog'
import { MarketVisionChart } from './marketvision-chart'
import { BollingerBandsChart } from './bollinger-bands-chart'
import { BBWPChart } from './bbwp-chart'
import { RsiDivergencesChart } from './rsi-divergences-chart'
import { marketVisionConfig } from '@/hooks/market-vision/market-vision-config'
import { useMarketVisionB, calculateBollingerBands, calculateBBWP } from '@/hooks/market-vision'
import {
  calculateRsiDivergences,
  type RsiDivergenceType,
} from '@/hooks/market-vision/rsi-divergences'
import { getTokenLogoURL } from '@/lib/logo-overrides'

type IndicatorChipTone = 'neutral' | 'positive' | 'negative'

export interface IndicatorOhlcvBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface TokenIndicatorsSectionProps {
  coinId: string
  tokenName: string
  tokenSymbol: string
  tokenImage?: string
  timeframe: string
  indicatorData: IndicatorOhlcvBar[]
  indicatorWindowDays: number
  showPending: boolean
  isLoading: boolean
  metricsData: {
    current_price: number | null
    total_volume: number | null
    market_cap: number | null
    price_change_percentage_24h: number | null
    symbol: string
  } | null
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

  for (const point of points) {
    if (!Number.isFinite(point.time)) continue
    const bucketStart = Math.floor(point.time / bucketSeconds) * bucketSeconds

    if (currentBucketStart === bucketStart && current) {
      current.high = Math.max(current.high, point.high)
      current.low = Math.min(current.low, point.low)
      current.close = point.close
      current.volume += point.volume
      continue
    }

    if (current) out.push(current)
    currentBucketStart = bucketStart
    current = {
      time: bucketStart,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    }
  }

  if (current) out.push(current)
  return out
}

const SECONDS_PER_HOUR = 60 * 60
const SECONDS_PER_DAY = 24 * 60 * 60
const EXPLAIN_MAX_BARS = 180
const EXPLAIN_DIALOG_CHART_HEIGHT = 220

function getChipClasses(tone: IndicatorChipTone): string {
  if (tone === 'positive') return 'border-emerald-500/15 bg-emerald-500/10 text-emerald-200'
  if (tone === 'negative') return 'border-rose-500/15 bg-rose-500/10 text-rose-200'
  return 'border-white/10 bg-white/5 text-muted-foreground'
}

function lastFiniteValue(points: Array<{ value: number }> | undefined): number | null {
  if (!points || points.length === 0) return null
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value
    if (typeof value === 'number' && Number.isFinite(value)) return value
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

function labelRsiDivergence(
  type: RsiDivergenceType | null,
): { label: string; tone: IndicatorChipTone } {
  if (!type) return { label: 'Divergence —', tone: 'neutral' }
  if (type === 'bullish') return { label: 'Divergence Bull', tone: 'positive' }
  if (type === 'bearish') return { label: 'Divergence Bear', tone: 'negative' }
  if (type === 'h_bullish') return { label: 'Divergence H_Bull', tone: 'positive' }
  return { label: 'Divergence H_Bear', tone: 'negative' }
}

export function TokenIndicatorsSection(props: TokenIndicatorsSectionProps) {
  const marketVisionCalculations = useMarketVisionB(props.indicatorData, marketVisionConfig)
  const marketVisionRsiValue = lastFiniteValue(marketVisionCalculations.series.rsi)
  const marketVisionMoneyFlowValue = lastFiniteValue(marketVisionCalculations.series.rsiMfi)
  const marketVisionWt1 = lastFiniteValue(marketVisionCalculations.series.wt1)
  const marketVisionWt2 = lastFiniteValue(marketVisionCalculations.series.wt2)

  const marketVisionBias: { label: string; tone: IndicatorChipTone } = useMemo(() => {
    if (marketVisionWt1 == null || marketVisionWt2 == null) {
      return { label: 'WaveTrend —', tone: 'neutral' }
    }
    if (marketVisionWt1 > marketVisionWt2) {
      return { label: 'WaveTrend Bullish bias', tone: 'positive' }
    }
    if (marketVisionWt1 < marketVisionWt2) {
      return { label: 'WaveTrend Bearish bias', tone: 'negative' }
    }
    return { label: 'WaveTrend Neutral', tone: 'neutral' }
  }, [marketVisionWt1, marketVisionWt2])

  const bollingerConfig = useMemo(
    () => ({
      drawRSI: true,
      drawMFI: false,
      highlightBreaches: true,
      length: 14,
      source: 'hlc3' as const,
      bbLength: 20,
      multiplier: 2.0,
      lineWidth: 2,
      fillOpacity: 0.1,
    }),
    [],
  )
  const bollingerResult = useMemo(() => {
    if (props.indicatorData.length === 0) return null
    return calculateBollingerBands(props.indicatorData, bollingerConfig)
  }, [props.indicatorData, bollingerConfig])
  const bbIndicator = lastFiniteValue(bollingerResult?.indicator)
  const bbUpper = lastFiniteValue(bollingerResult?.upper)
  const bbLower = lastFiniteValue(bollingerResult?.lower)

  const bollingerPosition: { label: string; tone: IndicatorChipTone } = useMemo(() => {
    if (bbIndicator == null || bbUpper == null || bbLower == null) {
      return { label: 'Band position —', tone: 'neutral' }
    }
    if (bbIndicator > bbUpper) return { label: 'Band position Above upper', tone: 'negative' }
    if (bbIndicator < bbLower) return { label: 'Band position Below lower', tone: 'positive' }
    return { label: 'Band position Inside', tone: 'neutral' }
  }, [bbIndicator, bbUpper, bbLower])

  const bbwpConfig = useMemo(
    () => ({
      priceSource: 'close' as const,
      basisType: 'SMA' as const,
      basisLength: 7,
      lookback: 100,
      maType: 'SMA' as const,
      maLength: 5,
      extremeHigh: 98,
      extremeLow: 2,
    }),
    [],
  )
  const bbwpResult = useMemo(() => {
    if (props.indicatorData.length === 0) return null
    return calculateBBWP(props.indicatorData, bbwpConfig)
  }, [props.indicatorData, bbwpConfig])
  const bbwpValue = lastFiniteValue(bbwpResult?.bbwp)

  const rsiDivergencesResult = useMemo(() => {
    if (props.indicatorData.length === 0) return null
    return calculateRsiDivergences(props.indicatorData)
  }, [props.indicatorData])
  const rsiDivergencesRsiValue = lastFiniteValue(rsiDivergencesResult?.rsiSeries)
  const rsiDivergencesLatestType: RsiDivergenceType | null =
    rsiDivergencesResult?.divergences.length
      ? (rsiDivergencesResult.divergences[rsiDivergencesResult.divergences.length - 1]?.type ??
        null)
      : null

  const explainSpec = useMemo(() => {
    if (props.timeframe === "30d") return { bucketSeconds: SECONDS_PER_HOUR, targetBars: 7 * 24 }
    if (props.timeframe === "max") return { bucketSeconds: SECONDS_PER_DAY, targetBars: 30 }
    if (props.timeframe === "2y") return { bucketSeconds: SECONDS_PER_DAY, targetBars: 90 }
    return { bucketSeconds: SECONDS_PER_DAY, targetBars: 30 }
  }, [props.timeframe])

  const explainOhlcv = useMemo(() => {
    const bucketed = bucketizeOhlcv(props.indicatorData, explainSpec.bucketSeconds)
    const bars = Math.min(EXPLAIN_MAX_BARS, explainSpec.targetBars)
    return bucketed.slice(-bars)
  }, [props.indicatorData, explainSpec.bucketSeconds, explainSpec.targetBars])

  const indicatorExplainCloseHistory = useMemo(
    () => explainOhlcv.map((bar) => bar.close),
    [explainOhlcv],
  )
  const indicatorExplainCloseTimesUtc = useMemo(
    () => explainOhlcv.map((bar) => bar.time),
    [explainOhlcv],
  )

  const marketVisionExplainCalculations = useMarketVisionB(explainOhlcv, marketVisionConfig)
  const marketVisionExplainRsiValue = lastFiniteValue(marketVisionExplainCalculations.series.rsi)
  const marketVisionExplainMoneyFlowValue = lastFiniteValue(
    marketVisionExplainCalculations.series.rsiMfi,
  )
  const marketVisionExplainWt1 = lastFiniteValue(marketVisionExplainCalculations.series.wt1)
  const marketVisionExplainWt2 = lastFiniteValue(marketVisionExplainCalculations.series.wt2)

  const bollingerExplainResult = useMemo(() => {
    if (explainOhlcv.length === 0) return null
    return calculateBollingerBands(explainOhlcv, bollingerConfig)
  }, [explainOhlcv, bollingerConfig])
  const bbExplainIndicator = lastFiniteValue(bollingerExplainResult?.indicator)
  const bbExplainUpper = lastFiniteValue(bollingerExplainResult?.upper)
  const bbExplainLower = lastFiniteValue(bollingerExplainResult?.lower)
  const bbExplainBasis = lastFiniteValue(bollingerExplainResult?.basis)

  const bbwpExplainResult = useMemo(() => {
    if (explainOhlcv.length === 0) return null
    return calculateBBWP(explainOhlcv, bbwpConfig)
  }, [explainOhlcv, bbwpConfig])
  const bbwpExplainValue = lastFiniteValue(bbwpExplainResult?.bbwp)

  const rsiDivergencesExplainResult = useMemo(() => {
    if (explainOhlcv.length === 0) return null
    return calculateRsiDivergences(explainOhlcv)
  }, [explainOhlcv])
  const rsiDivergencesExplainRsiValue = lastFiniteValue(rsiDivergencesExplainResult?.rsiSeries)

  const marketVisionExplainBadges = useMemo(() => {
    const rsiChip = labelRsi(marketVisionRsiValue)
    const moneyFlowChip = labelMoneyFlow(marketVisionMoneyFlowValue)
    return (
      <>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(rsiChip.tone))}>
          {rsiChip.label}
        </Badge>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(marketVisionBias.tone))}>
          {marketVisionBias.label}
        </Badge>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(moneyFlowChip.tone))}>
          {moneyFlowChip.label}
        </Badge>
      </>
    )
  }, [marketVisionBias, marketVisionMoneyFlowValue, marketVisionRsiValue])

  const bollingerExplainBadges = useMemo(() => {
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

  const bbwpExplainBadges = useMemo(() => {
    const bbwpChip = labelBbwp(bbwpValue)
    return (
      <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(bbwpChip.tone))}>
        {bbwpChip.label}
      </Badge>
    )
  }, [bbwpValue])

  const rsiDivergencesExplainBadges = useMemo(() => {
    const rsiChip = labelRsi(rsiDivergencesRsiValue)
    const divergenceChip = labelRsiDivergence(rsiDivergencesLatestType)
    return (
      <>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(rsiChip.tone))}>
          {rsiChip.label}
        </Badge>
        <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-normal", getChipClasses(divergenceChip.tone))}>
          {divergenceChip.label}
        </Badge>
      </>
    )
  }, [rsiDivergencesLatestType, rsiDivergencesRsiValue])

  const marketVisionExplainChart = useMemo(
    () =>
      props.indicatorData.length === 0 ? null : (
        <MarketVisionChart
          data={props.indicatorData}
          config={marketVisionConfig}
          height={EXPLAIN_DIALOG_CHART_HEIGHT}
          showTimeAxis={true}
          initialWindowDays={props.indicatorWindowDays}
        />
      ),
    [props.indicatorData, props.indicatorWindowDays],
  )

  const bollingerExplainChart = useMemo(
    () =>
      props.indicatorData.length === 0 ? null : (
        <BollingerBandsChart
          data={props.indicatorData}
          config={bollingerConfig}
          height={EXPLAIN_DIALOG_CHART_HEIGHT}
          showTimeAxis={true}
          initialWindowDays={props.indicatorWindowDays}
        />
      ),
    [bollingerConfig, props.indicatorData, props.indicatorWindowDays],
  )

  const bbwpExplainChart = useMemo(
    () =>
      props.indicatorData.length === 0 ? null : (
        <BBWPChart
          data={props.indicatorData}
          config={{
            ...bbwpConfig,
            colorType: "Spectrum",
            spectrumPreset: "5point",
            lineWidth: 2,
            maWidth: 2,
          }}
          height={EXPLAIN_DIALOG_CHART_HEIGHT}
          showTimeAxis={true}
          initialWindowDays={props.indicatorWindowDays}
        />
      ),
    [bbwpConfig, props.indicatorData, props.indicatorWindowDays],
  )

  const rsiDivergencesExplainChart = useMemo(
    () =>
      props.indicatorData.length === 0 ? null : (
        <RsiDivergencesChart
          data={props.indicatorData}
          height={EXPLAIN_DIALOG_CHART_HEIGHT}
          showTimeAxis={true}
          initialWindowDays={props.indicatorWindowDays}
          showLabels={true}
        />
      ),
    [props.indicatorData, props.indicatorWindowDays],
  )

  const explainTokenLogoUrl = useMemo(
    () =>
      getTokenLogoURL(
        props.metricsData?.symbol ?? props.tokenSymbol,
        props.tokenImage,
      ),
    [props.metricsData?.symbol, props.tokenImage, props.tokenSymbol],
  )

  return (
    <>
      <div className="col-span-12 mt-16 mb-4">
        <span className="text-2xl font-semibold text-white">Technical Indicators</span>
      </div>

      <div className="grid grid-cols-1 gap-6 col-span-12 md:grid-cols-12">
        <div className="col-span-12 md:col-span-6">
          <Card className={cn("border-zinc-800/70 bg-black rounded-2xl overflow-hidden", props.showPending && "opacity-90")}>
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
                coinId={props.coinId}
                tokenName={props.tokenName}
                tokenSymbol={props.metricsData?.symbol ?? props.tokenSymbol}
                tokenLogoUrl={explainTokenLogoUrl}
                isPricePending={props.showPending}
                timeframe={props.timeframe}
                indicatorTitle="Momentum & Money Flow"
                indicatorChart={marketVisionExplainChart}
                indicatorContext={marketVisionExplainBadges}
                indicatorType="marketVision"
                marketContext={{
                  priceUsd: props.metricsData?.current_price ?? null,
                  change24hPct: props.metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: props.metricsData?.total_volume ?? null,
                  marketCapUsd: props.metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  rsiCurrent: marketVisionExplainRsiValue,
                  rsiHistory: marketVisionExplainCalculations.series.rsi.map((point) =>
                    typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null,
                  ),
                  wt1Current: marketVisionExplainWt1,
                  wt2Current: marketVisionExplainWt2,
                  moneyFlowCurrent: marketVisionExplainMoneyFlowValue,
                  moneyFlowHistory: marketVisionExplainCalculations.series.rsiMfi.map((point) =>
                    typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null,
                  ),
                }}
                disabled={props.showPending || props.isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {props.isLoading ? (
                <div className={cn("h-[250px] flex items-center justify-center", props.showPending && "opacity-60")}>
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Loading indicator data…</p>
                  </div>
                </div>
              ) : (
                <MarketVisionChart
                  data={props.indicatorData}
                  config={marketVisionConfig}
                  height={250}
                  showTimeAxis={true}
                  initialWindowDays={props.indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-6">
          <Card className={cn("border-zinc-800/70 bg-black rounded-2xl overflow-hidden", props.showPending && "opacity-90")}>
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
                coinId={props.coinId}
                tokenName={props.tokenName}
                tokenSymbol={props.metricsData?.symbol ?? props.tokenSymbol}
                tokenLogoUrl={explainTokenLogoUrl}
                isPricePending={props.showPending}
                timeframe={props.timeframe}
                indicatorTitle="Bolinger Bands"
                indicatorChart={bollingerExplainChart}
                indicatorContext={bollingerExplainBadges}
                indicatorType="bollinger"
                marketContext={{
                  priceUsd: props.metricsData?.current_price ?? null,
                  change24hPct: props.metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: props.metricsData?.total_volume ?? null,
                  marketCapUsd: props.metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  indicatorCurrent: bbExplainIndicator,
                  upperCurrent: bbExplainUpper,
                  lowerCurrent: bbExplainLower,
                  basisCurrent: bbExplainBasis,
                  indicatorHistory: (bollingerExplainResult?.indicator ?? []).map((point) =>
                    typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null,
                  ),
                  upperHistory: (bollingerExplainResult?.upper ?? []).map((point) =>
                    typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null,
                  ),
                  lowerHistory: (bollingerExplainResult?.lower ?? []).map((point) =>
                    typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null,
                  ),
                }}
                disabled={props.showPending || props.isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {props.isLoading ? (
                <div className={cn("h-[250px] flex items-center justify-center", props.showPending && "opacity-60")}>
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Loading indicator data…</p>
                  </div>
                </div>
              ) : (
                <BollingerBandsChart
                  data={props.indicatorData}
                  config={bollingerConfig}
                  height={250}
                  showTimeAxis={true}
                  initialWindowDays={props.indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12">
          <Card className={cn("border-zinc-800/70 bg-black rounded-2xl overflow-hidden", props.showPending && "opacity-90")}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Volatility</div>
                <div className="text-xs text-muted-foreground text-pretty">
                  Percentile rank of bandwidth (detects compression vs expansion).
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {bbwpExplainBadges}
                  {rsiDivergencesExplainBadges}
                </div>
              </div>
              <IndicatorExplainDialog
                coinId={props.coinId}
                tokenName={props.tokenName}
                tokenSymbol={props.metricsData?.symbol ?? props.tokenSymbol}
                tokenLogoUrl={explainTokenLogoUrl}
                isPricePending={props.showPending}
                timeframe={props.timeframe}
                indicatorTitle="Volatility"
                indicatorChart={bbwpExplainChart}
                indicatorContext={bbwpExplainBadges}
                indicatorType="bbwp"
                marketContext={{
                  priceUsd: props.metricsData?.current_price ?? null,
                  change24hPct: props.metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: props.metricsData?.total_volume ?? null,
                  marketCapUsd: props.metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  bbwpCurrent: bbwpExplainValue,
                  bbwpHistory: (bbwpExplainResult?.bbwp ?? []).map((point) =>
                    typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null,
                  ),
                  lookback: bbwpConfig.lookback,
                }}
                disabled={props.showPending || props.isLoading}
              />
            </CardHeader>
            <CardContent className="grid gap-6 p-2 pt-0 lg:grid-cols-2">
              {props.isLoading ? (
                <div className={cn("lg:col-span-2 h-[250px] flex items-center justify-center", props.showPending && "opacity-60")}>
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Loading indicator data…</p>
                  </div>
                </div>
              ) : (
                <>
                  <BBWPChart
                    data={props.indicatorData}
                    config={{
                      ...bbwpConfig,
                      colorType: 'Spectrum',
                      spectrumPreset: '5point',
                      lineWidth: 2,
                      maWidth: 2,
                    }}
                    height={250}
                    showTimeAxis={true}
                    initialWindowDays={props.indicatorWindowDays}
                  />
                  <RsiDivergencesChart
                    data={props.indicatorData}
                    height={250}
                    showTimeAxis={true}
                    initialWindowDays={props.indicatorWindowDays}
                    showLabels={true}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
