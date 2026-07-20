import type { MarketsMetricDefinition } from "./metric-catalog";

/**
 * Technical metrics read PRECOMPUTED row columns (return7dPct / return30dPct /
 * volatility7dPct), written by the 4h Convex top-markets cron from CoinGecko's
 * 7d/30d change + sparkline data.
 *
 * Definitions (return = simple pct change; volatility = stddev of log returns
 * in percent points) live in convex/_lib/technicalMetrics.ts — keep in sync.
 *
 * Metric ids are stable: they predate precomputation (the old implementation
 * fetched per-coin price series at request time), so existing prompts, cached
 * interpretations, and shared URLs keep working.
 */
export const SMART_SCREENER_TECHNICAL_METRICS: ReadonlyArray<MarketsMetricDefinition> =
  [
    {
      id: "return_7d_pct",
      label: "7d return (%)",
      unit: "percent",
      synonyms: ["7d return", "return 7d", "weekly return", "past week return"],
      source: "markets",
      getValue: (r) =>
        typeof r.return7dPct === "number" ? r.return7dPct : null,
    },
    {
      id: "return_30d_pct",
      label: "30d return (%)",
      unit: "percent",
      synonyms: [
        "30d return",
        "return 30d",
        "monthly return",
        "past month return",
      ],
      source: "markets",
      getValue: (r) =>
        typeof r.return30dPct === "number" ? r.return30dPct : null,
    },
    {
      id: "volatility_7d_pct",
      label: "7d volatility (%)",
      unit: "percent",
      synonyms: [
        "7d volatility",
        "volatility 7d",
        "weekly volatility",
        "volatility squeeze",
        "coiled",
        "tight range",
        "consolidating",
        "vol 7d",
      ],
      description: "Stddev of log returns over the last 7d (percent points).",
      source: "markets",
      getValue: (r) =>
        typeof r.volatility7dPct === "number" ? r.volatility7dPct : null,
    },
  ] as const;

export const SMART_SCREENER_TECHNICAL_METRIC_IDS: ReadonlyArray<string> =
  SMART_SCREENER_TECHNICAL_METRICS.map((m) => m.id);
