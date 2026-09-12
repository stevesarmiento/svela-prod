"use client";

import { OverviewPerformanceChart } from "@/components/charts/overview-performance-chart";
import { formatUsdPrice } from "@/lib/format-usd";
import type { BreadthStats } from "@/lib/overview-daily-brief";
import { Badge } from "@v1/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card";
import { cn } from "@v1/ui/cn";
import type { ComponentProps } from "react";
import { IconTriangleFill } from "symbols-react";
import { TimeScaleSelector } from "../charts/_components/multi-line-lightweight-time-scale-selector";
import {
  type BreadthGroupRow,
  PortfolioBreadthSection,
} from "./overview-portfolio-breadth";

/** Matches watchlist screener “Daily performance” cell (USD + Badge + %). */
function ChartRangePerformanceLabel(props: {
  deltaUsd: number;
  deltaPct: number;
}) {
  const { deltaUsd, deltaPct } = props;
  const isPositive = deltaUsd > 0;
  const isNegative = deltaUsd < 0;
  const isNeutral = !isPositive && !isNegative;
  const usdSign = isPositive ? "+" : isNegative ? "-" : "";

  return (
    <div className="mt-2 inline-flex flex-wrap items-center justify-start gap-2">
      <span
        className={cn(
          "font-berkeley-mono text-[11px] tabular-nums",
          isPositive && "text-emerald-400",
          isNegative && "text-rose-400",
          isNeutral && "text-muted-foreground",
        )}
      >
        {`${usdSign}${formatUsdPrice(Math.abs(deltaUsd))}`}
      </span>
      <Badge
        variant={
          isPositive ? "success" : isNegative ? "destructive" : "outline"
        }
        className={cn(
          "h-5 px-1.5 font-berkeley-mono text-[11px] tabular-nums gap-1",
          isNeutral &&
            "border-zinc-200/60 text-muted-foreground dark:border-white/10",
        )}
      >
        <IconTriangleFill
          aria-hidden="true"
          className={cn(
            "size-[4px] shrink-0 fill-current",
            isNegative && "rotate-180",
          )}
        />
        {Math.abs(deltaPct).toFixed(2)}%
      </Badge>
    </div>
  );
}

export interface PortfolioValueCardProps {
  displayValueUsd: number;
  hasHoldings: boolean;
  rangeChange: { deltaUsd: number; deltaPct: number; isAvailable: boolean };
  chartNote: string | null;
  activeTimeScale: string;
  setActiveTimeScale: (scale: string) => void;
  portfolioChartPoints: ComponentProps<
    typeof OverviewPerformanceChart
  >["portfolioPoints"];
  marketPoints: ComponentProps<typeof OverviewPerformanceChart>["marketPoints"];
  onScrub: (time: number | null) => void;
  breadth: BreadthStats | null;
  breadthGroups: BreadthGroupRow[];
  breadthLoading: boolean;
}

/**
 * Left column: chromeless portfolio value + performance chart, then a card
 * with the 24h breadth breakdown.
 */
export function PortfolioValueCard({
  displayValueUsd,
  hasHoldings,
  rangeChange,
  chartNote,
  activeTimeScale,
  setActiveTimeScale,
  portfolioChartPoints,
  marketPoints,
  onScrub,
  breadth,
  breadthGroups,
  breadthLoading,
}: PortfolioValueCardProps) {
  return (
    <>
      <section aria-label="Portfolio value" className="relative">
        <div className="absolute top-0 left-2 z-10 flex flex-col items-start text-left">
          <div className="text-pretty text-balance text-3xl tabular-nums text-zinc-950 dark:text-white">
            {formatUsdPrice(displayValueUsd)}
          </div>
          {hasHoldings && rangeChange.isAvailable ? (
            <ChartRangePerformanceLabel
              deltaUsd={rangeChange.deltaUsd}
              deltaPct={rangeChange.deltaPct}
            />
          ) : null}
          {hasHoldings && chartNote ? (
            <div className="mt-3 text-[11px] text-zinc-600 dark:text-white/60">
              {chartNote}
            </div>
          ) : null}
        </div>

        {/* Performance chart */}
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
              maskImage:
                "radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)",
            }}
          />
          <div className="flex items-center justify-end px-2 pb-2">
            <TimeScaleSelector
              activeTimeScale={activeTimeScale}
              setActiveTimeScale={setActiveTimeScale}
            />
          </div>
          <div>
            {!hasHoldings ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-zinc-600 dark:text-white/60">
                No holdings to chart yet.
              </div>
            ) : (
              <OverviewPerformanceChart
                portfolioPoints={portfolioChartPoints}
                marketPoints={marketPoints}
                height={240}
                onHover={onScrub}
                note={chartNote}
              />
            )}
          </div>
        </div>
      </section>

      <Card
        className={cn(
          "bg-white dark:bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] overflow-hidden shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)] will-change-auto",
        )}
      >
        <CardHeader className="p-0">
          <CardTitle className="sr-only mb-0 text-pretty text-balance text-sm font-medium text-zinc-600 dark:text-white/60">
            24h breadth
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <PortfolioBreadthSection
            breadth={breadth}
            groups={breadthGroups}
            isLoading={breadthLoading}
          />

          {!hasHoldings ? (
            <p className="mt-4 text-pretty text-xs text-zinc-600 dark:text-white/60">
              Add a quantity to any watchlist coin to see your holdings value
              here.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

