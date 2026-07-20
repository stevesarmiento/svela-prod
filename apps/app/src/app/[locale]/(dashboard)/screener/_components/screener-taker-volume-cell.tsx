"use client";

import { cn } from "@v1/ui/cn";
import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Skeleton } from "@v1/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";

import { TickMeter } from "@/components/tick-meter";
import { normalizeTakerRatio } from "@/lib/smart-screener/taker-metrics";
import { useScreenerTakerFlowContext } from "./screener-context";

/**
 * 24h order-flow snapshot for a row: the SAME TickMeter bar system as the
 * analysis dialog's "Order Flow" stat (origin 50, green/red by side, numeric
 * value always beside it). Data arrives in ONE batched request for the whole
 * table (ID-keyed) — this replaced a per-row taker-history chart that cost a
 * network fetch per visible row.
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
  const bullish = buyPct >= 50;

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-end gap-2">
          <TickMeter
            value={buyPct}
            min={0}
            max={100}
            origin={50}
            className={bullish ? "text-emerald-400" : "text-rose-400"}
          />
          <span
            className={cn(
              "font-berkeley-mono text-[11px] tabular-nums",
              bullish ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {buyPct.toFixed(1)}% buy
          </span>
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
