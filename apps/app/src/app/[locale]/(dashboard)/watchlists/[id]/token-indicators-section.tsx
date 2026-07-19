"use client";

import { TickMeter } from "@/components/tick-meter";
import {
  calculateBBWP,
  calculateBollingerBands,
  useMarketVisionB,
} from "@/hooks/market-vision";
import { marketVisionConfig } from "@/hooks/market-vision/market-vision-config";
import {
  type RsiDivergenceType,
  type RsiDivergencesConfig,
  calculateRsiDivergences,
} from "@/hooks/market-vision/rsi-divergences";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import { Card, CardContent, CardHeader } from "@v1/ui/card";
import { cn } from "@v1/ui/cn";
import React, { useMemo } from "react";
import { BBWPChart } from "./bbwp-chart";
import { BollingerBandsChart } from "./bollinger-bands-chart";
import { IndicatorExplainDialog } from "./indicator-explain-dialog";
import { MarketVisionChart } from "./marketvision-chart";
import { RsiDivergencesChart } from "./rsi-divergences-chart";

export interface IndicatorOhlcvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TokenIndicatorsSectionProps {
  coinId: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImage?: string;
  timeframe: string;
  indicatorData: IndicatorOhlcvBar[];
  indicatorWindowDays: number;
  showPending: boolean;
  isLoading: boolean;
  metricsData: {
    current_price: number | null;
    total_volume: number | null;
    market_cap: number | null;
    price_change_percentage_24h: number | null;
    symbol: string;
  } | null;
}

interface OhlcvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function bucketizeOhlcv(
  points: ReadonlyArray<OhlcvBar>,
  bucketSeconds: number,
): OhlcvBar[] {
  if (!points.length) return [];

  const out: Array<OhlcvBar> = [];
  let currentBucketStart: number | null = null;
  let current: OhlcvBar | null = null;

  for (const point of points) {
    if (!Number.isFinite(point.time)) continue;
    const bucketStart = Math.floor(point.time / bucketSeconds) * bucketSeconds;

    if (currentBucketStart === bucketStart && current) {
      current.high = Math.max(current.high, point.high);
      current.low = Math.min(current.low, point.low);
      current.close = point.close;
      current.volume += point.volume;
      continue;
    }

    if (current) out.push(current);
    currentBucketStart = bucketStart;
    current = {
      time: bucketStart,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
    };
  }

  if (current) out.push(current);
  return out;
}

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * 60 * 60;
const EXPLAIN_MAX_BARS = 180;
const EXPLAIN_DIALOG_CHART_HEIGHT = 220;

function lastFiniteValue(
  points: Array<{ value: number }> | undefined,
): number | null {
  if (!points || points.length === 0) return null;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Sidebar-style stat readout (mirrors ComparativeStatsPanel rows): tiny
 * uppercase label, mono value, and an optional TickMeter reinforcing the
 * value's magnitude/direction against its domain. The meter inherits its
 * color from `valueClass` via currentColor.
 */
function IndicatorStat({
  label,
  value,
  valueClass = "text-zinc-300",
  status,
  meter,
  meterClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
  status?: string;
  meter?: {
    value: number;
    min: number;
    max: number;
    origin?: number | "min";
  };
  /**
   * Meter color override — neutral stats keep grey text but an amber fill so
   * the bar reads against its dim track instead of grey-on-grey.
   */
  meterClass?: string;
}) {
  return (
    <span className="flex items-center gap-2 text-[13px]">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span className={cn("font-berkeley-mono tabular-nums", valueClass)}>
        {value}
      </span>
      {meter ? (
        <TickMeter
          value={meter.value}
          min={meter.min}
          max={meter.max}
          origin={meter.origin ?? "min"}
          className={cn("h-2 w-14", meterClass ?? valueClass)}
        />
      ) : null}
      {status ? (
        <span className={cn("text-[10px]", valueClass)}>{status}</span>
      ) : null}
    </span>
  );
}

function RsiStat({ value }: { value: number | null }) {
  if (value == null) {
    return <IndicatorStat label="RSI" value="—" valueClass="text-zinc-500" />;
  }
  const overbought = value >= 70;
  const oversold = value <= 30;
  return (
    <IndicatorStat
      label="RSI"
      value={value.toFixed(0)}
      valueClass={
        overbought
          ? "text-red-400"
          : oversold
            ? "text-green-400"
            : "text-zinc-300"
      }
      status={overbought ? "Overbought" : oversold ? "Oversold" : undefined}
      meter={{ value, min: 0, max: 100 }}
      meterClass={overbought || oversold ? undefined : "text-amber-400"}
    />
  );
}

export function TokenIndicatorsSection(props: TokenIndicatorsSectionProps) {
  const marketVisionCalculations = useMarketVisionB(
    props.indicatorData,
    marketVisionConfig,
  );
  const marketVisionRsiValue = lastFiniteValue(
    marketVisionCalculations.series.rsi,
  );
  const marketVisionMoneyFlowValue = lastFiniteValue(
    marketVisionCalculations.series.rsiMfi,
  );
  const marketVisionWt1 = lastFiniteValue(marketVisionCalculations.series.wt1);
  const marketVisionWt2 = lastFiniteValue(marketVisionCalculations.series.wt2);

  // Domain for the diverging money-flow meter: symmetric around 0 so the
  // filled segment reads as inflow/outflow strength vs the window's peak.
  const moneyFlowMaxAbs = useMemo(() => {
    let max = 1;
    for (const point of marketVisionCalculations.series.rsiMfi) {
      const v = point?.value;
      if (typeof v === "number" && Number.isFinite(v)) {
        max = Math.max(max, Math.abs(v));
      }
    }
    return max;
  }, [marketVisionCalculations.series.rsiMfi]);

  const bollingerConfig = useMemo(
    () => ({
      drawRSI: true,
      drawMFI: false,
      highlightBreaches: true,
      length: 14,
      source: "hlc3" as const,
      bbLength: 20,
      multiplier: 2.0,
      lineWidth: 2,
      fillOpacity: 0.1,
    }),
    [],
  );
  const bollingerResult = useMemo(() => {
    if (props.indicatorData.length === 0) return null;
    return calculateBollingerBands(props.indicatorData, bollingerConfig);
  }, [props.indicatorData, bollingerConfig]);
  const bbIndicator = lastFiniteValue(bollingerResult?.indicator);
  const bbUpper = lastFiniteValue(bollingerResult?.upper);
  const bbLower = lastFiniteValue(bollingerResult?.lower);

  // %B-style position of the RSI within its Bollinger bands (0 = lower band,
  // 1 = upper band) — same readout the comparative sidebar uses.
  const bbPercentB =
    bbIndicator != null &&
    bbUpper != null &&
    bbLower != null &&
    bbUpper > bbLower
      ? (bbIndicator - bbLower) / (bbUpper - bbLower)
      : null;

  const bbwpConfig = useMemo(
    () => ({
      priceSource: "close" as const,
      basisType: "SMA" as const,
      basisLength: 7,
      lookback: 100,
      maType: "SMA" as const,
      maLength: 5,
      extremeHigh: 98,
      extremeLow: 2,
    }),
    [],
  );
  const bbwpResult = useMemo(() => {
    if (props.indicatorData.length === 0) return null;
    return calculateBBWP(props.indicatorData, bbwpConfig);
  }, [props.indicatorData, bbwpConfig]);
  const bbwpValue = lastFiniteValue(bbwpResult?.bbwp);

  const rsiDivergencesConfig = useMemo<RsiDivergencesConfig>(
    () => ({
      rsiLength: 14,
      leftBars: 5,
      rightBars: 5,
      pairMode: "TV-like",
      tolBars: 2,
      priceMode: "High/Low",
      allowEqual: true,
      priceEps: 0,
      rsiEps: 0,
      showRegular: true,
      showHidden: true,
    }),
    [],
  );
  const rsiDivergencesResult = useMemo(() => {
    if (props.indicatorData.length === 0) return null;
    return calculateRsiDivergences(props.indicatorData, rsiDivergencesConfig);
  }, [props.indicatorData, rsiDivergencesConfig]);
  const rsiDivergencesRsiValue = lastFiniteValue(
    rsiDivergencesResult?.rsiSeries,
  );
  const rsiDivergencesLatestType: RsiDivergenceType | null =
    rsiDivergencesResult?.divergences.length
      ? rsiDivergencesResult.divergences[
          rsiDivergencesResult.divergences.length - 1
        ]?.type ?? null
      : null;

  const explainSpec = useMemo(() => {
    if (props.timeframe === "30d")
      return { bucketSeconds: SECONDS_PER_HOUR, targetBars: 7 * 24 };
    if (props.timeframe === "max")
      return { bucketSeconds: SECONDS_PER_DAY, targetBars: 30 };
    if (props.timeframe === "2y")
      return { bucketSeconds: SECONDS_PER_DAY, targetBars: 90 };
    return { bucketSeconds: SECONDS_PER_DAY, targetBars: 30 };
  }, [props.timeframe]);

  const explainOhlcv = useMemo(() => {
    const bucketed = bucketizeOhlcv(
      props.indicatorData,
      explainSpec.bucketSeconds,
    );
    const bars = Math.min(EXPLAIN_MAX_BARS, explainSpec.targetBars);
    return bucketed.slice(-bars);
  }, [props.indicatorData, explainSpec.bucketSeconds, explainSpec.targetBars]);

  const indicatorExplainCloseHistory = useMemo(
    () => explainOhlcv.map((bar) => bar.close),
    [explainOhlcv],
  );
  const indicatorExplainCloseTimesUtc = useMemo(
    () => explainOhlcv.map((bar) => bar.time),
    [explainOhlcv],
  );

  const marketVisionExplainCalculations = useMarketVisionB(
    explainOhlcv,
    marketVisionConfig,
  );
  const marketVisionExplainRsiValue = lastFiniteValue(
    marketVisionExplainCalculations.series.rsi,
  );
  const marketVisionExplainMoneyFlowValue = lastFiniteValue(
    marketVisionExplainCalculations.series.rsiMfi,
  );
  const marketVisionExplainWt1 = lastFiniteValue(
    marketVisionExplainCalculations.series.wt1,
  );
  const marketVisionExplainWt2 = lastFiniteValue(
    marketVisionExplainCalculations.series.wt2,
  );

  const bollingerExplainResult = useMemo(() => {
    if (explainOhlcv.length === 0) return null;
    return calculateBollingerBands(explainOhlcv, bollingerConfig);
  }, [explainOhlcv, bollingerConfig]);
  const bbExplainIndicator = lastFiniteValue(bollingerExplainResult?.indicator);
  const bbExplainUpper = lastFiniteValue(bollingerExplainResult?.upper);
  const bbExplainLower = lastFiniteValue(bollingerExplainResult?.lower);
  const bbExplainBasis = lastFiniteValue(bollingerExplainResult?.basis);

  const bbwpExplainResult = useMemo(() => {
    if (explainOhlcv.length === 0) return null;
    return calculateBBWP(explainOhlcv, bbwpConfig);
  }, [explainOhlcv, bbwpConfig]);
  const bbwpExplainValue = lastFiniteValue(bbwpExplainResult?.bbwp);

  const rsiDivergencesExplainResult = useMemo(() => {
    if (explainOhlcv.length === 0) return null;
    return calculateRsiDivergences(explainOhlcv, rsiDivergencesConfig);
  }, [explainOhlcv, rsiDivergencesConfig]);
  const rsiDivergencesExplainRsiValue = lastFiniteValue(
    rsiDivergencesExplainResult?.rsiSeries,
  );

  const marketVisionExplainBadges = useMemo(() => {
    const wtKnown = marketVisionWt1 != null && marketVisionWt2 != null;
    const wtBullish = wtKnown && marketVisionWt1 > marketVisionWt2;
    const wtBearish = wtKnown && marketVisionWt1 < marketVisionWt2;
    const mf = marketVisionMoneyFlowValue;
    return (
      <>
        <RsiStat value={marketVisionRsiValue} />
        <IndicatorStat
          label="WT"
          value={
            !wtKnown
              ? "—"
              : wtBullish
                ? "↑ Bullish"
                : wtBearish
                  ? "↓ Bearish"
                  : "· Neutral"
          }
          valueClass={
            wtBullish
              ? "text-green-400"
              : wtBearish
                ? "text-red-400"
                : wtKnown
                  ? "text-zinc-300"
                  : "text-zinc-500"
          }
        />
        {mf == null ? (
          <IndicatorStat label="MF" value="—" valueClass="text-zinc-500" />
        ) : (
          <IndicatorStat
            label="MF"
            value={`${mf > 0 ? "+" : ""}${mf.toFixed(0)}`}
            valueClass={
              mf > 0
                ? "text-green-400"
                : mf < 0
                  ? "text-red-400"
                  : "text-zinc-300"
            }
            status={mf > 0 ? "Inflow" : mf < 0 ? "Outflow" : undefined}
            meter={{
              value: mf,
              min: -moneyFlowMaxAbs,
              max: moneyFlowMaxAbs,
              origin: 0,
            }}
          />
        )}
      </>
    );
  }, [
    marketVisionMoneyFlowValue,
    marketVisionRsiValue,
    marketVisionWt1,
    marketVisionWt2,
    moneyFlowMaxAbs,
  ]);

  const bollingerExplainBadges = useMemo(
    () => (
      <>
        <RsiStat value={bbIndicator} />
        {bbPercentB == null ? (
          <IndicatorStat label="%B" value="—" valueClass="text-zinc-500" />
        ) : (
          <IndicatorStat
            label="%B"
            value={bbPercentB.toFixed(2)}
            valueClass={
              bbPercentB > 1
                ? "text-red-400"
                : bbPercentB < 0
                  ? "text-green-400"
                  : "text-zinc-300"
            }
            status={
              bbPercentB > 1
                ? "Above upper"
                : bbPercentB < 0
                  ? "Below lower"
                  : "Inside"
            }
            meter={{ value: bbPercentB, min: 0, max: 1 }}
            meterClass={
              bbPercentB > 1 || bbPercentB < 0 ? undefined : "text-amber-400"
            }
          />
        )}
      </>
    ),
    [bbIndicator, bbPercentB],
  );

  const bbwpExplainBadges = useMemo(() => {
    if (bbwpValue == null) {
      return (
        <IndicatorStat label="BBWP" value="—" valueClass="text-zinc-500" />
      );
    }
    const squeeze = bbwpValue <= 20;
    const expansion = bbwpValue >= 80;
    return (
      <IndicatorStat
        label="BBWP"
        value={bbwpValue.toFixed(0)}
        valueClass={
          squeeze
            ? "text-amber-400"
            : expansion
              ? "text-rose-400"
              : "text-zinc-300"
        }
        status={squeeze ? "Compression" : expansion ? "Expansion" : "Normal"}
        meter={{ value: bbwpValue, min: 0, max: 100 }}
        meterClass={squeeze || expansion ? undefined : "text-amber-400"}
      />
    );
  }, [bbwpValue]);

  const rsiDivergencesExplainBadges = useMemo(() => {
    const type = rsiDivergencesLatestType;
    const bullish = type === "bullish" || type === "h_bullish";
    return (
      <>
        <RsiStat value={rsiDivergencesRsiValue} />
        <IndicatorStat
          label="Div"
          value={
            !type
              ? "—"
              : type === "bullish"
                ? "Bull"
                : type === "bearish"
                  ? "Bear"
                  : type === "h_bullish"
                    ? "H Bull"
                    : "H Bear"
          }
          valueClass={
            !type
              ? "text-zinc-500"
              : bullish
                ? "text-green-400"
                : "text-red-400"
          }
        />
      </>
    );
  }, [rsiDivergencesLatestType, rsiDivergencesRsiValue]);

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
  );

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
  );

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
  );

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
  );

  const explainTokenLogoUrl = useMemo(
    () =>
      getTokenLogoURL(
        props.metricsData?.symbol ?? props.tokenSymbol,
        props.tokenImage,
      ),
    [props.metricsData?.symbol, props.tokenImage, props.tokenSymbol],
  );

  return (
    <>
      <div className="col-span-12 mt-16 mb-4">
        <span className="text-2xl font-semibold text-white">
          Technical Indicators
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 col-span-12 md:grid-cols-12">
        <div className="col-span-12 md:col-span-6">
          <Card
            className={cn(
              "border-zinc-800/70 bg-black rounded-2xl overflow-hidden",
              props.showPending && "opacity-90",
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  Momentum &amp; Money Flow
                </div>
                <div className="text-xs text-muted-foreground text-pretty">
                  Tracks momentum shifts using WaveTrend + money flow.
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
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
                  change24hPct:
                    props.metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: props.metricsData?.total_volume ?? null,
                  marketCapUsd: props.metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  rsiCurrent: marketVisionExplainRsiValue,
                  rsiHistory: marketVisionExplainCalculations.series.rsi.map(
                    (point) =>
                      typeof point.value === "number" &&
                      Number.isFinite(point.value)
                        ? point.value
                        : null,
                  ),
                  wt1Current: marketVisionExplainWt1,
                  wt2Current: marketVisionExplainWt2,
                  moneyFlowCurrent: marketVisionExplainMoneyFlowValue,
                  moneyFlowHistory:
                    marketVisionExplainCalculations.series.rsiMfi.map(
                      (point) =>
                        typeof point.value === "number" &&
                        Number.isFinite(point.value)
                          ? point.value
                          : null,
                    ),
                }}
                disabled={props.showPending || props.isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {props.isLoading ? (
                <div
                  className={cn(
                    "h-[250px] flex items-center justify-center",
                    props.showPending && "opacity-60",
                  )}
                >
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Loading indicator data…
                    </p>
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
          <Card
            className={cn(
              "border-zinc-800/70 bg-black rounded-2xl overflow-hidden",
              props.showPending && "opacity-90",
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  Bolinger Bands
                </div>
                <div className="text-xs text-muted-foreground text-pretty">
                  Shows RSI relative to its own bands (overextension vs mean).
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
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
                  change24hPct:
                    props.metricsData?.price_change_percentage_24h ?? null,
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
                  indicatorHistory: (
                    bollingerExplainResult?.indicator ?? []
                  ).map((point) =>
                    typeof point.value === "number" &&
                    Number.isFinite(point.value)
                      ? point.value
                      : null,
                  ),
                  upperHistory: (bollingerExplainResult?.upper ?? []).map(
                    (point) =>
                      typeof point.value === "number" &&
                      Number.isFinite(point.value)
                        ? point.value
                        : null,
                  ),
                  lowerHistory: (bollingerExplainResult?.lower ?? []).map(
                    (point) =>
                      typeof point.value === "number" &&
                      Number.isFinite(point.value)
                        ? point.value
                        : null,
                  ),
                }}
                disabled={props.showPending || props.isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {props.isLoading ? (
                <div
                  className={cn(
                    "h-[250px] flex items-center justify-center",
                    props.showPending && "opacity-60",
                  )}
                >
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Loading indicator data…
                    </p>
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

        <div className="col-span-12 md:col-span-6">
          <Card
            className={cn(
              "border-zinc-800/70 bg-black rounded-2xl overflow-hidden",
              props.showPending && "opacity-90",
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  Volatility
                </div>
                <div className="text-xs text-muted-foreground text-pretty">
                  Percentile rank of bandwidth (detects compression vs
                  expansion).
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {bbwpExplainBadges}
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
                  change24hPct:
                    props.metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: props.metricsData?.total_volume ?? null,
                  marketCapUsd: props.metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  bbwpCurrent: bbwpExplainValue,
                  bbwpHistory: (bbwpExplainResult?.bbwp ?? []).map((point) =>
                    typeof point.value === "number" &&
                    Number.isFinite(point.value)
                      ? point.value
                      : null,
                  ),
                  lookback: bbwpConfig.lookback,
                }}
                disabled={props.showPending || props.isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {props.isLoading ? (
                <div
                  className={cn(
                    "h-[250px] flex items-center justify-center",
                    props.showPending && "opacity-60",
                  )}
                >
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Loading indicator data…
                    </p>
                  </div>
                </div>
              ) : (
                <BBWPChart
                  data={props.indicatorData}
                  config={{
                    ...bbwpConfig,
                    colorType: "Spectrum",
                    spectrumPreset: "5point",
                    lineWidth: 2,
                    maWidth: 2,
                  }}
                  height={250}
                  showTimeAxis={true}
                  initialWindowDays={props.indicatorWindowDays}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-6">
          <Card
            className={cn(
              "border-zinc-800/70 bg-black rounded-2xl overflow-hidden",
              props.showPending && "opacity-90",
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  Divergences
                </div>
                <div className="text-xs text-muted-foreground text-pretty">
                  Compares RSI pivots against price pivots to flag bullish and
                  bearish divergence.
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
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
                indicatorTitle="RSI Divergences"
                indicatorChart={rsiDivergencesExplainChart}
                indicatorContext={rsiDivergencesExplainBadges}
                indicatorType="rsiDivergences"
                marketContext={{
                  priceUsd: props.metricsData?.current_price ?? null,
                  change24hPct:
                    props.metricsData?.price_change_percentage_24h ?? null,
                  volume24hUsd: props.metricsData?.total_volume ?? null,
                  marketCapUsd: props.metricsData?.market_cap ?? null,
                  closeHistory: indicatorExplainCloseHistory,
                  closeTimesUtc: indicatorExplainCloseTimesUtc,
                }}
                snapshot={{
                  rsiCurrent: rsiDivergencesExplainRsiValue,
                  rsiHistory: (
                    rsiDivergencesExplainResult?.rsiSeries ?? []
                  ).map((point) =>
                    typeof point.value === "number" &&
                    Number.isFinite(point.value)
                      ? point.value
                      : null,
                  ),
                  divergences: (rsiDivergencesExplainResult?.divergences ?? [])
                    .slice(-96)
                    .map((divergence) => ({
                      type: divergence.type,
                      startTime: divergence.startTime,
                      endTime: divergence.endTime,
                      priceStart: divergence.priceStart,
                      priceEnd: divergence.priceEnd,
                      rsiStart: divergence.rsiStart,
                      rsiEnd: divergence.rsiEnd,
                    })),
                  settings: rsiDivergencesConfig,
                }}
                disabled={props.showPending || props.isLoading}
              />
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {props.isLoading ? (
                <div
                  className={cn(
                    "h-[250px] flex items-center justify-center",
                    props.showPending && "opacity-60",
                  )}
                >
                  <div className="text-center">
                    <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Loading indicator data…
                    </p>
                  </div>
                </div>
              ) : (
                <RsiDivergencesChart
                  data={props.indicatorData}
                  height={250}
                  showTimeAxis={true}
                  initialWindowDays={props.indicatorWindowDays}
                  showLabels={true}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
