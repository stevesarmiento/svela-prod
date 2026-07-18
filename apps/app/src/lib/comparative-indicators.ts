"use client";

import { calculateBBWP } from "@/hooks/market-vision/bbwp";
import { toDailyCloses } from "@/lib/comparative-stats";

/**
 * BBWP (Bollinger Band Width Percentile, 0-100) on DAILY closes — same
 * `calculateBBWP` + default config as the token page's BBWP chart, so the
 * number means the same thing everywhere. <20 = volatility squeeze,
 * >80 = expansion climax.
 *
 * Client-only: keeps the market-vision math out of the compare API route's
 * bundle (which imports comparative-stats for the schema/formatter).
 */
export function computeDailyBbwpPct(
  series: Array<{ time: unknown; value: number }>,
): number | null {
  const daily = toDailyCloses(series);
  if (daily.closes.length < 20) return null;

  // Synthetic OHLCV from daily closes: the default BBWP config reads only
  // the close, so open/high/low/volume are irrelevant.
  const ohlcv = daily.days.map((day, i) => {
    const close = daily.closes[i]!;
    return {
      time: day * 86400,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    };
  });

  const result = calculateBBWP(ohlcv);
  const last = result.bbwp[result.bbwp.length - 1];
  return typeof last?.value === "number" && Number.isFinite(last.value)
    ? last.value
    : null;
}
