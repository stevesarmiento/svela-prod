export type BriefWindow = "24h" | "7d"

export function getWindowMs(window: BriefWindow): number {
  return window === "7d" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
}

export function signedPct(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

export function formatUsdCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)
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

export type DispersionLabel = "high" | "medium" | "low" | "muted"

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
}

export type TechnicalPostureSummary = {
  posture:
    | "Stretched"
    | "Washed-out"
    | "Elevated volatility"
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
    if (overbought >= 2 && overbought > oversold) return "Stretched"
    if (oversold >= 2 && oversold > overbought) return "Washed-out"
    if (highVol >= 2) return "Elevated volatility"
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
