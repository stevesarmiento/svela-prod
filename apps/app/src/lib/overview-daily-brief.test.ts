import { describe, expect, test } from "bun:test"
import {
  containsDigits,
  computeRsiLast,
  dataQualityFromCounts,
  dispersionFromChangePcts,
  dominantThemeLabel,
  filterEventsInWindow,
  formatUsdCompactUsd,
  getWindowMs,
  moodFromToneCounts,
  rsiSignal,
  signedPct,
  summarizeTechnicals,
  toneCountsFromEvents,
  topEventKinds,
  trendFromCloses,
  volatilityLevelFromCloses,
} from "./overview-daily-brief"

describe("overview-daily-brief", () => {
  test("getWindowMs", () => {
    expect(getWindowMs("24h")).toBe(24 * 60 * 60 * 1000)
    expect(getWindowMs("7d")).toBe(7 * 24 * 60 * 60 * 1000)
  })

  test("signedPct", () => {
    expect(signedPct(0)).toBe("0.00%")
    expect(signedPct(1.234)).toBe("+1.23%")
    expect(signedPct(-1.234)).toBe("-1.23%")
  })

  test("formatUsdCompactUsd", () => {
    expect(formatUsdCompactUsd(1_250_000)).toBe("$1.25M")
    expect(formatUsdCompactUsd(12_500)).toBe("$12.5K")
  })

  test("filterEventsInWindow", () => {
    const now = 10_000_000
    const events = [
      { kind: "news", occurredAtMs: now - 1000 },
      { kind: "news", occurredAtMs: now - 25 * 60 * 60 * 1000 },
    ]
    expect(filterEventsInWindow(events, "24h", now).length).toBe(1)
    expect(filterEventsInWindow(events, "7d", now).length).toBe(2)
  })

  test("topEventKinds counts and sorts", () => {
    const events = [
      { kind: "news", occurredAtMs: 1 },
      { kind: "news", occurredAtMs: 2 },
      { kind: "price_spike", occurredAtMs: 3 },
      { kind: "price_spike", occurredAtMs: 4 },
      { kind: "price_spike", occurredAtMs: 5 },
    ]
    expect(topEventKinds(events, 2)).toEqual(["price_spike×3", "news×2"])
  })

  test("computeRsiLast + rsiSignal", () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i)
    const down = Array.from({ length: 40 }, (_, i) => 100 - i)
    const rsiUp = computeRsiLast(up, 14)
    const rsiDown = computeRsiLast(down, 14)
    expect(rsiUp).not.toBeNull()
    expect(rsiDown).not.toBeNull()
    expect(rsiSignal(rsiUp)).toBe("overbought")
    expect(rsiSignal(rsiDown)).toBe("oversold")
  })

  test("trendFromCloses", () => {
    const up = Array.from({ length: 20 }, (_, i) => 100 + i)
    const down = Array.from({ length: 20 }, (_, i) => 100 - i)
    const flat = Array.from({ length: 20 }, () => 100)
    expect(trendFromCloses(up, 12)).toBe("up")
    expect(trendFromCloses(down, 12)).toBe("down")
    expect(trendFromCloses(flat, 12)).toBe("flat")
  })

  test("volatilityLevelFromCloses", () => {
    const low = Array.from({ length: 80 }, (_, i) => 100 + i * 0.01)
    const high = Array.from({ length: 80 }, (_, i) => 100 * (i % 2 === 0 ? 1.15 : 0.85))
    expect(volatilityLevelFromCloses(low, 48)).toBe("low")
    expect(volatilityLevelFromCloses(high, 48)).toBe("high")
  })

  test("dominantThemeLabel maps kinds", () => {
    expect(dominantThemeLabel(["price_spike×3"])).toBe("Fast price moves")
    expect(dominantThemeLabel(["news×1"])).toBe("News-driven tape")
    expect(dominantThemeLabel([])).toBe("No clear theme")
  })

  test("toneCountsFromEvents + moodFromToneCounts", () => {
    const events = [{ tone: "positive" }, { tone: "positive" }, { tone: "positive" }, { tone: "negative" }]
    const counts = toneCountsFromEvents(events)
    expect(counts).toEqual({ positive: 3, negative: 1, neutral: 0 })
    expect(moodFromToneCounts({ eventsCount: events.length, toneCounts: counts })).toBe("mixed")
    const more = [...events, { tone: "positive" }, { tone: "positive" }]
    const countsMore = toneCountsFromEvents(more)
    expect(moodFromToneCounts({ eventsCount: more.length, toneCounts: countsMore })).toBe("risk_on")
  })

  test("dispersionFromChangePcts", () => {
    expect(dispersionFromChangePcts([])).toBe("muted")
    expect(dispersionFromChangePcts([2])).toBe("low")
    expect(dispersionFromChangePcts([8])).toBe("medium")
    expect(dispersionFromChangePcts([20])).toBe("high")
  })

  test("dataQualityFromCounts", () => {
    expect(dataQualityFromCounts({ coinCount: 10, missingMarketDataCount: 1 })).toBe("solid")
    expect(dataQualityFromCounts({ coinCount: 10, missingMarketDataCount: 3 })).toBe("ok")
    expect(dataQualityFromCounts({ coinCount: 10, missingMarketDataCount: 6 })).toBe("patchy")
    expect(dataQualityFromCounts({ coinCount: 0, missingMarketDataCount: 0 })).toBe("unknown")
  })

  test("summarizeTechnicals", () => {
    const stretched = summarizeTechnicals([
      { rsi: "overbought", trend: "up", volatility: "medium" },
      { rsi: "overbought", trend: "up", volatility: "high" },
      { rsi: "neutral", trend: "up", volatility: "high" },
    ])
    expect(stretched.posture).toBe("Stretched")
    expect(stretched.rsi).toBe("skewed hot")

    const washed = summarizeTechnicals([
      { rsi: "oversold", trend: "down", volatility: "medium" },
      { rsi: "oversold", trend: "down", volatility: "low" },
      { rsi: "neutral", trend: "down", volatility: "low" },
    ])
    expect(washed.posture).toBe("Washed-out")
    expect(washed.rsi).toBe("skewed washed")
  })

  test("containsDigits", () => {
    expect(containsDigits("No digits here.")).toBe(false)
    expect(containsDigits("Has 2 digits.")).toBe(true)
  })
})
