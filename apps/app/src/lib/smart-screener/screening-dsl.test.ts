/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"

import { ScreeningDslSchema } from "./screening-dsl"
import { SmartScreenerScreenResponseSchema } from "./screen-api"
import { SMART_SCREENER_EVAL_CASES } from "./screening-evals"
import { promptLooksLikeConstraints } from "./prompt-gating"

describe("ScreeningDslSchema", () => {
  test("rejects unknown metricId", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "not_a_metric", op: "gte", value: 1 }],
      sort: null,
      limit: 25,
      universe: "all",
    })
    expect(parsed.success).toBe(false)
  })

  test("coerces compact USD amounts", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "fdv_usd", op: "lt", value: "$10m" }],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.filters[0]?.value).toBe(10_000_000)
  })

  test("coerces compact USD amounts without $", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "fdv_usd", op: "lt", value: "200m" }],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.filters[0]?.value).toBe(200_000_000)
  })

  test("coerces percent points", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "price_change_24h_pct", op: "gte", value: "10%" }],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.filters[0]?.value).toBe(10)
  })

  test("defaults universe and limit", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 1_000_000 }],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.universe).toBe("all")
    expect(parsed.data.limit).toBe(250)
  })

  test("defaults limit when LLM returns null", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 1_000_000 }],
      limit: null,
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.limit).toBe(250)
  })

  test("eval cases: expected DSL is valid", () => {
    for (const c of SMART_SCREENER_EVAL_CASES) {
      const parsed = ScreeningDslSchema.safeParse(c.expectedDsl)
      expect(parsed.success).toBe(true)
    }
  })
})

describe("SmartScreenerScreenResponseSchema", () => {
  test("defaults technical warmup coverage fields", () => {
    const parsed = SmartScreenerScreenResponseSchema.safeParse({
      ok: true,
      confidence: 0.9,
      dsl: { filters: [], sort: null, limit: 10, universe: "all" },
      summary: "",
      resultIds: [],
      rows: [],
      coverage: {
        scanned: 0,
        matched: 0,
        maxRankScanned: null,
        missingByMetricId: {},
        warmupScheduled: false,
        warmupTopN: null,
      },
      userMessage: null,
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.coverage.marketChartWarmupRequestedCount).toBe(0)
    expect(parsed.data.coverage.marketChartWarmupDays).toEqual([])
  })
})

describe("promptLooksLikeConstraints", () => {
  test("detects constraint language", () => {
    expect(promptLooksLikeConstraints("fdv under 200m")).toBe(true)
    expect(promptLooksLikeConstraints("market cap > 500m")).toBe(true)
    expect(promptLooksLikeConstraints("between 1m and 5m")).toBe(true)
  })

  test("does not flag sort-only prompts", () => {
    expect(promptLooksLikeConstraints("volume descending")).toBe(false)
    expect(promptLooksLikeConstraints("top gainers")).toBe(false)
  })
})

