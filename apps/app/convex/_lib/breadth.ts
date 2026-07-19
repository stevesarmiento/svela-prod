/**
 * Full-watchlist breadth aggregates.
 *
 * Lives in convex/_lib so Convex functions can use it without importing from
 * the Next.js app tree (Convex bundles independently via esbuild — app-side
 * imports like `next/headers` or `server-only` would break deployment).
 * The app re-exports these from `src/lib/overview-daily-brief.ts`.
 */

/**
 * Aggregates computed over the FULL watchlist (not just ranked movers) at
 * snapshot build time, so the brief can describe breadth across 70+ names
 * instead of extrapolating from the top handful.
 */
export type BreadthStats = {
  advancers: number;
  decliners: number;
  flat: number;
  medianChangePct: number;
  /** p90 − p10 of change percents — a real dispersion measure. */
  spreadPct: number;
  /** Names that moved at least ±5%. */
  bigMovers: number;
};

const BREADTH_FLAT_BAND_PCT = 0.5;
const BREADTH_BIG_MOVE_PCT = 5;

export function computeBreadthStats(changePcts: ReadonlyArray<number>): BreadthStats | null {
  const values = changePcts.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (p: number): number => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const loVal = sorted[lo] ?? 0;
    const hiVal = sorted[hi] ?? loVal;
    return loVal + (hiVal - loVal) * (idx - lo);
  };

  let advancers = 0;
  let decliners = 0;
  let flat = 0;
  for (const x of values) {
    if (x > BREADTH_FLAT_BAND_PCT) advancers++;
    else if (x < -BREADTH_FLAT_BAND_PCT) decliners++;
    else flat++;
  }

  return {
    advancers,
    decliners,
    flat,
    medianChangePct: quantile(0.5),
    spreadPct: quantile(0.9) - quantile(0.1),
    bigMovers: values.filter((x) => Math.abs(x) >= BREADTH_BIG_MOVE_PCT).length,
  };
}
