"use client";

import { TickMeter } from "@/components/tick-meter";
import {
  calculateBBWP,
  calculateBollingerBands,
  useMarketVisionB,
} from "@/hooks/market-vision";
import { marketVisionConfig } from "@/hooks/market-vision/market-vision-config";
import {
  type ReverseRsiLevel,
  type RsiDivergenceType,
  type RsiDivergencesConfig,
  calculateRsiDivergences,
} from "@/hooks/market-vision/rsi-divergences";
import { formatUsdPrice } from "@/lib/format-usd";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import { Card, CardContent, CardHeader } from "@v1/ui/card";
import { cn } from "@v1/ui/cn";
import type React from "react";
import { useMemo } from "react";
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

/** Stat/params strip rendered below each indicator chart. */
function IndicatorStatsBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-800/60 px-2 pt-3 pb-1">
      {children}
    </div>
  );
}

/** Caretaker zone names for the default reverse-RSI targets. */
const REVERSE_RSI_ZONE_LABELS: Record<number, string> = {
  80: "Crit Bull",
  62: "Ctrl Bull",
  50: "Mid",
  38: "Ctrl Bear",
  20: "Crit Bear",
};

/**
 * Reverse-RSI price readout: the close the NEXT bar would need for RSI to
 * enter each Caretaker zone (crit bull 80 / ctrl bull 62 / mid 50 / ctrl bear
 * 38 / crit bear 20). Bull zones (>=62) red — price has to rise to get there;
 * bear zones (<=38) green.
 */
function ReverseRsiStats({ levels }: { levels: ReverseRsiLevel[] }) {
  if (levels.length === 0) return null;
  return (
    <>
      {levels.map((level) => (
        <IndicatorStat
          key={level.target}
          label={
            REVERSE_RSI_ZONE_LABELS[level.target]
              ? `${REVERSE_RSI_ZONE_LABELS[level.target]} ${level.target}`
              : `RSI ${level.target}`
          }
          value={level.price != null ? `@ ${formatUsdPrice(level.price)}` : "—"}
          valueClass={
            level.price == null
              ? "text-zinc-500"
              : level.target >= 62
                ? "text-red-400"
                : level.target <= 38
                  ? "text-green-400"
                  : "text-zinc-300"
          }
        />
      ))}
    </>
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

/** Market context passed to every indicator explain dialog. */
interface IndicatorMarketContext {
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  closeHistory: number[];
  closeTimesUtc: number[];
}

/**
 * Props shared by every indicator card: token identity/context for the
 * explain dialog plus the full and bucketized (explain) OHLCV series.
 */
interface IndicatorCardSharedProps {
  coinId: string;
  tokenName: string;
  tokenSymbol: string;
  tokenLogoUrl: ReturnType<typeof getTokenLogoURL>;
  timeframe: string;
  showPending: boolean;
  isLoading: boolean;
  indicatorData: IndicatorOhlcvBar[];
  indicatorWindowDays: number;
  explainOhlcv: OhlcvBar[];
  marketContext: IndicatorMarketContext;
}

/**
 * Card shell shared by all four indicator sections: header with title,
 * description and explain-dialog trigger, loading placeholder or chart body,
 * and the stats bar underneath.
 */
function IndicatorCardFrame({
  title,
  description,
  showPending,
  isLoading,
  explain,
  badges,
  children,
}: {
  title: string;
  description: string;
  showPending: boolean;
  isLoading: boolean;
  explain: React.ReactNode;
  badges: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="col-span-12 md:col-span-6">
      <Card
        className={cn(
          "border-zinc-800/70 bg-black rounded-2xl overflow-hidden",
          showPending && "opacity-90",
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{title}</div>
            <div className="text-xs text-muted-foreground text-pretty">
              {description}
            </div>
          </div>
          {explain}
        </CardHeader>
        <CardContent className="p-2 pt-0">
          {isLoading ? (
            <div
              className={cn(
                "h-[250px] flex items-center justify-center",
                showPending && "opacity-60",
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
            children
          )}
          <IndicatorStatsBar>{badges}</IndicatorStatsBar>
        </CardContent>
      </Card>
    </div>
  );
}

/** WaveTrend + money-flow indicator card ("Momentum & Money Flow"). */
function MomentumMoneyFlowCard({
  shared,
}: {
  shared: IndicatorCardSharedProps;
}) {
  const calculations = useMarketVisionB(shared.indicatorData, marketVisionConfig);
  const rsiValue = lastFiniteValue(calculations.series.rsi);
  const moneyFlowValue = lastFiniteValue(calculations.series.rsiMfi);
  const wt1 = lastFiniteValue(calculations.series.wt1);
  const wt2 = lastFiniteValue(calculations.series.wt2);

  // Domain for the diverging money-flow meter: symmetric around 0 so the
  // filled segment reads as inflow/outflow strength vs the window's peak.
  const moneyFlowMaxAbs = useMemo(() => {
    let max = 1;
    for (const point of calculations.series.rsiMfi) {
      const v = point?.value;
      if (typeof v === "number" && Number.isFinite(v)) {
        max = Math.max(max, Math.abs(v));
      }
    }
    return max;
  }, [calculations.series.rsiMfi]);

  const explainCalculations = useMarketVisionB(
    shared.explainOhlcv,
    marketVisionConfig,
  );
  const explainRsiValue = lastFiniteValue(explainCalculations.series.rsi);
  const explainMoneyFlowValue = lastFiniteValue(
    explainCalculations.series.rsiMfi,
  );
  const explainWt1 = lastFiniteValue(explainCalculations.series.wt1);
  const explainWt2 = lastFiniteValue(explainCalculations.series.wt2);

  const badges = useMemo(() => {
    const wtKnown = wt1 != null && wt2 != null;
    const wtBullish = wtKnown && wt1 > wt2;
    const wtBearish = wtKnown && wt1 < wt2;
    const mf = moneyFlowValue;
    return (
      <>
        <RsiStat value={rsiValue} />
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
  }, [moneyFlowValue, rsiValue, wt1, wt2, moneyFlowMaxAbs]);

  const explainChart = useMemo(
    () =>
      shared.indicatorData.length === 0 ? null : (
        <MarketVisionChart
          data={shared.indicatorData}
          config={marketVisionConfig}
          height={EXPLAIN_DIALOG_CHART_HEIGHT}
          showTimeAxis={true}
          initialWindowDays={shared.indicatorWindowDays}
        />
      ),
    [shared.indicatorData, shared.indicatorWindowDays],
  );

  return (
    <IndicatorCardFrame
      title="Momentum & Money Flow"
      description="Tracks momentum shifts using WaveTrend + money flow."
      showPending={shared.showPending}
      isLoading={shared.isLoading}
      badges={badges}
      explain={
        <IndicatorExplainDialog
          coinId={shared.coinId}
          tokenName={shared.tokenName}
          tokenSymbol={shared.tokenSymbol}
          tokenLogoUrl={shared.tokenLogoUrl}
          isPricePending={shared.showPending}
          timeframe={shared.timeframe}
          indicatorTitle="Momentum & Money Flow"
          indicatorChart={explainChart}
          indicatorContext={badges}
          indicatorType="marketVision"
          marketContext={shared.marketContext}
          snapshot={{
            rsiCurrent: explainRsiValue,
            rsiHistory: explainCalculations.series.rsi.map((point) =>
              typeof point.value === "number" && Number.isFinite(point.value)
                ? point.value
                : null,
            ),
            wt1Current: explainWt1,
            wt2Current: explainWt2,
            moneyFlowCurrent: explainMoneyFlowValue,
            moneyFlowHistory: explainCalculations.series.rsiMfi.map((point) =>
              typeof point.value === "number" && Number.isFinite(point.value)
                ? point.value
                : null,
            ),
          }}
          disabled={shared.showPending || shared.isLoading}
        />
      }
    >
      <MarketVisionChart
        data={shared.indicatorData}
        config={marketVisionConfig}
        height={250}
        showTimeAxis={true}
        initialWindowDays={shared.indicatorWindowDays}
      />
    </IndicatorCardFrame>
  );
}

/** RSI-in-Bollinger-bands indicator card ("Bolinger Bands"). */
function BollingerBandsCard({
  shared,
}: {
  shared: IndicatorCardSharedProps;
}) {
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
    if (shared.indicatorData.length === 0) return null;
    return calculateBollingerBands(shared.indicatorData, bollingerConfig);
  }, [shared.indicatorData, bollingerConfig]);
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

  const explainResult = useMemo(() => {
    if (shared.explainOhlcv.length === 0) return null;
    return calculateBollingerBands(shared.explainOhlcv, bollingerConfig);
  }, [shared.explainOhlcv, bollingerConfig]);
  const bbExplainIndicator = lastFiniteValue(explainResult?.indicator);
  const bbExplainUpper = lastFiniteValue(explainResult?.upper);
  const bbExplainLower = lastFiniteValue(explainResult?.lower);
  const bbExplainBasis = lastFiniteValue(explainResult?.basis);

  const badges = useMemo(
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

  const explainChart = useMemo(
    () =>
      shared.indicatorData.length === 0 ? null : (
        <BollingerBandsChart
          data={shared.indicatorData}
          config={bollingerConfig}
          height={EXPLAIN_DIALOG_CHART_HEIGHT}
          showTimeAxis={true}
          initialWindowDays={shared.indicatorWindowDays}
        />
      ),
    [bollingerConfig, shared.indicatorData, shared.indicatorWindowDays],
  );

  return (
    <IndicatorCardFrame
      title="Bolinger Bands"
      description="Shows RSI relative to its own bands (overextension vs mean)."
      showPending={shared.showPending}
      isLoading={shared.isLoading}
      badges={badges}
      explain={
        <IndicatorExplainDialog
          coinId={shared.coinId}
          tokenName={shared.tokenName}
          tokenSymbol={shared.tokenSymbol}
          tokenLogoUrl={shared.tokenLogoUrl}
          isPricePending={shared.showPending}
          timeframe={shared.timeframe}
          indicatorTitle="Bolinger Bands"
          indicatorChart={explainChart}
          indicatorContext={badges}
          indicatorType="bollinger"
          marketContext={shared.marketContext}
          snapshot={{
            indicatorCurrent: bbExplainIndicator,
            upperCurrent: bbExplainUpper,
            lowerCurrent: bbExplainLower,
            basisCurrent: bbExplainBasis,
            indicatorHistory: (explainResult?.indicator ?? []).map((point) =>
              typeof point.value === "number" && Number.isFinite(point.value)
                ? point.value
                : null,
            ),
            upperHistory: (explainResult?.upper ?? []).map((point) =>
              typeof point.value === "number" && Number.isFinite(point.value)
                ? point.value
                : null,
            ),
            lowerHistory: (explainResult?.lower ?? []).map((point) =>
              typeof point.value === "number" && Number.isFinite(point.value)
                ? point.value
                : null,
            ),
          }}
          disabled={shared.showPending || shared.isLoading}
        />
      }
    >
      <BollingerBandsChart
        data={shared.indicatorData}
        config={bollingerConfig}
        height={250}
        showTimeAxis={true}
        initialWindowDays={shared.indicatorWindowDays}
      />
    </IndicatorCardFrame>
  );
}

/** BBWP percentile-rank indicator card ("Volatility"). */
function VolatilityCard({ shared }: { shared: IndicatorCardSharedProps }) {
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
    if (shared.indicatorData.length === 0) return null;
    return calculateBBWP(shared.indicatorData, bbwpConfig);
  }, [shared.indicatorData, bbwpConfig]);
  const bbwpValue = lastFiniteValue(bbwpResult?.bbwp);

  const explainResult = useMemo(() => {
    if (shared.explainOhlcv.length === 0) return null;
    return calculateBBWP(shared.explainOhlcv, bbwpConfig);
  }, [shared.explainOhlcv, bbwpConfig]);
  const bbwpExplainValue = lastFiniteValue(explainResult?.bbwp);

  const badges = useMemo(() => {
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

  const explainChart = useMemo(
    () =>
      shared.indicatorData.length === 0 ? null : (
        <BBWPChart
          data={shared.indicatorData}
          config={{
            ...bbwpConfig,
            colorType: "Spectrum",
            spectrumPreset: "5point",
            lineWidth: 2,
            maWidth: 2,
          }}
          height={EXPLAIN_DIALOG_CHART_HEIGHT}
          showTimeAxis={true}
          initialWindowDays={shared.indicatorWindowDays}
        />
      ),
    [bbwpConfig, shared.indicatorData, shared.indicatorWindowDays],
  );

  return (
    <IndicatorCardFrame
      title="Volatility"
      description="Percentile rank of bandwidth (detects compression vs expansion)."
      showPending={shared.showPending}
      isLoading={shared.isLoading}
      badges={badges}
      explain={
        <IndicatorExplainDialog
          coinId={shared.coinId}
          tokenName={shared.tokenName}
          tokenSymbol={shared.tokenSymbol}
          tokenLogoUrl={shared.tokenLogoUrl}
          isPricePending={shared.showPending}
          timeframe={shared.timeframe}
          indicatorTitle="Volatility"
          indicatorChart={explainChart}
          indicatorContext={badges}
          indicatorType="bbwp"
          marketContext={shared.marketContext}
          snapshot={{
            bbwpCurrent: bbwpExplainValue,
            bbwpHistory: (explainResult?.bbwp ?? []).map((point) =>
              typeof point.value === "number" && Number.isFinite(point.value)
                ? point.value
                : null,
            ),
            lookback: bbwpConfig.lookback,
          }}
          disabled={shared.showPending || shared.isLoading}
        />
      }
    >
      <BBWPChart
        data={shared.indicatorData}
        config={{
          ...bbwpConfig,
          colorType: "Spectrum",
          spectrumPreset: "5point",
          lineWidth: 2,
          maWidth: 2,
        }}
        height={250}
        showTimeAxis={true}
        initialWindowDays={shared.indicatorWindowDays}
      />
    </IndicatorCardFrame>
  );
}

/** RSI divergence detection card ("Divergences"). */
function DivergencesCard({ shared }: { shared: IndicatorCardSharedProps }) {
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
  const result = useMemo(() => {
    if (shared.indicatorData.length === 0) return null;
    return calculateRsiDivergences(shared.indicatorData, rsiDivergencesConfig);
  }, [shared.indicatorData, rsiDivergencesConfig]);
  const rsiValue = lastFiniteValue(result?.rsiSeries);
  const latestType: RsiDivergenceType | null = result?.divergences.length
    ? result.divergences[result.divergences.length - 1]?.type ?? null
    : null;
  const reverseLevels = result?.reverseLevels;

  const explainResult = useMemo(() => {
    if (shared.explainOhlcv.length === 0) return null;
    return calculateRsiDivergences(shared.explainOhlcv, rsiDivergencesConfig);
  }, [shared.explainOhlcv, rsiDivergencesConfig]);
  const explainRsiValue = lastFiniteValue(explainResult?.rsiSeries);

  const badges = useMemo(() => {
    const type = latestType;
    const bullish = type === "bullish" || type === "h_bullish";
    return (
      <>
        <RsiStat value={rsiValue} />
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
        <ReverseRsiStats levels={reverseLevels ?? []} />
      </>
    );
  }, [latestType, rsiValue, reverseLevels]);

  const explainChart = useMemo(
    () =>
      shared.indicatorData.length === 0 ? null : (
        <RsiDivergencesChart
          data={shared.indicatorData}
          height={EXPLAIN_DIALOG_CHART_HEIGHT}
          showTimeAxis={true}
          initialWindowDays={shared.indicatorWindowDays}
          showLabels={true}
        />
      ),
    [shared.indicatorData, shared.indicatorWindowDays],
  );

  return (
    <IndicatorCardFrame
      title="Divergences"
      description="Compares RSI pivots against price pivots to flag bullish and bearish divergence."
      showPending={shared.showPending}
      isLoading={shared.isLoading}
      badges={badges}
      explain={
        <IndicatorExplainDialog
          coinId={shared.coinId}
          tokenName={shared.tokenName}
          tokenSymbol={shared.tokenSymbol}
          tokenLogoUrl={shared.tokenLogoUrl}
          isPricePending={shared.showPending}
          timeframe={shared.timeframe}
          indicatorTitle="RSI Divergences"
          indicatorChart={explainChart}
          indicatorContext={badges}
          indicatorType="rsiDivergences"
          marketContext={shared.marketContext}
          snapshot={{
            rsiCurrent: explainRsiValue,
            rsiHistory: (explainResult?.rsiSeries ?? []).map((point) =>
              typeof point.value === "number" && Number.isFinite(point.value)
                ? point.value
                : null,
            ),
            divergences: (explainResult?.divergences ?? [])
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
            reverseLevels: (explainResult?.reverseLevels ?? []).map(
              (level) => ({
                target: level.target,
                price: level.price,
              }),
            ),
            settings: rsiDivergencesConfig,
          }}
          disabled={shared.showPending || shared.isLoading}
        />
      }
    >
      <RsiDivergencesChart
        data={shared.indicatorData}
        height={250}
        showTimeAxis={true}
        initialWindowDays={shared.indicatorWindowDays}
        showLabels={true}
      />
    </IndicatorCardFrame>
  );
}

export function TokenIndicatorsSection(props: TokenIndicatorsSectionProps) {
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

  const displaySymbol = props.metricsData?.symbol ?? props.tokenSymbol;
  const explainTokenLogoUrl = useMemo(
    () => getTokenLogoURL(displaySymbol, props.tokenImage),
    [displaySymbol, props.tokenImage],
  );

  const marketContext: IndicatorMarketContext = {
    priceUsd: props.metricsData?.current_price ?? null,
    change24hPct: props.metricsData?.price_change_percentage_24h ?? null,
    volume24hUsd: props.metricsData?.total_volume ?? null,
    marketCapUsd: props.metricsData?.market_cap ?? null,
    closeHistory: indicatorExplainCloseHistory,
    closeTimesUtc: indicatorExplainCloseTimesUtc,
  };

  const shared: IndicatorCardSharedProps = {
    coinId: props.coinId,
    tokenName: props.tokenName,
    tokenSymbol: displaySymbol,
    tokenLogoUrl: explainTokenLogoUrl,
    timeframe: props.timeframe,
    showPending: props.showPending,
    isLoading: props.isLoading,
    indicatorData: props.indicatorData,
    indicatorWindowDays: props.indicatorWindowDays,
    explainOhlcv,
    marketContext,
  };

  return (
    <>
      <div className="col-span-12 mt-16 mb-4">
        <span className="text-2xl font-semibold text-white">
          Technical Indicators
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 col-span-12 md:grid-cols-12">
        <MomentumMoneyFlowCard shared={shared} />
        <BollingerBandsCard shared={shared} />
        <VolatilityCard shared={shared} />
        <DivergencesCard shared={shared} />
      </div>
    </>
  );
}
