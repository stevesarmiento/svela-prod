import type { BreadthStats } from "../../convex/_lib/breadth"

export type BriefWindow = "24h" | "7d"

export function getWindowMs(window: BriefWindow): number {
  return window === "7d" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
}

export function signedPct(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

const usdCompactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
})

export function formatUsdCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return usdCompactFormatter.format(value)
}

export type OverviewEventLite = { kind: string; occurredAtMs: number }

export function filterEventsInWindow<T extends OverviewEventLite>(
  events: ReadonlyArray<T>,
  window: BriefWindow,
  nowMs: number,
): T[] {
  const ms = getWindowMs(window)
  return events.filter((e) => nowMs - e.occurredAtMs <= ms)
}

export function topEventKinds(
  events: ReadonlyArray<OverviewEventLite>,
  maxKinds = 2,
): string[] {
  const byKind = new Map<string, number>()
  for (const e of events) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1)
  return Array.from(byKind.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, maxKinds))
    .map(([k, n]) => `${k}×${n}`)
}

export type EventTone = "positive" | "negative" | "neutral"
export type RegimeMood = "risk_on" | "risk_off" | "mixed" | "quiet"

export function toneCountsFromEvents(
  events: ReadonlyArray<{ tone?: EventTone | null | undefined }>,
): { positive: number; negative: number; neutral: number } {
  return events.reduce(
    (acc, e) => {
      if (e.tone === "positive") acc.positive++
      else if (e.tone === "negative") acc.negative++
      else acc.neutral++
      return acc
    },
    { positive: 0, negative: 0, neutral: 0 },
  )
}

export function moodFromToneCounts(args: {
  eventsCount: number
  toneCounts: { positive: number; negative: number; neutral: number }
}): RegimeMood {
  if (args.eventsCount <= 0) return "quiet"
  if (args.toneCounts.positive > args.toneCounts.negative + 2) return "risk_on"
  if (args.toneCounts.negative > args.toneCounts.positive + 2) return "risk_off"
  return "mixed"
}

/**
 * Regime mood driven primarily by price breadth across the full watchlist,
 * with event tone as a tiebreaker. News tone alone almost always reads
 * neutral, which made the old mood land on "mixed" nearly every day.
 */
export function moodFromBreadthAndTone(args: {
  breadth: BreadthStats | null | undefined
  eventsCount: number
  toneCounts: { positive: number; negative: number; neutral: number }
}): RegimeMood {
  const b = args.breadth
  const total = b ? b.advancers + b.decliners + b.flat : 0
  if (!b || total < 5) {
    return moodFromToneCounts({ eventsCount: args.eventsCount, toneCounts: args.toneCounts })
  }

  if (b.bigMovers === 0 && args.eventsCount <= 0) return "quiet"

  const decisive = b.advancers + b.decliners
  if (decisive > 0) {
    const upShare = b.advancers / decisive
    if (upShare >= 0.65) return "risk_on"
    if (upShare <= 0.35) return "risk_off"
  }

  // Balanced breadth: let a clearly skewed event tape tip the read.
  if (args.toneCounts.positive > args.toneCounts.negative + 2) return "risk_on"
  if (args.toneCounts.negative > args.toneCounts.positive + 2) return "risk_off"
  return "mixed"
}

export type DispersionLabel = "high" | "medium" | "low" | "muted"

// Breadth math lives in convex/_lib so Convex functions can use it without
// importing app code (Convex bundles independently); re-exported here so app
// code keeps a single import path.
export { computeBreadthStats, type BreadthStats } from "../../convex/_lib/breadth"

/** Dispersion from the full-distribution spread (p90 − p10). */
export function dispersionFromSpread(spreadPct: number | null | undefined): DispersionLabel {
  if (spreadPct == null || !Number.isFinite(spreadPct) || spreadPct <= 0.5) return "muted"
  if (spreadPct >= 15) return "high"
  if (spreadPct >= 7.5) return "medium"
  return "low"
}

export function dispersionFromChangePcts(changePcts: ReadonlyArray<number>): DispersionLabel {
  const maxMove = changePcts.reduce((m, x) => Math.max(m, Math.abs(Number.isFinite(x) ? x : 0)), 0)
  if (!Number.isFinite(maxMove) || maxMove <= 0) return "muted"
  if (maxMove >= 15) return "high"
  if (maxMove >= 7.5) return "medium"
  return "low"
}

export type DataQualityLabel = "solid" | "ok" | "patchy" | "unknown"

export function dataQualityFromCounts(args: {
  coinCount: number | null | undefined
  missingMarketDataCount: number | null | undefined
}): DataQualityLabel {
  const coinCount = args.coinCount ?? 0
  const missing = args.missingMarketDataCount ?? 0
  if (!Number.isFinite(coinCount) || coinCount <= 0) return "unknown"
  const coverage = (coinCount - missing) / coinCount
  if (!Number.isFinite(coverage)) return "unknown"
  if (coverage >= 0.9) return "solid"
  if (coverage >= 0.7) return "ok"
  return "patchy"
}

export function dominantThemeLabel(topEventKinds: string[]): string {
  const top = topEventKinds[0] ?? ""
  if (top.startsWith("breakout_high")) return "Upside breakouts"
  if (top.startsWith("breakout_low")) return "Downside breaks"
  if (top.startsWith("volume_anomaly")) return "Volume surprises"
  if (top.startsWith("price_spike")) return "Fast price moves"
  if (top.startsWith("news")) return "News-driven tape"
  return topEventKinds.length > 0 ? "Recurring themes" : "No clear theme"
}

export type TechnicalLabels = {
  rsi: RsiSignal
  trend: TrendLabel
  volatility: VolatilityLevel
  /** Bollinger %B position (token-page indicator). */
  bollinger?: BollingerSignal
  /** Bollinger band-width percentile regime (token-page BBWP). */
  squeeze?: SqueezeSignal
}

export type BollingerSignal = "above_band" | "upper_half" | "lower_half" | "below_band" | "unknown"

/**
 * Bollinger %B of the latest close: (close − lower) / (upper − lower).
 * Same construction as the token page's Bollinger stat.
 */
export function computeBollingerPercentB(
  closes: ReadonlyArray<number>,
  period = 20,
  mult = 2,
): number | null {
  if (!closes || closes.length < period) return null
  const slice = closes.slice(-period).filter((x) => Number.isFinite(x))
  if (slice.length < period) return null
  const mean = slice.reduce((s, x) => s + x, 0) / slice.length
  const variance = slice.reduce((s, x) => s + (x - mean) ** 2, 0) / slice.length
  const sd = Math.sqrt(variance)
  const upper = mean + mult * sd
  const lower = mean - mult * sd
  const last = slice[slice.length - 1]!
  if (!(upper > lower)) return null
  const pb = (last - lower) / (upper - lower)
  return Number.isFinite(pb) ? pb : null
}

export function bollingerSignal(percentB: number | null | undefined): BollingerSignal {
  if (percentB == null || !Number.isFinite(percentB)) return "unknown"
  if (percentB > 1) return "above_band"
  if (percentB < 0) return "below_band"
  return percentB >= 0.5 ? "upper_half" : "lower_half"
}

export type SqueezeSignal = "squeeze" | "expansion" | "normal" | "unknown"

/**
 * Percentile (0–100) of the current Bollinger band width vs its own recent
 * history — a lightweight BBWP. Low percentile = coiled/squeezed range,
 * high percentile = expanded/volatile.
 */
export function computeBbwPercentile(
  closes: ReadonlyArray<number>,
  period = 20,
  lookback = 96,
): number | null {
  if (!closes || closes.length < period + 10) return null
  const widths: number[] = []
  for (let i = period; i <= closes.length; i++) {
    const slice = closes.slice(i - period, i).filter((x) => Number.isFinite(x))
    if (slice.length < period) continue
    const mean = slice.reduce((s, x) => s + x, 0) / slice.length
    if (!(mean > 0)) continue
    const variance = slice.reduce((s, x) => s + (x - mean) ** 2, 0) / slice.length
    const sd = Math.sqrt(variance)
    widths.push((4 * sd) / mean)
  }
  if (widths.length < 10) return null
  const window = widths.slice(-Math.max(10, lookback))
  const current = window[window.length - 1]!
  const below = window.filter((w) => w <= current).length
  return (below / window.length) * 100
}

export function squeezeSignal(bbwPercentile: number | null | undefined): SqueezeSignal {
  if (bbwPercentile == null || !Number.isFinite(bbwPercentile)) return "unknown"
  if (bbwPercentile <= 15) return "squeeze"
  if (bbwPercentile >= 85) return "expansion"
  return "normal"
}

export type TechnicalPostureSummary = {
  posture:
    | "Stretched"
    | "Washed-out"
    | "Elevated volatility"
    | "Coiled"
    | "Uptrend bias"
    | "Downtrend bias"
    | "Balanced"
    | "Unclear"
  rsi: "skewed hot" | "skewed washed" | "mixed" | "unknown"
  trend: "upward" | "downward" | "mixed" | "unknown"
  volatility: "elevated" | "contained" | "normal" | "unknown"
  tone: "positive" | "negative" | "neutral"
}

export function summarizeTechnicals(labels: ReadonlyArray<TechnicalLabels>): TechnicalPostureSummary {
  if (labels.length === 0) {
    return {
      posture: "Unclear",
      rsi: "unknown",
      trend: "unknown",
      volatility: "unknown",
      tone: "neutral",
    }
  }

  const rsiCounts = labels.reduce(
    (acc, x) => {
      acc[x.rsi] = (acc[x.rsi] ?? 0) + 1
      return acc
    },
    {} as Record<TechnicalLabels["rsi"], number>,
  )
  const trendCounts = labels.reduce(
    (acc, x) => {
      acc[x.trend] = (acc[x.trend] ?? 0) + 1
      return acc
    },
    {} as Record<TechnicalLabels["trend"], number>,
  )
  const volCounts = labels.reduce(
    (acc, x) => {
      acc[x.volatility] = (acc[x.volatility] ?? 0) + 1
      return acc
    },
    {} as Record<TechnicalLabels["volatility"], number>,
  )

  const overbought = rsiCounts.overbought ?? 0
  const oversold = rsiCounts.oversold ?? 0
  const up = trendCounts.up ?? 0
  const down = trendCounts.down ?? 0
  const highVol = volCounts.high ?? 0

  // Combined "hot"/"cold" per coin: RSI extreme OR price outside its
  // Bollinger band both count (a coin matching both counts once).
  const hot = labels.filter((x) => x.rsi === "overbought" || x.bollinger === "above_band").length
  const cold = labels.filter((x) => x.rsi === "oversold" || x.bollinger === "below_band").length
  const squeezed = labels.filter((x) => x.squeeze === "squeeze").length

  const rsi =
    labels.some((x) => x.rsi !== "unknown")
      ? overbought >= 2 && overbought > oversold
        ? "skewed hot"
        : oversold >= 2 && oversold > overbought
          ? "skewed washed"
          : "mixed"
      : "unknown"
  const trend =
    labels.some((x) => x.trend !== "unknown")
      ? up >= down + 2
        ? "upward"
        : down >= up + 2
          ? "downward"
          : "mixed"
      : "unknown"
  const volatility =
    labels.some((x) => x.volatility !== "unknown")
      ? highVol >= 2
        ? "elevated"
        : (volCounts.low ?? 0) >= 2
          ? "contained"
          : "normal"
      : "unknown"

  const posture = (() => {
    if (hot >= 2 && hot > cold) return "Stretched"
    if (cold >= 2 && cold > hot) return "Washed-out"
    if (highVol >= 2) return "Elevated volatility"
    if (squeezed >= 2 && squeezed * 2 >= labels.length) return "Coiled"
    if (up >= down + 2) return "Uptrend bias"
    if (down >= up + 2) return "Downtrend bias"
    return "Balanced"
  })()

  const tone =
    posture === "Uptrend bias"
      ? "positive"
      : posture === "Downtrend bias" || posture === "Stretched"
        ? "negative"
        : "neutral"

  return { posture, rsi, trend, volatility, tone }
}

export function containsDigits(value: string): boolean {
  return /[0-9]/.test(value)
}

export function extractNumericTokens(value: string): string[] {
  return value.match(/\d+(?:[.,]\d+)*/g) ?? []
}

/**
 * True when every numeric token in `text` also appears somewhere in `source`.
 * Used to let AI copy cite numbers we provided (e.g. "+12.4%") while still
 * rejecting invented ones.
 */
export function numbersGroundedIn(text: string, source: string): boolean {
  return extractNumericTokens(text).every((token) => source.includes(token))
}

export function truncateText(value: string, maxChars: number): string {
  const text = value.replace(/\s+/g, " ").trim()
  if (text.length <= maxChars) return text
  const cut = text.slice(0, Math.max(1, maxChars - 1))
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * The compact fact snapshot persisted alongside each brief so the next
 * generation can describe what changed ("mood flipped risk-on → mixed").
 */
export type BriefFactsCore = {
  mood: RegimeMood
  dispersion: DispersionLabel
  theme: string
  posture: TechnicalPostureSummary["posture"]
  topGainerSymbol: string | null
  topLoserSymbol: string | null
  eventCount: number
}

function moodWord(mood: RegimeMood): string {
  if (mood === "risk_on") return "risk-on"
  if (mood === "risk_off") return "risk-off"
  return mood
}

export function describeBriefChanges(
  prev: BriefFactsCore | null | undefined,
  next: BriefFactsCore,
): string[] {
  if (!prev) return []
  const changes: string[] = []

  if (prev.mood !== next.mood) {
    changes.push(`the mood shifted from ${moodWord(prev.mood)} to ${moodWord(next.mood)}`)
  }
  if (prev.dispersion !== next.dispersion) {
    changes.push(`dispersion moved from ${prev.dispersion} to ${next.dispersion}`)
  }
  if (prev.theme !== next.theme && prev.theme && next.theme) {
    changes.push(
      `the dominant theme rotated from ${prev.theme.toLowerCase()} to ${next.theme.toLowerCase()}`,
    )
  }
  if (
    prev.posture !== next.posture &&
    prev.posture !== "Unclear" &&
    next.posture !== "Unclear"
  ) {
    changes.push(
      `technical posture went from ${prev.posture.toLowerCase()} to ${next.posture.toLowerCase()}`,
    )
  }
  if (
    prev.topGainerSymbol &&
    next.topGainerSymbol &&
    prev.topGainerSymbol !== next.topGainerSymbol
  ) {
    changes.push(`leadership rotated from ${prev.topGainerSymbol} to ${next.topGainerSymbol}`)
  }
  if (next.eventCount >= prev.eventCount * 2 + 3) {
    changes.push("the event tape got noticeably busier")
  } else if (prev.eventCount >= next.eventCount * 2 + 3) {
    changes.push("the event tape quieted down")
  }

  return changes
}

export type RsiSignal = "overbought" | "oversold" | "neutral" | "unknown"

export function computeRsiLast(
  closes: ReadonlyArray<number>,
  period = 14,
): number | null {
  if (period <= 1) return null
  if (!closes || closes.length < period + 1) return null

  const deltas: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1]
    const b = closes[i]
    if (typeof a !== "number" || typeof b !== "number") continue
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    deltas.push(b - a)
  }
  if (deltas.length < period) return null

  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    const d = deltas[i]!
    if (d >= 0) avgGain += d
    else avgLoss += -d
  }
  avgGain /= period
  avgLoss /= period

  for (let i = period; i < deltas.length; i++) {
    const d = deltas[i]!
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  const rsi = 100 - 100 / (1 + rs)
  return Number.isFinite(rsi) ? rsi : null
}

export function rsiSignal(value: number | null | undefined): RsiSignal {
  if (value == null || !Number.isFinite(value)) return "unknown"
  if (value > 70) return "overbought"
  if (value < 30) return "oversold"
  return "neutral"
}

export type VolatilityLevel = "high" | "medium" | "low" | "unknown"

export function volatilityLevelFromCloses(
  closes: ReadonlyArray<number>,
  lookback = 32,
): VolatilityLevel {
  if (!closes || closes.length < 3) return "unknown"
  const slice = closes.slice(-Math.max(3, lookback))
  const returns: number[] = []
  for (let i = 1; i < slice.length; i++) {
    const a = slice[i - 1]
    const b = slice[i]
    if (typeof a !== "number" || typeof b !== "number") continue
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) continue
    returns.push(Math.log(b / a))
  }
  if (returns.length < 3) return "unknown"
  const mean = returns.reduce((s, x) => s + x, 0) / returns.length
  const variance = returns.reduce((s, x) => s + (x - mean) ** 2, 0) / returns.length
  const stdev = Math.sqrt(variance)
  if (!Number.isFinite(stdev)) return "unknown"
  if (stdev >= 0.08) return "high"
  if (stdev >= 0.04) return "medium"
  return "low"
}

export type TrendLabel = "up" | "down" | "flat" | "unknown"

export function trendFromCloses(closes: ReadonlyArray<number>, lookback = 12): TrendLabel {
  if (!closes || closes.length < 2) return "unknown"
  const slice = closes.slice(-Math.max(2, lookback))
  const first = slice[0]
  const last = slice[slice.length - 1]
  if (typeof first !== "number" || typeof last !== "number") return "unknown"
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return "unknown"
  const pct = ((last - first) / first) * 100
  if (!Number.isFinite(pct)) return "unknown"
  if (pct > 1) return "up"
  if (pct < -1) return "down"
  return "flat"
}
