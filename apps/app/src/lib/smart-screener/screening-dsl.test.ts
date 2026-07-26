/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { promptLooksLikeConstraints } from "./prompt-gating";
import { SmartScreenerScreenResponseSchema } from "./screen-api";
import { ScreeningDslSchema, formatDslSummary } from "./screening-dsl";
import {
  SMART_SCREENER_TAKER_METRICS,
  normalizeTakerRatio,
} from "./taker-metrics";
import { SMART_SCREENER_EVAL_CASES } from "./screening-evals";

describe("ScreeningDslSchema", () => {
  test("rejects unknown metricId", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "not_a_metric", op: "gte", value: 1 }],
      sort: null,
      limit: 25,
      universe: "all",
    });
    expect(parsed.success).toBe(false);
  });

  test("coerces compact USD amounts", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "fdv_usd", op: "lt", value: "$10m" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.filters[0]?.value).toBe(10_000_000);
  });

  test("coerces compact USD amounts without $", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "fdv_usd", op: "lt", value: "200m" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.filters[0]?.value).toBe(200_000_000);
  });

  test("coerces percent points", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "price_change_24h_pct", op: "gte", value: "10%" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.filters[0]?.value).toBe(10);
  });

  test("coerces percent points with trailing whitespace", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "price_change_24h_pct", op: "gte", value: "10% " }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.filters[0]?.value).toBe(10);
  });

  test("small percent values stay as-is (no magnitude heuristic)", () => {
    // "24h change > 0.5%" must mean 0.5 percentage points, never 50.
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "price_change_24h_pct", op: "gt", value: 0.5 }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.filters[0]?.value).toBe(0.5);
  });

  test("string small percent stays as-is", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "price_change_24h_pct", op: "gt", value: "0.5%" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.filters[0]?.value).toBe(0.5);
  });

  test("ratio metrics normalize percent-style values to 0..1", () => {
    const fromNumber = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "taker_buy_ratio", op: "gt", value: 55 }],
    });
    expect(fromNumber.success).toBe(true);
    if (fromNumber.success)
      expect(fromNumber.data.filters[0]?.value).toBe(0.55);

    const fromString = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "taker_buy_ratio", op: "gt", value: "55%" }],
    });
    expect(fromString.success).toBe(true);
    if (fromString.success)
      expect(fromString.data.filters[0]?.value).toBe(0.55);

    const alreadyRatio = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "taker_buy_ratio", op: "gt", value: 0.7 }],
    });
    expect(alreadyRatio.success).toBe(true);
    if (alreadyRatio.success)
      expect(alreadyRatio.data.filters[0]?.value).toBe(0.7);
  });

  test("signed USD metrics accept negatives; unsigned reject them", () => {
    const netSell = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "taker_net_buy_usd", op: "lt", value: -5_000_000 }],
    });
    expect(netSell.success).toBe(true);

    const badMcap = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "market_cap_usd", op: "gt", value: -1 }],
    });
    expect(badMcap.success).toBe(false);
  });

  test("taker buy ratio normalizes CoinGlass 0-100 scale to canonical 0..1", () => {
    // REGRESSION: CoinGlass stores buyRatio as 49.79 (percent scale). The DSL
    // filter value is 0..1 — without normalization "buy ratio > 55%" (0.55)
    // matched EVERY coin (49.79 > 0.55).
    expect(normalizeTakerRatio(49.79)).toBeCloseTo(0.4979);
    expect(normalizeTakerRatio(0.55)).toBeCloseTo(0.55);
    expect(normalizeTakerRatio(100)).toBeCloseTo(1);
    expect(normalizeTakerRatio(Number.NaN)).toBe(null);

    const metric = SMART_SCREENER_TAKER_METRICS.find(
      (m) => m.id === "taker_buy_ratio",
    );
    expect(metric).toBeDefined();
    const snapshot = {
      buyRatio: 55.5,
      sellRatio: 44.5,
      buyVolumeUsd: 10,
      sellVolumeUsd: 8,
      totalVolumeUsd: 18,
    };
    expect(metric?.getValue(snapshot)).toBeCloseTo(0.555);
  });

  test("takerContext defaults and parses", () => {
    const withCtx = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "taker_buy_ratio", op: "gt", value: 0.6 }],
      takerContext: { range: "4h", exchange: "Binance" },
    });
    expect(withCtx.success).toBe(true);
    if (withCtx.success) {
      expect(withCtx.data.takerContext?.range).toBe("4h");
      expect(withCtx.data.takerContext?.exchange).toBe("Binance");
    }

    const withoutCtx = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 1 }],
    });
    expect(withoutCtx.success).toBe(true);
    if (withoutCtx.success) expect(withoutCtx.data.takerContext).toBe(null);
  });

  test("defaults universe and limit", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 1_000_000 }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.universe).toBe("all");
    expect(parsed.data.limit).toBe(250);
  });

  test("defaults limit when LLM returns null", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 1_000_000 }],
      limit: null,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.limit).toBe(250);
  });

  test("formatDslSummary trims trailing .00 in compact USD", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "market_cap_usd", op: "gt", value: 5_000_000 }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(formatDslSummary(parsed.data)).toContain("$5M");
  });

  test("formatDslSummary trims trailing .00 in percent", () => {
    const parsed = ScreeningDslSchema.safeParse({
      filters: [{ metricId: "price_change_24h_pct", op: "gte", value: 10 }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(formatDslSummary(parsed.data)).toContain("10%");
    expect(formatDslSummary(parsed.data)).not.toContain("10.00%");
  });

  test("eval cases: expected filters/sort/limit form a valid DSL", () => {
    for (const c of SMART_SCREENER_EVAL_CASES) {
      const parsed = ScreeningDslSchema.safeParse({
        filters: (c.expect.filters ?? []).map((f) => ({
          metricId: f.metricId,
          op: f.op,
          value: f.value,
        })),
        sort: c.expect.sort ?? null,
        limit: c.expect.limit ?? null,
        universe: c.expect.universe ?? "all",
      });
      if (!parsed.success) {
        throw new Error(
          `eval case ${c.id} has an invalid expected DSL: ${parsed.error.message}`,
        );
      }
      expect(parsed.success).toBe(true);
    }
  });

  test("eval case ids are unique", () => {
    const ids = SMART_SCREENER_EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

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
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.coverage.marketChartWarmupRequestedCount).toBe(0);
    expect(parsed.data.coverage.marketChartWarmupDays).toEqual([]);
  });
});

describe("promptLooksLikeConstraints", () => {
  test("detects constraint language", () => {
    expect(promptLooksLikeConstraints("fdv under 200m")).toBe(true);
    expect(promptLooksLikeConstraints("market cap > 500m")).toBe(true);
    expect(promptLooksLikeConstraints("between 1m and 5m")).toBe(true);
  });

  test("does not flag sort-only prompts", () => {
    expect(promptLooksLikeConstraints("volume descending")).toBe(false);
    expect(promptLooksLikeConstraints("top gainers")).toBe(false);
  });
});
