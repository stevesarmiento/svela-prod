import { describe, expect, test } from "bun:test"
import {
  bollingerSignal,
  containsDigits,
  computeBbwPercentile,
  computeBollingerPercentB,
  computeBreadthStats,
  computeRsiLast,
  dataQualityFromCounts,
  describeBriefChanges,
  dispersionFromChangePcts,
  dispersionFromSpread,
  dominantThemeLabel,
  extractNumericTokens,
  filterEventsInWindow,
  formatUsdCompactUsd,
  getWindowMs,
  moodFromBreadthAndTone,
  moodFromToneCounts,
  numbersGroundedIn,
  rsiSignal,
  signedPct,
  squeezeSignal,
  summarizeTechnicals,
  toneCountsFromEvents,
  topEventKinds,
  trendFromCloses,
  truncateText,
  volatilityLevelFromCloses,
  type BreadthStats,
  type BriefFactsCore,
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

  test("computeBollingerPercentB and bollingerSignal", () => {
    expect(computeBollingerPercentB([1, 2, 3], 20)).toBeNull()

    // Rising series: last close sits in the upper half of the band.
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i)
    const pbRising = computeBollingerPercentB(rising, 20)
    expect(pbRising).not.toBeNull()
    expect(pbRising!).toBeGreaterThan(0.5)

    // Flat series has zero band width → null, signal unknown.
    const flat = Array.from({ length: 30 }, () => 100)
    expect(computeBollingerPercentB(flat, 20)).toBeNull()

    expect(bollingerSignal(null)).toBe("unknown")
    expect(bollingerSignal(1.2)).toBe("above_band")
    expect(bollingerSignal(0.8)).toBe("upper_half")
    expect(bollingerSignal(0.2)).toBe("lower_half")
    expect(bollingerSignal(-0.1)).toBe("below_band")
  })

  test("computeBbwPercentile and squeezeSignal", () => {
    expect(computeBbwPercentile([1, 2, 3], 20)).toBeNull()

    // Volatile early, tight lately → current width percentile should be low.
    const wild = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 10 : -10) * (1 - i / 60))
    const calmTail = [...wild, ...Array.from({ length: 30 }, () => 100)]
    const pct = computeBbwPercentile(calmTail, 20, 96)
    expect(pct).not.toBeNull()
    expect(pct!).toBeLessThan(30)

    expect(squeezeSignal(null)).toBe("unknown")
    expect(squeezeSignal(10)).toBe("squeeze")
    expect(squeezeSignal(50)).toBe("normal")
    expect(squeezeSignal(90)).toBe("expansion")
  })

  test("summarizeTechnicals with bollinger and squeeze labels", () => {
    // Bollinger extremes count toward Stretched even without RSI extremes.
    const bandStretched = summarizeTechnicals([
      { rsi: "neutral", trend: "up", volatility: "medium", bollinger: "above_band", squeeze: "normal" },
      { rsi: "neutral", trend: "up", volatility: "medium", bollinger: "above_band", squeeze: "normal" },
      { rsi: "neutral", trend: "flat", volatility: "low", bollinger: "upper_half", squeeze: "normal" },
    ])
    expect(bandStretched.posture).toBe("Stretched")

    // Majority squeeze → Coiled.
    const coiled = summarizeTechnicals([
      { rsi: "neutral", trend: "flat", volatility: "low", bollinger: "upper_half", squeeze: "squeeze" },
      { rsi: "neutral", trend: "flat", volatility: "low", bollinger: "lower_half", squeeze: "squeeze" },
      { rsi: "neutral", trend: "flat", volatility: "medium", bollinger: "upper_half", squeeze: "normal" },
    ])
    expect(coiled.posture).toBe("Coiled")
  })

  test("computeBreadthStats", () => {
    expect(computeBreadthStats([])).toBeNull()
    expect(computeBreadthStats([Number.NaN])).toBeNull()

    const stats = computeBreadthStats([12, 6, 3, 1.2, 0.2, -0.3, -2, -8])
    expect(stats).not.toBeNull()
    expect(stats!.advancers).toBe(4)
    expect(stats!.decliners).toBe(2)
    expect(stats!.flat).toBe(2)
    expect(stats!.bigMovers).toBe(3) // 12, 6, -8
    expect(stats!.medianChangePct).toBeCloseTo(0.7, 5)
    expect(stats!.spreadPct).toBeGreaterThan(10)

    const single = computeBreadthStats([2.5])
    expect(single!.advancers).toBe(1)
    expect(single!.medianChangePct).toBe(2.5)
    expect(single!.spreadPct).toBe(0)
  })

  test("dispersionFromSpread", () => {
    expect(dispersionFromSpread(null)).toBe("muted")
    expect(dispersionFromSpread(0.2)).toBe("muted")
    expect(dispersionFromSpread(3)).toBe("low")
    expect(dispersionFromSpread(9)).toBe("medium")
    expect(dispersionFromSpread(20)).toBe("high")
  })

  test("moodFromBreadthAndTone", () => {
    const tone0 = { positive: 0, negative: 0, neutral: 0 }
    const breadth = (advancers: number, decliners: number, rest?: Partial<BreadthStats>): BreadthStats => ({
      advancers,
      decliners,
      flat: 5,
      medianChangePct: 0,
      spreadPct: 5,
      bigMovers: 3,
      ...rest,
    })

    // Price breadth dominates, even with neutral events.
    expect(
      moodFromBreadthAndTone({ breadth: breadth(48, 12), eventsCount: 13, toneCounts: { positive: 2, negative: 1, neutral: 10 } }),
    ).toBe("risk_on")
    expect(
      moodFromBreadthAndTone({ breadth: breadth(10, 45), eventsCount: 13, toneCounts: tone0 }),
    ).toBe("risk_off")

    // Balanced breadth: event tone tips the read.
    expect(
      moodFromBreadthAndTone({ breadth: breadth(30, 28), eventsCount: 10, toneCounts: { positive: 8, negative: 1, neutral: 1 } }),
    ).toBe("risk_on")
    expect(
      moodFromBreadthAndTone({ breadth: breadth(30, 28), eventsCount: 10, toneCounts: { positive: 2, negative: 2, neutral: 6 } }),
    ).toBe("mixed")

    // Nothing moving and no events → quiet.
    expect(
      moodFromBreadthAndTone({ breadth: breadth(3, 3, { bigMovers: 0 }), eventsCount: 0, toneCounts: tone0 }),
    ).toBe("quiet")

    // No/tiny breadth sample → falls back to tone-based mood.
    expect(moodFromBreadthAndTone({ breadth: null, eventsCount: 0, toneCounts: tone0 })).toBe("quiet")
    expect(
      moodFromBreadthAndTone({ breadth: null, eventsCount: 8, toneCounts: { positive: 6, negative: 1, neutral: 1 } }),
    ).toBe("risk_on")
  })

  test("extractNumericTokens", () => {
    expect(extractNumericTokens("SOL (+12.4%) led, JUP (-3.1%) lagged")).toEqual(["12.4", "3.1"])
    expect(extractNumericTokens("no numbers")).toEqual([])
    expect(extractNumericTokens("$1,234.56 moved")).toEqual(["1,234.56"])
  })

  test("numbersGroundedIn", () => {
    const source = JSON.stringify({ movers: [{ symbol: "SOL", change: "+12.4%" }], counts: { pos: 9, neg: 3 } })
    expect(numbersGroundedIn("SOL rose 12.4% while signals split 9 to 3.", source)).toBe(true)
    expect(numbersGroundedIn("SOL rose 15.7% today.", source)).toBe(false)
    expect(numbersGroundedIn("No numbers at all.", source)).toBe(true)
  })

  test("truncateText", () => {
    expect(truncateText("short title", 120)).toBe("short title")
    const long = "This is a very long headline about a token doing something notable in the market today"
    const cut = truncateText(long, 40)
    expect(cut.length).toBeLessThanOrEqual(40)
    expect(cut.endsWith("…")).toBe(true)
    expect(truncateText("  spaced   out  ", 120)).toBe("spaced out")
  })

  test("describeBriefChanges", () => {
    const base: BriefFactsCore = {
      mood: "risk_on",
      dispersion: "high",
      theme: "News-driven tape",
      posture: "Balanced",
      topGainerSymbol: "SOL",
      topLoserSymbol: "JUP",
      eventCount: 12,
    }

    expect(describeBriefChanges(null, base)).toEqual([])
    expect(describeBriefChanges(base, base)).toEqual([])

    const shifted = describeBriefChanges(base, {
      ...base,
      mood: "mixed",
      dispersion: "low",
      theme: "Upside breakouts",
      posture: "Stretched",
      topGainerSymbol: "WIF",
    })
    expect(shifted).toContain("the mood shifted from risk-on to mixed")
    expect(shifted).toContain("dispersion moved from high to low")
    expect(shifted).toContain("the dominant theme rotated from news-driven tape to upside breakouts")
    expect(shifted).toContain("technical posture went from balanced to stretched")
    expect(shifted).toContain("leadership rotated from SOL to WIF")

    // Unclear posture on either side is not reported as a change.
    expect(
      describeBriefChanges({ ...base, posture: "Unclear" }, { ...base, posture: "Stretched" }),
    ).toEqual([])

    // Event tape volume changes.
    expect(describeBriefChanges({ ...base, eventCount: 2 }, { ...base, eventCount: 12 })).toContain(
      "the event tape got noticeably busier",
    )
    expect(describeBriefChanges({ ...base, eventCount: 12 }, { ...base, eventCount: 2 })).toContain(
      "the event tape quieted down",
    )
  })
})
