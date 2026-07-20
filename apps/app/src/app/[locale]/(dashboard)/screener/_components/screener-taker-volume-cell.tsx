"use client";

import { Badge } from "@v1/ui/badge";
import { cn } from "@v1/ui/cn";
import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Skeleton } from "@v1/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { IconTriangleFill } from "symbols-react";

import { TickMeter } from "@/components/tick-meter";
import { normalizeTakerRatio } from "@/lib/smart-screener/taker-metrics";
import { useScreenerTakerFlowContext } from "./screener-context";

/**
 * 24h order-flow snapshot for a row: TickMeter (analysis-dialog bar system)
 * plus the value in a Badge matching the daily-performance column. Balanced
 * flow (45-55% buys — most coins, most of the time) stays NEUTRAL GREY so the
 * column is quiet by default; color only appears when flow is genuinely
 * skewed: emerald >= 55% buys, rose <= 45% (the app's standard signal colors).
 * Data arrives in ONE batched ID-keyed request for the whole table.
 */
export function ScreenerTakerVolumeCell(props: { coinId: string }) {
  const { byId, isLoading } = useScreenerTakerFlowContext();
  const metrics = byId[props.coinId] ?? null;

  if (!metrics) {
    if (isLoading) {
      return <Skeleton className="h-4 w-28 rounded-full" />;
    }
    return (
      <span className="font-berkeley-mono text-[11px] text-muted-foreground/50">
        —
      </span>
    );
  }

  const buyRatio = normalizeTakerRatio(metrics.buyRatio);
  if (buyRatio == null || metrics.totalVolumeUsd <= 0) {
    return (
      <span className="font-berkeley-mono text-[11px] text-muted-foreground/50">
        —
      </span>
    );
  }

  const buyPct = buyRatio * 100;
  const skew: "buy" | "sell" | "neutral" =
    buyPct >= 55 ? "buy" : buyPct <= 45 ? "sell" : "neutral";

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-end gap-2">
          <TickMeter
            value={buyPct}
            min={0}
            max={100}
            origin={50}
            // Meter is ALWAYS directional (fill is tiny near 50, so it stays
            // quiet); only the badge gates color on the 45/55 skew band.
            className={buyPct >= 50 ? "text-emerald-400" : "text-rose-400"}
          />
          <Badge
            variant={
              skew === "buy"
                ? "success"
                : skew === "sell"
                  ? "destructive"
                  : "outline"
            }
            className={cn(
              "h-5 px-1.5 font-berkeley-mono text-[11px] tabular-nums gap-1",
              skew === "neutral" &&
                "bg-zinc-700/30 border-0 text-muted-foreground",
            )}
          >
            <IconTriangleFill
              aria-hidden="true"
              className={cn(
                "size-[4px] shrink-0 fill-current",
                buyPct < 50 && "rotate-180",
              )}
            />
            {/* Name the DOMINANT side: "43.7% buy" on a red pill read as a
                contradiction — buys at 43.7% means sells at 56.3%. */}
            {buyPct >= 50
              ? `${buyPct.toFixed(1)}%`
              : `${(100 - buyPct).toFixed(1)}%`}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="p-2.5 rounded-md max-w-xs text-[11px] font-normal tabular-nums"
      >
        <div className="space-y-0.5">
          <p>Buy ${formatLargeNumber(metrics.buyVolumeUsd)}</p>
          <p>Sell ${formatLargeNumber(metrics.sellVolumeUsd)}</p>
          <p className="text-muted-foreground">
            Taker volume across exchanges, last 24h
            {metrics.stale ? " (refreshing…)" : ""}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
