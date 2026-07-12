/**
 * Shared freshness policy for chart series (priceHistory partitions).
 *
 * A `chartSeries` row exists per (coingeckoId, timeframe) and records the last
 * SUCCESSFUL upstream fetch (`lastFetchedAt`) — independent of whether any
 * point rows changed — plus the demand signal (`lastRequestedAt`) and the
 * scheduler queue key (`nextDueAt`).
 *
 * Key invariant: every CoinGecko market_chart/ohlc response contains the
 * ENTIRE requested window, so `lastFetchedAt != null` doubles as proof of
 * full coverage (fixes the young-coin warmup loop) and as series freshness
 * (fixes the "no-diff refresh can't clear staleness" loop).
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

/** Sentinel for series with no standing/recent demand: on-view warmup only. */
export const FAR_FUTURE_MS = 32503680000000; // 3000-01-01

/** Timeframes the scheduler manages (everything the frontend actually reads). */
export const CORE_TIMEFRAMES = [
  "1",
  "7",
  "14",
  "30",
  "90",
  "365",
  "730",
  "max",
  "1_ohlc",
  "7_ohlc",
] as const;

/**
 * Scheduler drain order. Class shares of each tick's allowance; unused share
 * rolls forward so the long tail degrades first but is never starved.
 */
export const TIMEFRAME_CLASSES: ReadonlyArray<{
  key: string;
  timeframes: ReadonlyArray<string>;
  share: number;
}> = [
  { key: "A", timeframes: ["1", "1_ohlc"], share: 0.5 },
  { key: "B", timeframes: ["7", "14", "7_ohlc", "30", "90"], share: 0.3 },
  { key: "C", timeframes: ["365", "730", "max"], share: 0.2 },
];

/**
 * Stale windows tuned to chart surfaces (moved from coingeckoReads so the
 * reader, warmup, and scheduler share one source of truth).
 */
export function getStaleWindowMs(timeframe: string): number {
  const isOhlc = timeframe.endsWith("_ohlc");
  const base = timeframe.replace(/_ohlc$/, "");
  if (isOhlc && base === "1") return 15 * MINUTE_MS;
  if (base === "1") return 10 * MINUTE_MS;
  if (base === "7") return 60 * MINUTE_MS;
  if (base === "14") return 30 * MINUTE_MS;
  if (base === "30") return 4 * HOUR_MS;
  if (base === "90") return 4 * HOUR_MS;
  if (base === "365") return 24 * HOUR_MS;
  if (base === "730") return 24 * HOUR_MS;
  if (base === "1825") return 24 * HOUR_MS;
  if (base === "max") return 24 * HOUR_MS;
  return 10 * MINUTE_MS;
}

/**
 * CoinGecko serves market_chart from a ~5min response cache; refreshing a
 * 1d series faster than this just burns budget on identical payloads.
 */
const MIN_REFRESH_INTERVAL_MS = 6 * MINUTE_MS;

/** Demand-age tiers: multiplier applied to the timeframe's stale window. */
const DEMAND_TIERS: ReadonlyArray<{ maxAgeMs: number; multiplier: number }> = [
  { maxAgeMs: 2 * HOUR_MS, multiplier: 1 },
  { maxAgeMs: 24 * HOUR_MS, multiplier: 2 },
  { maxAgeMs: 7 * DAY_MS, multiplier: 4 },
  { maxAgeMs: 14 * DAY_MS, multiplier: 6 },
];

/** Standing (watchlist/portfolio) coins never fall past this multiplier. */
const STANDING_FLOOR_MULTIPLIER = 6;

/**
 * How often a series should be refreshed given its demand.
 * Returns null for T2 (no standing, not viewed within 14d): on-view only.
 */
export function getEffectiveIntervalMs(args: {
  timeframe: string;
  now: number;
  lastRequestedAt: number | undefined;
  hasStanding: boolean;
}): number | null {
  const staleWindowMs = getStaleWindowMs(args.timeframe);
  const demandAgeMs = args.now - (args.lastRequestedAt ?? 0);

  let multiplier: number | null = null;
  for (const tier of DEMAND_TIERS) {
    if (demandAgeMs < tier.maxAgeMs) {
      multiplier = tier.multiplier;
      break;
    }
  }
  if (multiplier === null) {
    if (!args.hasStanding) return null;
    multiplier = STANDING_FLOOR_MULTIPLIER;
  }

  return Math.max(staleWindowMs * multiplier, MIN_REFRESH_INTERVAL_MS);
}

/** nextDueAt for a series that was just fetched successfully. */
export function computeNextDueAt(args: {
  timeframe: string;
  fetchedAt: number;
  lastRequestedAt: number | undefined;
  hasStanding: boolean;
}): number {
  const interval = getEffectiveIntervalMs({
    timeframe: args.timeframe,
    now: args.fetchedAt,
    lastRequestedAt: args.lastRequestedAt,
    hasStanding: args.hasStanding,
  });
  if (interval === null) return FAR_FUTURE_MS;
  return args.fetchedAt + interval;
}
