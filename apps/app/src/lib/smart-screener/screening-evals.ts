import type { ScreeningDsl } from "./screening-dsl"

export interface SmartScreenerEvalCase {
  prompt: string
  expectedDsl: ScreeningDsl
}

export const SMART_SCREENER_EVAL_CASES: ReadonlyArray<SmartScreenerEvalCase> = [
  {
    prompt: "fdv under $200m, volume over $5m",
    expectedDsl: {
      filters: [
        { metricId: "fdv_usd", op: "lt", value: 200_000_000 },
        { metricId: "volume_24h_usd", op: "gt", value: 5_000_000 },
      ],
      sort: null,
      limit: 250,
      universe: "all",
    },
  },
  {
    prompt: "top coins with market cap over $5b and 24h change above 10%",
    expectedDsl: {
      filters: [
        { metricId: "market_cap_usd", op: "gt", value: 5_000_000_000 },
        { metricId: "price_change_24h_pct", op: "gt", value: 10 },
      ],
      sort: { metricId: "market_cap_usd", order: "desc" },
      limit: 50,
      universe: "all",
    },
  },
  {
    prompt: "7d return above 25% with market cap over $500m",
    expectedDsl: {
      filters: [
        { metricId: "return_7d_pct", op: "gt", value: 25 },
        { metricId: "market_cap_usd", op: "gt", value: 500_000_000 },
      ],
      sort: { metricId: "return_7d_pct", order: "desc" },
      limit: 100,
      universe: "all",
    },
  },
] as const

