import type { ScreenFilterOp, TakerContext } from "./screening-dsl";

/**
 * Golden prompt set for the smart-screener interpreter.
 *
 * - Replayed against a running dev server by `src/scripts/eval-smart-screener.ts`
 *   (internal debug route, `interpretOnly: true`, cache bypassed).
 * - Structurally validated (expected filters parse through ScreeningDslSchema)
 *   in `screening-dsl.test.ts` — no network needed there.
 *
 * Expectation semantics:
 * - `filters`: order-insensitive subset match unless `filtersExact` is true.
 *   `tolerancePct` allows value wiggle (e.g. model emitting 0.549 for 55%).
 * - `sort`/`limit`/`universe`/`takerContext`: asserted only when present.
 * - `minConfidence`/`maxConfidence`: gate assertions — ambiguous prompts
 *   should come back LOW confidence (maxConfidence), never silently apply.
 */
export type SmartScreenerEvalTag =
  | "market"
  | "technical"
  | "taker"
  | "mixed"
  | "ambiguous"
  | "units"
  | "sort";

export interface ExpectedFilter {
  metricId: string;
  op: ScreenFilterOp;
  /** Accept any of these ops instead of `op` (for genuinely ambiguous phrasing). */
  opAnyOf?: ReadonlyArray<ScreenFilterOp>;
  value: number;
  /** Allowed relative deviation for `value`, in percent (default exact). */
  tolerancePct?: number;
}

export interface SmartScreenerEvalCase {
  id: string;
  prompt: string;
  tags: ReadonlyArray<SmartScreenerEvalTag>;
  expect: {
    filters?: ReadonlyArray<ExpectedFilter>;
    /** When true, the parsed filter list must contain ONLY the expected filters. */
    filtersExact?: boolean;
    sort?: { metricId: string; order: "asc" | "desc" } | null;
    limit?: number;
    universe?: "all" | "current" | "watchlist";
    takerContext?: Partial<TakerContext>;
    minConfidence?: number;
    maxConfidence?: number;
  };
}

export const SMART_SCREENER_EVAL_CASES: ReadonlyArray<SmartScreenerEvalCase> = [
  // ---------------------------------------------------------------- market
  {
    id: "mkt-fdv-volume",
    prompt: "fdv under $200m, volume over $5m",
    tags: ["market", "units"],
    expect: {
      filters: [
        { metricId: "fdv_usd", op: "lt", value: 200_000_000 },
        { metricId: "volume_24h_usd", op: "gt", value: 5_000_000 },
      ],
      filtersExact: true,
      minConfidence: 0.6,
    },
  },
  {
    id: "mkt-mcap-change",
    prompt: "top coins with market cap over $5b and 24h change above 10%",
    tags: ["market", "sort"],
    expect: {
      filters: [
        { metricId: "market_cap_usd", op: "gt", value: 5_000_000_000 },
        { metricId: "price_change_24h_pct", op: "gt", value: 10 },
      ],
      minConfidence: 0.6,
    },
  },
  {
    id: "mkt-price-under-dollar",
    prompt: "coins under $1",
    tags: ["market"],
    expect: {
      filters: [{ metricId: "price_usd", op: "lt", value: 1 }],
      minConfidence: 0.6,
    },
  },
  {
    id: "mkt-mcap-compact-no-dollar",
    prompt: "market cap above 250m",
    tags: ["market", "units"],
    expect: {
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 250_000_000 }],
      minConfidence: 0.6,
    },
  },
  {
    id: "mkt-mcap-billions",
    prompt: "mcap over 1.5b",
    tags: ["market", "units"],
    expect: {
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 1_500_000_000 }],
      minConfidence: 0.6,
    },
  },
  {
    id: "mkt-rank-top100",
    prompt: "top 100 coins by market cap",
    tags: ["market", "sort"],
    expect: {
      sort: { metricId: "market_cap_usd", order: "desc" },
      limit: 100,
      minConfidence: 0.6,
    },
  },
  {
    id: "mkt-rank-filter",
    prompt: "rank better than 50",
    tags: ["market"],
    expect: {
      // "better than 50" is ambiguous between < and <= — accept both.
      filters: [
        {
          metricId: "market_cap_rank",
          op: "lt",
          opAnyOf: ["lt", "lte"],
          value: 50,
          tolerancePct: 0,
        },
      ],
      minConfidence: 0.5,
    },
  },
  {
    id: "mkt-gainers",
    prompt: "only green coins today",
    tags: ["market"],
    expect: {
      filters: [{ metricId: "price_change_24h_pct", op: "gt", value: 0 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "mkt-losers",
    prompt: "coins in the red over the last 24 hours",
    tags: ["market"],
    expect: {
      filters: [{ metricId: "price_change_24h_pct", op: "lt", value: 0 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "mkt-ath-drawdown",
    prompt: "down more than 80% from all time high",
    tags: ["market"],
    expect: {
      filters: [{ metricId: "ath_drawdown_pct", op: "gt", value: 80 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "mkt-atl-upside",
    prompt: "up at least 300% from all time low",
    tags: ["market"],
    expect: {
      filters: [{ metricId: "atl_upside_pct", op: "gte", value: 300 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "mkt-volume-min",
    prompt: "24h volume of at least $50 million",
    tags: ["market", "units"],
    expect: {
      filters: [{ metricId: "volume_24h_usd", op: "gte", value: 50_000_000 }],
      minConfidence: 0.6,
    },
  },
  {
    id: "mkt-multi-band",
    prompt: "market cap between (use two filters) above 100m and below 1b",
    tags: ["market", "units"],
    expect: {
      filters: [
        { metricId: "market_cap_usd", op: "gt", value: 100_000_000 },
        { metricId: "market_cap_usd", op: "lt", value: 1_000_000_000 },
      ],
      minConfidence: 0.5,
    },
  },
  {
    id: "mkt-range-24h",
    prompt: "24h high-low range above 15%",
    tags: ["market"],
    expect: {
      filters: [{ metricId: "range_24h_pct", op: "gt", value: 15 }],
      minConfidence: 0.5,
    },
  },

  // ------------------------------------------------------------- technical
  {
    id: "tech-7d-return",
    prompt: "7d return above 25% with market cap over $500m",
    tags: ["technical", "mixed"],
    expect: {
      filters: [
        { metricId: "return_7d_pct", op: "gt", value: 25 },
        { metricId: "market_cap_usd", op: "gt", value: 500_000_000 },
      ],
      minConfidence: 0.6,
    },
  },
  {
    id: "tech-30d-down",
    prompt: "coins that lost more than 20% in the past month",
    tags: ["technical"],
    expect: {
      filters: [{ metricId: "return_30d_pct", op: "lt", value: -20 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "tech-weekly-winners",
    prompt: "best performers this week",
    tags: ["technical", "sort"],
    expect: {
      sort: { metricId: "return_7d_pct", order: "desc" },
      minConfidence: 0.5,
    },
  },
  {
    id: "tech-low-vol",
    prompt: "low volatility coins, weekly volatility under 2%",
    tags: ["technical"],
    expect: {
      filters: [{ metricId: "volatility_7d_pct", op: "lt", value: 2 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "tech-monthly-up",
    prompt: "up over 50% in 30 days",
    tags: ["technical"],
    expect: {
      filters: [{ metricId: "return_30d_pct", op: "gt", value: 50 }],
      minConfidence: 0.5,
    },
  },

  // ----------------------------------------------------------------- taker
  {
    id: "taker-buy-ratio",
    prompt: "buy ratio above 55%",
    tags: ["taker", "units"],
    expect: {
      filters: [{ metricId: "taker_buy_ratio", op: "gt", value: 0.55 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "taker-buy-gt-sell",
    prompt: "more buying than selling",
    tags: ["taker"],
    expect: {
      filters: [{ metricId: "taker_buy_ratio", op: "gt", value: 0.5 }],
      minConfidence: 0.4,
    },
  },
  {
    id: "taker-net-buy",
    prompt: "net buy over $10m",
    tags: ["taker", "units"],
    expect: {
      filters: [{ metricId: "taker_net_buy_usd", op: "gt", value: 10_000_000 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "taker-net-sell",
    prompt: "net selling of at least 5 million dollars",
    tags: ["taker", "units"],
    expect: {
      filters: [
        {
          metricId: "taker_net_buy_usd",
          op: "lte",
          value: -5_000_000,
          tolerancePct: 0,
        },
      ],
      minConfidence: 0.4,
    },
  },
  {
    id: "taker-exchange-scope",
    prompt: "taker buy ratio above 60% on Binance",
    tags: ["taker"],
    expect: {
      filters: [{ metricId: "taker_buy_ratio", op: "gt", value: 0.6 }],
      takerContext: { exchange: "Binance" },
      minConfidence: 0.5,
    },
  },
  {
    id: "taker-range-scope",
    prompt: "taker volume above $100m in the last 4 hours",
    tags: ["taker"],
    expect: {
      filters: [
        { metricId: "taker_total_volume_usd", op: "gt", value: 100_000_000 },
      ],
      takerContext: { range: "4h" },
      minConfidence: 0.5,
    },
  },

  // ----------------------------------------------------------------- mixed
  {
    id: "mixed-taker-market",
    prompt: "market cap over $1b with buy ratio above 55%",
    tags: ["mixed", "taker"],
    expect: {
      filters: [
        { metricId: "market_cap_usd", op: "gt", value: 1_000_000_000 },
        { metricId: "taker_buy_ratio", op: "gt", value: 0.55 },
      ],
      minConfidence: 0.5,
    },
  },
  {
    id: "mixed-tech-market-sort",
    prompt: "mid caps above 100m, sorted by 7d return, top 25",
    tags: ["mixed", "sort"],
    expect: {
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 100_000_000 }],
      sort: { metricId: "return_7d_pct", order: "desc" },
      limit: 25,
      minConfidence: 0.5,
    },
  },
  {
    id: "mixed-three-way",
    prompt: "volume over 20m, up this week, net buying positive",
    tags: ["mixed", "taker", "technical"],
    expect: {
      filters: [
        { metricId: "volume_24h_usd", op: "gt", value: 20_000_000 },
        { metricId: "return_7d_pct", op: "gt", value: 0 },
        { metricId: "taker_net_buy_usd", op: "gt", value: 0 },
      ],
      minConfidence: 0.4,
    },
  },

  {
    id: "mixed-messy-real-user",
    // Verbatim real user prompt (typos included) that truncated under the old
    // 600-token thinking-inclusive cap. "moved less than $5" is a signed USD
    // move — we only assert the unambiguous parts (mcap + volume) plus that a
    // 24h-move filter exists in some form via minConfidence.
    prompt:
      "I want to see anything below 25m marketcap, that has moved less than 5$ in the last 24h wit more volume than 20m",
    tags: ["mixed", "units"],
    expect: {
      filters: [
        { metricId: "market_cap_usd", op: "lt", value: 25_000_000 },
        { metricId: "volume_24h_usd", op: "gt", value: 20_000_000 },
      ],
      minConfidence: 0.5,
    },
  },

  // ----------------------------------------------------------------- units
  {
    id: "units-small-percent",
    prompt: "24h change greater than 0.5%",
    tags: ["units"],
    expect: {
      // THE regression case: 0.5 must stay 0.5 percent points, never 50.
      filters: [
        {
          metricId: "price_change_24h_pct",
          op: "gt",
          value: 0.5,
          tolerancePct: 0,
        },
      ],
      minConfidence: 0.5,
    },
  },
  {
    id: "units-decimal-usd",
    prompt: "price above $0.05",
    tags: ["units"],
    expect: {
      filters: [
        { metricId: "price_usd", op: "gt", value: 0.05, tolerancePct: 0 },
      ],
      minConfidence: 0.6,
    },
  },
  {
    id: "units-bn-suffix",
    prompt: "fdv below 2bn",
    tags: ["units"],
    expect: {
      filters: [{ metricId: "fdv_usd", op: "lt", value: 2_000_000_000 }],
      minConfidence: 0.5,
    },
  },
  {
    id: "units-ratio-decimal",
    prompt: "buy ratio over 0.7",
    tags: ["units", "taker"],
    expect: {
      filters: [{ metricId: "taker_buy_ratio", op: "gt", value: 0.7 }],
      minConfidence: 0.4,
    },
  },
  {
    id: "units-trillion",
    prompt: "market cap above $1t",
    tags: ["units"],
    expect: {
      filters: [
        { metricId: "market_cap_usd", op: "gt", value: 1_000_000_000_000 },
      ],
      minConfidence: 0.6,
    },
  },

  // ------------------------------------------------------------------ sort
  {
    id: "sort-volume-desc",
    prompt: "highest volume first",
    tags: ["sort"],
    expect: {
      sort: { metricId: "volume_24h_usd", order: "desc" },
      minConfidence: 0.5,
    },
  },
  {
    id: "sort-price-asc",
    prompt: "cheapest coins first",
    tags: ["sort"],
    expect: {
      sort: { metricId: "price_usd", order: "asc" },
      minConfidence: 0.4,
    },
  },
  {
    id: "sort-limit",
    prompt: "top 10 by 24h volume",
    tags: ["sort"],
    expect: {
      sort: { metricId: "volume_24h_usd", order: "desc" },
      limit: 10,
      minConfidence: 0.5,
    },
  },

  // ------------------------------------------------------------- ambiguous
  {
    id: "amb-vibes",
    prompt: "good coins to buy",
    tags: ["ambiguous"],
    expect: { maxConfidence: 0.5 },
  },
  {
    id: "amb-moon",
    prompt: "what will moon next week?",
    tags: ["ambiguous"],
    expect: { maxConfidence: 0.5 },
  },
  {
    id: "amb-empty-metric",
    prompt: "coins with strong fundamentals and good tokenomics",
    tags: ["ambiguous"],
    expect: { maxConfidence: 0.5 },
  },
  {
    id: "amb-unsupported-metric",
    prompt: "TVL above $500m",
    tags: ["ambiguous"],
    expect: { maxConfidence: 0.6 },
  },
] as const;
