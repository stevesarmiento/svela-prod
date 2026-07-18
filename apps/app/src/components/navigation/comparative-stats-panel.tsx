"use client";

import React from "react";
import { Badge } from "@v1/ui/badge";
import { cn } from "@v1/ui/cn";
import { Skeleton } from "@v1/ui/skeleton";
import type { ComparativeStats } from "@/lib/comparative-stats";
import { ScrollArea } from "@v1/ui/scroll-area";
import { TickMeter } from "@/components/tick-meter";
import {
  MultiMiniPriceChart,
  type MultiMiniChartToken,
} from "./multi-mini-price-chart";

/**
 * Cross-asset sidebar for the multi-token analysis dialog: the same
 * precomputed numbers fed to the compare prompt (returns, vol/beta,
 * correlation matrix, momentum deltas), so the report can be sanity-checked
 * at a glance. Replaces the old per-token tab sidebar.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 space-y-2">
      <h3 className="text-[10px] uppercase font-medium text-white">{title}</h3>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="w-full h-[1px] my-3 bg-zinc-800/50 scale-125" />;
}

function pctClass(v: number | null): string {
  if (v === null) return "text-zinc-500";
  if (v > 0) return "text-green-400";
  if (v < 0) return "text-red-400";
  return "text-zinc-400";
}

function fmtPct(v: number | null, digits = 1): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function corrClass(v: number | null): string {
  if (v === null) return "text-zinc-600";
  if (v >= 0.8) return "text-white";
  if (v >= 0.5) return "text-zinc-300";
  if (v >= 0.2) return "text-zinc-500";
  if (v >= -0.2) return "text-zinc-600";
  return "text-red-400"; // negatively correlated — notable
}

function rsiBadge(rsi: number | null) {
  if (rsi === null) return null;
  const hot = rsi >= 70;
  const cold = rsi <= 30;
  if (!hot && !cold) return null;
  return (
    <Badge
      variant={hot ? "destructive" : "success"}
      className="h-4 px-1 text-[9px] font-normal leading-none"
    >
      {hot ? "hot" : "oversold"}
    </Badge>
  );
}

export function ComparativeStatsPanel({
  stats,
  expectedCount,
  chartTokens,
}: {
  stats: ComparativeStats | null;
  /** Number of tokens being collected — sizes the loading skeleton. */
  expectedCount: number;
  /** Per-token price series for the multi-line mini chart (as collected). */
  chartTokens?: MultiMiniChartToken[];
}) {
  if (!stats) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-[120px] w-full rounded-md" />
        <Skeleton className="h-3 w-24 rounded-full" />
        {Array.from({ length: Math.max(expectedCount, 2) * 3 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          <Skeleton key={i} className="h-3 w-full rounded-full" />
        ))}
      </div>
    );
  }

  const symbols = stats.tokens.map((t) => t.symbol.toUpperCase());
  const gridCols = "minmax(0,1.2fr) repeat(2, minmax(0,1fr))";

  // Shared meter domains so bar lengths compare ACROSS tokens.
  const maxAbsReturn = Math.max(
    1,
    ...stats.tokens.flatMap((t) =>
      [t.return7dPct, t.return30dPct].map((v) => Math.abs(v ?? 0)),
    ),
  );
  const maxVol = Math.max(
    1,
    ...stats.tokens.map((t) => t.volatility30dAnnualizedPct ?? 0),
  );

  const returnCell = (v: number | null) => (
    <span className="flex flex-col items-end gap-0.5">
      <span className={cn("font-berkeley-mono tabular-nums", pctClass(v))}>
        {fmtPct(v)}
      </span>
      {v !== null ? (
        <TickMeter
          value={v}
          min={-maxAbsReturn}
          max={maxAbsReturn}
          origin={0}
          className={cn("h-1.5 w-14", pctClass(v))}
        />
      ) : null}
    </span>
  );

  return (
    <ScrollArea hideScrollbar className="h-[75vh]">
      <div className="space-y-3 py-4">
        {/* Multi-line price chart (7d, % change) — same slot as the single
            dialog's MiniPriceChart */}
        {chartTokens && chartTokens.length >= 2 ? (
          <>
            <MultiMiniPriceChart tokens={chartTokens} />
            <Divider />
          </>
        ) : null}

        {/* Returns */}
        <Section title="Returns">
          <div
            className="grid items-center gap-y-1.5 text-[11px]"
            style={{ gridTemplateColumns: gridCols }}
          >
            <span className="text-[9px] uppercase tracking-wide text-zinc-500">Token</span>
            <span className="text-right text-[9px] uppercase tracking-wide text-zinc-500">7d</span>
            <span className="text-right text-[9px] uppercase tracking-wide text-zinc-500">30d</span>
            {stats.tokens.map((t) => (
              <React.Fragment key={t.id}>
                <span className="flex items-center gap-1 text-xs font-bold text-white">
                  {t.symbol.toUpperCase()}
                  {t.id === stats.benchmarkId ? (
                    <span className="text-[9px] font-normal text-zinc-500">bench</span>
                  ) : null}
                </span>
                {returnCell(t.return7dPct)}
                {returnCell(t.return30dPct)}
              </React.Fragment>
            ))}
          </div>
        </Section>

        <Divider />

        {/* Risk vs benchmark */}
        <Section title={`Risk vs ${stats.benchmarkSymbol.toUpperCase()}`}>
          <div
            className="grid items-center gap-y-1.5 text-[11px]"
            style={{ gridTemplateColumns: gridCols }}
          >
            <span className="text-[9px] uppercase tracking-wide text-zinc-500">Token</span>
            <span className="text-right text-[9px] uppercase tracking-wide text-zinc-500">Vol</span>
            <span className="text-right text-[9px] uppercase tracking-wide text-zinc-500">β</span>
            {stats.tokens.map((t) => (
              <React.Fragment key={t.id}>
                <span className="text-xs font-bold text-white">{t.symbol.toUpperCase()}</span>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="text-right font-berkeley-mono tabular-nums text-zinc-300">
                    {t.volatility30dAnnualizedPct === null
                      ? "—"
                      : `${t.volatility30dAnnualizedPct.toFixed(0)}%`}
                  </span>
                  {t.volatility30dAnnualizedPct !== null ? (
                    <TickMeter
                      value={t.volatility30dAnnualizedPct}
                      min={0}
                      max={maxVol}
                      className="h-1.5 w-14 text-zinc-400"
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-right font-berkeley-mono tabular-nums",
                    t.betaVsBenchmark !== null && t.betaVsBenchmark > 1.5
                      ? "text-amber-400"
                      : "text-zinc-300",
                  )}
                >
                  {t.betaVsBenchmark === null ? "—" : t.betaVsBenchmark.toFixed(2)}
                </span>
              </React.Fragment>
            ))}
          </div>
          <p className="text-[10px] leading-snug text-zinc-500">
            β: recent move per 1% {stats.benchmarkSymbol.toUpperCase()} move. Vol annualized from 30d daily returns.
          </p>
        </Section>

        <Divider />

        {/* Correlation matrix */}
        <Section title="Correlation (30d)">
          <div
            className="grid items-center gap-y-1 text-[11px]"
            style={{
              gridTemplateColumns: `minmax(0,1.1fr) repeat(${symbols.length}, minmax(0,1fr))`,
            }}
          >
            <span />
            {symbols.map((s) => (
              <span key={s} className="text-right text-[9px] uppercase tracking-wide text-zinc-500">
                {s}
              </span>
            ))}
            {stats.correlationMatrix.map((row, i) => (
              <React.Fragment key={symbols[i]}>
                <span className="text-xs font-bold text-white">{symbols[i]}</span>
                {row.map((v, j) => (
                  <span
                    key={`${symbols[i]}-${symbols[j]}`}
                    className={cn(
                      "text-right font-berkeley-mono tabular-nums",
                      i === j ? "text-zinc-700" : corrClass(v),
                    )}
                  >
                    {i === j ? "—" : v === null ? "—" : v.toFixed(2)}
                  </span>
                ))}
              </React.Fragment>
            ))}
          </div>
        </Section>

        <Divider />

        {/* Indicator posture: Wave Trend / Money Flow / RSI-BB / BBWP */}
        <Section title="Indicators">
          <div className="space-y-1.5">
            {stats.tokens.map((t) => {
              const squeeze = t.bbwpPct !== null && t.bbwpPct <= 20;
              const expansion = t.bbwpPct !== null && t.bbwpPct >= 80;
              const wtBullish = t.waveTrend?.includes("bullish");
              const wtBearish = t.waveTrend?.includes("bearish");
              return (
                <div key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                    {t.symbol.toUpperCase()}
                    {squeeze ? (
                      <Badge variant="outline" className="h-4 border-white/10 px-1 text-[9px] font-normal leading-none text-amber-400">
                        squeeze
                      </Badge>
                    ) : expansion ? (
                      <Badge variant="outline" className="h-4 border-white/10 px-1 text-[9px] font-normal leading-none text-rose-400">
                        expansion
                      </Badge>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2 font-berkeley-mono tabular-nums">
                    {t.waveTrend ? (
                      <span
                        className={cn(
                          wtBullish ? "text-green-400" : wtBearish ? "text-red-400" : "text-zinc-400",
                        )}
                        title={`Wave Trend: ${t.waveTrend}`}
                      >
                        WT {wtBullish ? "↑" : wtBearish ? "↓" : "·"}
                      </span>
                    ) : null}
                    {t.moneyFlow ? (
                      <span
                        className={cn(
                          t.moneyFlow.startsWith("inflow")
                            ? "text-green-400"
                            : t.moneyFlow.startsWith("outflow")
                              ? "text-red-400"
                              : "text-zinc-400",
                        )}
                        title={`Money Flow: ${t.moneyFlow}`}
                      >
                        MF {t.moneyFlow.startsWith("inflow") ? "in" : t.moneyFlow.startsWith("outflow") ? "out" : "·"}
                      </span>
                    ) : null}
                    <span className="text-zinc-400">
                      %B {t.bbPercentB === null ? "—" : t.bbPercentB.toFixed(2)}
                    </span>
                    <span
                      className={cn(
                        squeeze ? "text-amber-400" : expansion ? "text-rose-400" : "text-zinc-400",
                      )}
                    >
                      BBWP {t.bbwpPct === null ? "—" : t.bbwpPct.toFixed(0)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] leading-snug text-zinc-500">
            %B: RSI position within its Bollinger bands. BBWP ≤20 squeeze · ≥80 expansion.
          </p>
        </Section>

        <Divider />

        {/* Momentum & flow */}
        <Section title="Momentum & Flow">
          <div className="space-y-1.5">
            {stats.tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                  {t.symbol.toUpperCase()}
                  {rsiBadge(t.rsi)}
                </span>
                <span className="flex items-center gap-2 font-berkeley-mono tabular-nums">
                  <span className="flex items-center gap-1.5 text-zinc-400">
                    RSI {t.rsi === null ? "—" : t.rsi.toFixed(0)}
                    {t.rsi !== null ? (
                      <TickMeter
                        value={t.rsi}
                        min={0}
                        max={100}
                        className={cn(
                          "h-1.5 w-10",
                          t.rsi >= 70
                            ? "text-red-400"
                            : t.rsi <= 30
                              ? "text-green-400"
                              : "text-zinc-400",
                        )}
                      />
                    ) : null}
                  </span>
                  {/* Only show flow fields when the data source actually has them */}
                  {t.openInterestChangePct !== null ? (
                    <span className={pctClass(t.openInterestChangePct)}>
                      OIΔ {fmtPct(t.openInterestChangePct)}
                    </span>
                  ) : null}
                  {t.takerBuyRatio !== null ? (
                    <span
                      className={
                        t.takerBuyRatio > 0.5 ? "text-green-400" : "text-red-400"
                      }
                    >
                      buy {(t.takerBuyRatio * 100).toFixed(0)}%
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-snug text-zinc-500">
            Excess vs bench (7d / 30d):{" "}
            {stats.tokens
              .filter((t) => t.id !== stats.benchmarkId)
              .map((t) => {
                const pp = (v: number | null) =>
                  v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}pp`;
                return `${t.symbol.toUpperCase()} ${pp(t.excessReturn7dPct)} / ${pp(t.excessReturn30dPct)}`;
              })
              .join(" · ")}
          </p>
        </Section>
      </div>
    </ScrollArea>
  );
}
