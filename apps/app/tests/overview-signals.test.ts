import { describe, expect, it } from "bun:test"
import {
  dedupeAndSortByOccurredAt,
  detectBreakout,
  detectVolumeAnomaly,
  isCacheFresh,
  isPriceSpike,
  rankMovers,
} from "../convex/_lib/overview_signals"

describe("overview_signals", () => {
  describe("isPriceSpike", () => {
    it("is inclusive at threshold", () => {
      expect(isPriceSpike({ changePct: 5, thresholdPct: 5 })).toBe(true)
      expect(isPriceSpike({ changePct: -5, thresholdPct: 5 })).toBe(true)
      expect(isPriceSpike({ changePct: 4.999, thresholdPct: 5 })).toBe(false)
    })

    it("rejects non-finite inputs", () => {
      expect(isPriceSpike({ changePct: Number.NaN, thresholdPct: 5 })).toBe(false)
      expect(isPriceSpike({ changePct: 10, thresholdPct: Number.NaN })).toBe(false)
      expect(isPriceSpike({ changePct: 10, thresholdPct: 0 })).toBe(false)
    })
  })

  describe("detectBreakout", () => {
    it("detects new highs when latest point is fresh", () => {
      const points = [
        { timestamp: 0, price: 1, volume: 1 },
        { timestamp: 1, price: 2, volume: 1 },
        { timestamp: 2, price: 3, volume: 1 },
        { timestamp: 3, price: 4, volume: 1 },
        { timestamp: 4, price: 5, volume: 1 },
        { timestamp: 5, price: 6, volume: 1 },
      ]
      const res = detectBreakout({ points, nowMs: 6, freshnessMs: 10 })
      expect(res).not.toBeNull()
      expect(res?.isFresh).toBe(true)
      expect(res?.isNewHigh).toBe(true)
      expect(res?.isNewLow).toBe(false)
      expect(res?.latestTimestamp).toBe(5)
    })

    it("detects new lows when latest point is fresh", () => {
      const points = [
        { timestamp: 0, price: 6, volume: 1 },
        { timestamp: 1, price: 5, volume: 1 },
        { timestamp: 2, price: 4, volume: 1 },
        { timestamp: 3, price: 3, volume: 1 },
        { timestamp: 4, price: 2, volume: 1 },
        { timestamp: 5, price: 1, volume: 1 },
      ]
      const res = detectBreakout({ points, nowMs: 6, freshnessMs: 10 })
      expect(res).not.toBeNull()
      expect(res?.isFresh).toBe(true)
      expect(res?.isNewHigh).toBe(false)
      expect(res?.isNewLow).toBe(true)
    })

    it("does not emit breakout when stale", () => {
      const points = [
        { timestamp: 0, price: 1, volume: 1 },
        { timestamp: 1, price: 2, volume: 1 },
        { timestamp: 2, price: 3, volume: 1 },
        { timestamp: 3, price: 4, volume: 1 },
        { timestamp: 4, price: 5, volume: 1 },
        { timestamp: 5, price: 6, volume: 1 },
      ]
      const res = detectBreakout({ points, nowMs: 999, freshnessMs: 10 })
      expect(res).not.toBeNull()
      expect(res?.isFresh).toBe(false)
      expect(res?.isNewHigh).toBe(false)
      expect(res?.isNewLow).toBe(false)
    })
  })

  describe("detectVolumeAnomaly", () => {
    it("detects high anomalies", () => {
      const res = detectVolumeAnomaly({
        historyVolumes: [100, 100, 100, 100, 100, 100],
        currentVolume: 250,
        highRatio: 2,
        lowRatio: 0.5,
      })
      expect(res).not.toBeNull()
      expect(res?.isHigh).toBe(true)
      expect(res?.isLow).toBe(false)
      expect(res?.ratio).toBeCloseTo(2.5)
    })

    it("detects low anomalies (inclusive)", () => {
      const res = detectVolumeAnomaly({
        historyVolumes: [100, 100, 100, 100, 100, 100],
        currentVolume: 50,
        highRatio: 2,
        lowRatio: 0.5,
      })
      expect(res).not.toBeNull()
      expect(res?.isHigh).toBe(false)
      expect(res?.isLow).toBe(true)
      expect(res?.ratio).toBeCloseTo(0.5)
    })

    it("returns null when within bounds", () => {
      const res = detectVolumeAnomaly({
        historyVolumes: [100, 100, 100, 100, 100, 100],
        currentVolume: 140,
        highRatio: 2,
        lowRatio: 0.5,
      })
      expect(res).toBeNull()
    })
  })

  describe("dedupeAndSortByOccurredAt", () => {
    it("dedupes by id and sorts descending by occurredAtMs", () => {
      const out = dedupeAndSortByOccurredAt([
        { id: "a", occurredAtMs: 100 },
        { id: "b", occurredAtMs: 300 },
        { id: "a", occurredAtMs: 999 }, // ignored (first wins)
        { id: "c", occurredAtMs: 200 },
      ])
      expect(out.map((e) => e.id)).toEqual(["b", "c", "a"])
    })
  })

  describe("rankMovers", () => {
    it("ranks gainers/losers by changePct and contributors by abs impactUsd", () => {
      const movers = [
        { changePct: 10, impactUsd: 5 },
        { changePct: -9, impactUsd: -100 },
        { changePct: 2, impactUsd: 50 },
        { changePct: -1, impactUsd: null },
      ]
      const ranked = rankMovers(movers, 3)
      expect(ranked.gainers.map((m) => m.changePct)).toEqual([10, 2, -1])
      expect(ranked.losers.map((m) => m.changePct)).toEqual([-9, -1, 2])
      expect(ranked.contributors.map((m) => m.impactUsd)).toEqual([-100, 50, 5])
    })
  })

  describe("isCacheFresh", () => {
    it("treats expiresAt strictly greater than now as fresh", () => {
      expect(isCacheFresh(101, 100)).toBe(true)
      expect(isCacheFresh(100, 100)).toBe(false)
      expect(isCacheFresh(99, 100)).toBe(false)
    })
  })
})

