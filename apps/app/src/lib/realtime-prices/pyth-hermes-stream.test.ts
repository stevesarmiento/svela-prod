/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { normalizeHermesParsedPrice } from "./pyth-hermes-stream"

describe("normalizeHermesParsedPrice", () => {
  test("normalizes price using expo and strips 0x feedId", () => {
    const tick = normalizeHermesParsedPrice({
      id: "0xabc123",
      price: {
        price: "1000000000",
        conf: "25000000",
        expo: -8,
        publish_time: 1730000000,
      },
    })

    expect(tick).not.toBeNull()
    expect(tick?.feedId).toBe("abc123")
    expect(tick?.priceUsd).toBeCloseTo(10)
    expect(tick?.confidenceUsd).toBeCloseTo(0.25)
    expect(tick?.publishTimeMs).toBe(1730000000 * 1000)
  })

  test("returns null for invalid/non-positive prices", () => {
    expect(
      normalizeHermesParsedPrice({
        id: "feed",
        price: { price: "0", conf: "0", expo: 0, publish_time: 1 },
      }),
    ).toBeNull()
  })
})

