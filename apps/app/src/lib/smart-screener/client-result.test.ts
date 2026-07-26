/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { shouldApplySmartScreenerResult } from "./client-result";

describe("shouldApplySmartScreenerResult", () => {
  test("returns false on low confidence", () => {
    expect(
      shouldApplySmartScreenerResult({
        ok: true,
        confidence: 0.59,
        actionsCount: 2,
        threshold: 0.6,
      }),
    ).toBe(false);
  });

  test("returns false when no actions", () => {
    expect(
      shouldApplySmartScreenerResult({
        ok: true,
        confidence: 0.99,
        actionsCount: 0,
        threshold: 0.6,
      }),
    ).toBe(false);
  });

  test("returns true on high confidence with actions", () => {
    expect(
      shouldApplySmartScreenerResult({
        ok: true,
        confidence: 0.9,
        actionsCount: 1,
        threshold: 0.6,
      }),
    ).toBe(true);
  });
});
