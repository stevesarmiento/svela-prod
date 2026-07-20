import type { MetricUnit } from "./metric-catalog";

/**
 * Derivatives (taker buy/sell) metrics, sourced from CoinGlass exchange-list
 * snapshots stored in Convex — one snapshot per coin per range, optionally
 * scoped to a single exchange at execution time via `dsl.takerContext`.
 *
 * The scoped-snapshot shape matches the `overall` / per-exchange objects in
 * convex `coinglassTakerBuySellExchangeListSnapshots`.
 */
export interface TakerScopedSnapshotLike {
  buyRatio: number;
  sellRatio: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  totalVolumeUsd: number;
}

export interface TakerMetricDefinition {
  id: string;
  label: string;
  unit: MetricUnit;
  synonyms: ReadonlyArray<string>;
  description?: string;
  source: "taker";
  /** Signed metrics (net buy) opt out of the usd >= 0 validation. */
  allowNegative?: boolean;
  getValue: (snapshot: TakerScopedSnapshotLike) => number | null;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export const SMART_SCREENER_TAKER_METRICS: ReadonlyArray<TakerMetricDefinition> =
  [
    {
      id: "taker_buy_ratio",
      label: "Taker buy ratio",
      unit: "ratio",
      synonyms: [
        "buy ratio",
        "taker buy ratio",
        "buy pressure",
        "buy > sell",
        "buyers vs sellers",
      ],
      description:
        "Share of taker volume that is buys, 0..1 (0.55 means 55% buys).",
      source: "taker",
      getValue: (s) => finiteOrNull(s.buyRatio),
    },
    {
      id: "taker_buy_volume_usd",
      label: "Taker buy volume ($)",
      unit: "usd",
      synonyms: ["taker buy volume", "buy volume", "taker buys"],
      source: "taker",
      getValue: (s) => finiteOrNull(s.buyVolumeUsd),
    },
    {
      id: "taker_sell_volume_usd",
      label: "Taker sell volume ($)",
      unit: "usd",
      synonyms: ["taker sell volume", "sell volume", "taker sells"],
      source: "taker",
      getValue: (s) => finiteOrNull(s.sellVolumeUsd),
    },
    {
      id: "taker_total_volume_usd",
      label: "Taker total volume ($)",
      unit: "usd",
      synonyms: ["taker volume", "taker total volume", "derivatives volume"],
      source: "taker",
      getValue: (s) => finiteOrNull(s.totalVolumeUsd),
    },
    {
      id: "taker_net_buy_usd",
      label: "Taker net buy ($)",
      unit: "usd",
      synonyms: ["net buy", "net buying", "net taker buy", "net inflow"],
      description: "buyVolumeUsd - sellVolumeUsd; negative means net selling.",
      source: "taker",
      allowNegative: true,
      getValue: (s) => finiteOrNull(s.buyVolumeUsd - s.sellVolumeUsd),
    },
  ] as const;

export const SMART_SCREENER_TAKER_METRIC_IDS: ReadonlyArray<string> =
  SMART_SCREENER_TAKER_METRICS.map((m) => m.id);

export const TAKER_RANGES = ["1h", "4h", "12h", "24h", "7d"] as const;
export type TakerRange = (typeof TAKER_RANGES)[number];
