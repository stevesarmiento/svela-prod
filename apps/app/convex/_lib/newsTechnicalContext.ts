/**
 * Minimal indicator math for the news sentiment job's technical context.
 * Copied from src/lib/overview-daily-brief.ts — Convex functions cannot
 * import from src/, so definitions must stay in sync manually (same rule
 * as convex/_lib/technicalMetrics.ts).
 */

export function computeRsiLast(
  closes: ReadonlyArray<number>,
  period = 14,
): number | null {
  if (period <= 1) return null;
  if (!closes || closes.length < period + 1) return null;

  const deltas: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (typeof a !== "number" || typeof b !== "number") continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    deltas.push(b - a);
  }
  if (deltas.length < period) return null;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const d = deltas[i]!;
    if (d >= 0) avgGain += d;
    else avgLoss += -d;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < deltas.length; i++) {
    const d = deltas[i]!;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Number.isFinite(rsi) ? rsi : null;
}

export type TrendLabel = "up" | "down" | "flat" | "unknown";

export function trendFromCloses(
  closes: ReadonlyArray<number>,
  lookback = 12,
): TrendLabel {
  if (!closes || closes.length < 2) return "unknown";
  const slice = closes.slice(-Math.max(2, lookback));
  const first = slice[0];
  const last = slice[slice.length - 1];
  if (typeof first !== "number" || typeof last !== "number") return "unknown";
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0)
    return "unknown";
  const pct = ((last - first) / first) * 100;
  if (!Number.isFinite(pct)) return "unknown";
  if (pct > 1) return "up";
  if (pct < -1) return "down";
  return "flat";
}
