/**
 * Pure technical-metric math for cron-side precomputation.
 *
 * KEEP IN SYNC with apps/app/src/lib/smart-screener/technical-metrics.ts —
 * Convex code cannot import from src/lib, so the volatility definition
 * (stddev of log returns, expressed in percent points) is duplicated here.
 */

function stddev(values: ReadonlyArray<number>): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  const out = Math.sqrt(variance);
  return Number.isFinite(out) ? out : null;
}

/**
 * Stddev of log returns over a price series, in percent points.
 * Same definition as `pctVolatility` in src/lib/smart-screener/technical-metrics.ts
 * (which operates on {timestamp, price} points; this takes the raw price array
 * from CoinGecko's `sparkline_in_7d.price` — hourly, ~168 points).
 */
export function computeVolatilityPctFromPrices(
  prices: ReadonlyArray<number> | null | undefined,
): number | null {
  if (!prices || prices.length < 3) return null;
  const returns: Array<number> = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    const next = prices[i];
    if (typeof prev !== "number" || typeof next !== "number") continue;
    if (!Number.isFinite(prev) || !Number.isFinite(next) || prev <= 0) continue;
    returns.push(Math.log(next / prev));
  }
  const s = stddev(returns);
  if (s == null) return null;
  return s * 100;
}

export function toFiniteOrUndefined(
  value: number | null | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
