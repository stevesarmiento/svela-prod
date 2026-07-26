/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { RequestSchema, ResponseSchema } from "./intent-schemas";

describe("smart screener intent schemas", () => {
  test("ResponseSchema: takerFilter defaults missing fields", () => {
    const parsed = ResponseSchema.safeParse({
      actions: [{ kind: "takerFilter", value: {} }],
      fallbackSearchText: null,
      confidence: 0.9,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const action = parsed.data.actions.at(0);
    expect(action?.kind).toBe("takerFilter");
    if (!action || action.kind !== "takerFilter") return;

    expect(action.value.range).toBe("24h");
    expect(action.value.exchange).toBe(null);
    expect(action.value.minBuyRatio).toBe(null);
    expect(action.value.minBuyVolumeUsd).toBe(null);
    expect(action.value.minTotalVolumeUsd).toBe(null);
    expect(action.value.minNetBuyUsd).toBe(null);
    expect(action.value.requireBuyGreaterThanSell).toBe(false);
  });

  test("ResponseSchema: normalizes buy ratio percentages", () => {
    const parsed = ResponseSchema.safeParse({
      actions: [{ kind: "takerFilter", value: { minBuyRatio: "55%" } }],
      fallbackSearchText: null,
      confidence: 0.9,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const action = parsed.data.actions.at(0);
    expect(action?.kind).toBe("takerFilter");
    if (!action || action.kind !== "takerFilter") return;

    expect(action.value.minBuyRatio).toBeCloseTo(0.55, 6);
  });

  test("ResponseSchema: parses compact USD amounts", () => {
    const parsed = ResponseSchema.safeParse({
      actions: [
        {
          kind: "takerFilter",
          value: {
            minNetBuyUsd: "$10m",
            minBuyVolumeUsd: "2.5b",
            minTotalVolumeUsd: "100k",
          },
        },
      ],
      fallbackSearchText: null,
      confidence: 0.9,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const action = parsed.data.actions.at(0);
    expect(action?.kind).toBe("takerFilter");
    if (!action || action.kind !== "takerFilter") return;

    expect(action.value.minNetBuyUsd).toBe(10_000_000);
    expect(action.value.minBuyVolumeUsd).toBe(2_500_000_000);
    expect(action.value.minTotalVolumeUsd).toBe(100_000);
  });

  test("RequestSchema: defaults surface to watchlist", () => {
    const parsed = RequestSchema.safeParse({
      text: "top gainers",
      watchlistGroups: [],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.surface).toBe("watchlist");
  });
});
