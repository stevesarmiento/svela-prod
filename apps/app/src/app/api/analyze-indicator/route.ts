import { streamText } from "ai"
import { z } from "zod"
import { gemini } from "@/lib/gemini"

const MAX_HISTORY_POINTS = 48

const MarketContextSchema = z.object({
  priceUsd: z.number().nullable().optional(),
  change24hPct: z.number().nullable().optional(),
  volume24hUsd: z.number().nullable().optional(),
  marketCapUsd: z.number().nullable().optional(),
  /** Closes for the same trailing bars as indicator snapshots — used to relate momentum to price. */
  closeHistory: z.array(z.number()).max(180).optional(),
  /** Unix seconds per close bar (aligns with closeHistory indices) for calendar 7-day windows. */
  closeTimesUtc: z.array(z.number()).max(180).optional(),
})

const TokenSchema = z.object({
  coinId: z.string(),
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
})

const MarketVisionSnapshotSchema = z.object({
  rsiCurrent: z.number().nullable(),
  rsiHistory: z.array(z.number().nullable()).max(180),
  wt1Current: z.number().nullable(),
  wt2Current: z.number().nullable(),
  moneyFlowCurrent: z.number().nullable(),
  moneyFlowHistory: z.array(z.number().nullable()).max(180),
})

const BollingerSnapshotSchema = z.object({
  indicatorCurrent: z.number().nullable(),
  upperCurrent: z.number().nullable(),
  lowerCurrent: z.number().nullable(),
  basisCurrent: z.number().nullable(),
  indicatorHistory: z.array(z.number().nullable()).max(180),
  upperHistory: z.array(z.number().nullable()).max(180),
  lowerHistory: z.array(z.number().nullable()).max(180),
})

const BBWPSnapshotSchema = z.object({
  bbwpCurrent: z.number().nullable(),
  bbwpHistory: z.array(z.number().nullable()).max(240),
  lookback: z.number(),
})

const RsiDivergenceTypeSchema = z.enum(["bullish", "bearish", "h_bullish", "h_bearish"])

const RsiDivergencesSnapshotSettingsSchema = z.object({
  rsiLength: z.number(),
  leftBars: z.number(),
  rightBars: z.number(),
  pairMode: z.enum(["TV-like", "Same Bar"]),
  tolBars: z.number(),
  priceMode: z.enum(["High/Low", "Close"]),
  allowEqual: z.boolean(),
  priceEps: z.number(),
  rsiEps: z.number(),
  showRegular: z.boolean(),
  showHidden: z.boolean(),
})

const RsiDivergencesSnapshotDivergenceSchema = z.object({
  type: RsiDivergenceTypeSchema,
  startTime: z.number(),
  endTime: z.number(),
  priceStart: z.number(),
  priceEnd: z.number(),
  rsiStart: z.number(),
  rsiEnd: z.number(),
})

const RsiDivergencesSnapshotSchema = z.object({
  rsiCurrent: z.number().nullable(),
  rsiHistory: z.array(z.number().nullable()).max(180),
  divergences: z.array(RsiDivergencesSnapshotDivergenceSchema).max(96),
  settings: RsiDivergencesSnapshotSettingsSchema,
})

const RequestSchema = z.discriminatedUnion("indicatorType", [
  z.object({
    indicatorType: z.literal("marketVision"),
    token: TokenSchema,
    timeframe: z.string(),
    marketContext: MarketContextSchema.default({}),
    snapshot: MarketVisionSnapshotSchema,
  }),
  z.object({
    indicatorType: z.literal("bollinger"),
    token: TokenSchema,
    timeframe: z.string(),
    marketContext: MarketContextSchema.default({}),
    snapshot: BollingerSnapshotSchema,
  }),
  z.object({
    indicatorType: z.literal("bbwp"),
    token: TokenSchema,
    timeframe: z.string(),
    marketContext: MarketContextSchema.default({}),
    snapshot: BBWPSnapshotSchema,
  }),
  z.object({
    indicatorType: z.literal("rsiDivergences"),
    token: TokenSchema,
    timeframe: z.string(),
    marketContext: MarketContextSchema.default({}),
    snapshot: RsiDivergencesSnapshotSchema,
  }),
])

type IndicatorExplainRequest = z.infer<typeof RequestSchema>

function trimSeries<T>(arr: ReadonlyArray<T> | undefined): T[] | undefined {
  if (!arr?.length) return undefined
  return arr.length > MAX_HISTORY_POINTS ? [...arr.slice(-MAX_HISTORY_POINTS)] : [...arr]
}

/** Keep closeHistory and closeTimesUtc index-aligned when trimming from the left. */
function trimAlignedContext(mc: IndicatorExplainRequest["marketContext"]): IndicatorExplainRequest["marketContext"] {
  const closes = mc?.closeHistory
  if (!closes?.length) return mc ?? {}
  const n = Math.min(MAX_HISTORY_POINTS, closes.length)
  const nextCloses = closes.slice(-n)
  const times = mc?.closeTimesUtc
  const nextTimes =
    times && times.length === closes.length && times.length >= n ? times.slice(-n) : undefined
  return {
    ...mc,
    closeHistory: nextCloses,
    ...(nextTimes?.length === nextCloses.length ? { closeTimesUtc: nextTimes } : {}),
  }
}

/** Trim histories for prompt size; keeps latest values intact. */
function forPrompt(validated: IndicatorExplainRequest): IndicatorExplainRequest {
  const mc = trimAlignedContext(validated.marketContext ?? {})
  const nextMc = mc

  if (validated.indicatorType === "marketVision") {
    return {
      ...validated,
      marketContext: nextMc,
      snapshot: {
        ...validated.snapshot,
        rsiHistory: trimSeries(validated.snapshot.rsiHistory) ?? validated.snapshot.rsiHistory,
        moneyFlowHistory: trimSeries(validated.snapshot.moneyFlowHistory) ?? validated.snapshot.moneyFlowHistory,
      },
    }
  }

  if (validated.indicatorType === "bollinger") {
    return {
      ...validated,
      marketContext: nextMc,
      snapshot: {
        ...validated.snapshot,
        indicatorHistory: trimSeries(validated.snapshot.indicatorHistory) ?? validated.snapshot.indicatorHistory,
        upperHistory: trimSeries(validated.snapshot.upperHistory) ?? validated.snapshot.upperHistory,
        lowerHistory: trimSeries(validated.snapshot.lowerHistory) ?? validated.snapshot.lowerHistory,
      },
    }
  }

  if (validated.indicatorType === "rsiDivergences") {
    return {
      ...validated,
      marketContext: nextMc,
      snapshot: {
        ...validated.snapshot,
        rsiHistory: trimSeries(validated.snapshot.rsiHistory) ?? validated.snapshot.rsiHistory,
        divergences:
          validated.snapshot.divergences.length > 24
            ? [...validated.snapshot.divergences.slice(-24)]
            : [...validated.snapshot.divergences],
      },
    }
  }

  return {
    ...validated,
    marketContext: nextMc,
    snapshot: {
      ...validated.snapshot,
      bbwpHistory: trimSeries(validated.snapshot.bbwpHistory) ?? validated.snapshot.bbwpHistory,
    },
  }
}

function pctChange(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null
  const pct = ((b - a) / a) * 100
  return Number.isFinite(pct) ? pct : null
}

const SECONDS_PER_DAY = 86400
const SECONDS_PER_HOUR = 3600
const DEFAULT_FOCUS_DAYS = 7
/** Max bars we attach in the focus JSON (keeps prompt size sane for intraday series). */
const MAX_BARS_IN_FOCUS = 56

type SliceMode = "calendar_utc" | "last_n_bars"
type SetupCode =
  | "continuation"
  | "acceleration"
  | "pullback"
  | "reversal_attempt"
  | "pause"
  | "unknown"
type SetupTone = "positive" | "negative" | "neutral"

interface SliceStats {
  bars: number
  closeFirst: number | null
  closeLast: number | null
  closeChangePct: number | null
  timeRangeUtc: { firstBar: number | null; lastBar: number | null } | null
}

interface ContextVsLastDaySummaryBase {
  timeframe: string
  focusDays: number
  focusMode: SliceMode
  lastDayMode: SliceMode
  prior: SliceStats | null
  lastDay: SliceStats | null
  setup: {
    code: SetupCode
    label: string
    tone: SetupTone
  }
}

interface ContextVsLastDaySummaryMarketVision extends ContextVsLastDaySummaryBase {
  indicatorType: "marketVision"
  rsiDeltaPrior: number | null
  rsiDeltaLastDay: number | null
  moneyFlowDeltaPrior: number | null
  moneyFlowDeltaLastDay: number | null
  momentumAgreement: "confirming" | "diverging" | "unknown"
}

interface ContextVsLastDaySummaryBollinger extends ContextVsLastDaySummaryBase {
  indicatorType: "bollinger"
  indicatorDeltaPrior: number | null
  indicatorDeltaLastDay: number | null
  bandPositionNow: "above_upper" | "below_lower" | "inside" | "unknown"
  momentumAgreement: "confirming" | "diverging" | "unknown"
}

interface ContextVsLastDaySummaryBBWP extends ContextVsLastDaySummaryBase {
  indicatorType: "bbwp"
  bbwpDeltaPrior: number | null
  bbwpDeltaLastDay: number | null
  volatilityRegime: "expanding" | "contracting" | "flat" | "unknown"
}

interface ContextVsLastDaySummaryRsiDivs extends ContextVsLastDaySummaryBase {
  indicatorType: "rsiDivergences"
  rsiDeltaPrior: number | null
  rsiDeltaLastDay: number | null
  divergencesPriorCounts: Record<string, number> | null
  divergencesLastDayCounts: Record<string, number> | null
  latestDivergenceLastDay: Record<string, unknown> | null
  momentumAgreement: "confirming" | "diverging" | "unknown"
}

type ContextVsLastDaySummary =
  | ContextVsLastDaySummaryMarketVision
  | ContextVsLastDaySummaryBollinger
  | ContextVsLastDaySummaryBBWP
  | ContextVsLastDaySummaryRsiDivs

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function startIndexLastSeconds(
  timesUtc: readonly number[] | undefined,
  length: number,
  seconds: number,
  fallbackBars: number,
): { start: number; mode: SliceMode } {
  if (!timesUtc || timesUtc.length !== length || length < 1) {
    return { start: Math.max(0, length - fallbackBars), mode: "last_n_bars" }
  }
  const latest = timesUtc[length - 1]
  if (!isFiniteNumber(latest)) {
    return { start: Math.max(0, length - fallbackBars), mode: "last_n_bars" }
  }
  const cutoff = latest - seconds
  for (let i = 0; i < length; i++) {
    const t = timesUtc[i]
    if (isFiniteNumber(t) && t >= cutoff) return { start: i, mode: "calendar_utc" }
  }
  return { start: Math.max(0, length - 1), mode: "calendar_utc" }
}

function sliceStats(args: {
  closes: readonly number[]
  timesUtc: readonly number[] | undefined
  start: number
  endExclusive: number
}): SliceStats | null {
  const start = Math.max(0, Math.min(args.start, args.closes.length))
  const endExclusive = Math.max(start, Math.min(args.endExclusive, args.closes.length))
  const bars = endExclusive - start
  if (bars <= 0) return null

  const closeFirst = args.closes[start] ?? null
  const closeLast = args.closes[endExclusive - 1] ?? null
  const closeChangePct =
    bars >= 2 && closeFirst != null && closeLast != null ? pctChange(closeFirst, closeLast) : null

  const timesOk =
    args.timesUtc && args.timesUtc.length === args.closes.length
      ? args.timesUtc
      : undefined
  const firstBar = timesOk?.[start]
  const lastBar = timesOk?.[endExclusive - 1]
  const timeRangeUtc =
    isFiniteNumber(firstBar) && isFiniteNumber(lastBar)
      ? { firstBar, lastBar }
      : null

  return {
    bars,
    closeFirst: isFiniteNumber(closeFirst) ? closeFirst : null,
    closeLast: isFiniteNumber(closeLast) ? closeLast : null,
    closeChangePct,
    timeRangeUtc,
  }
}

function deltaInSlice(
  series: ReadonlyArray<number | null> | undefined,
  expectedLength: number,
  start: number,
  endExclusive: number,
): number | null {
  if (!series || series.length !== expectedLength) return null
  const seg = series.slice(start, endExclusive)
  const { first, last } = lastFiniteInRange(seg)
  if (first == null || last == null) return null
  return Number((last - first).toFixed(2))
}

function classifySetup(args: {
  priorPct: number | null
  lastDayPct: number | null
  focusDays: number
}): { code: SetupCode; label: string; tone: SetupTone } {
  const prior = args.priorPct
  const day = args.lastDayPct
  if (prior == null || day == null) {
    return { code: "unknown", label: "Context unclear", tone: "neutral" }
  }

  const absDay = Math.abs(day)
  if (absDay < 0.15) return { code: "pause", label: "Pause / consolidation", tone: "neutral" }

  const sameSign = Math.sign(prior) === Math.sign(day) && Math.sign(prior) !== 0
  const flipped = Math.sign(prior) !== Math.sign(day) && Math.sign(day) !== 0
  const focusDenom = Math.max(1, Math.min(6, args.focusDays - 1))
  const priorPerDay = prior / focusDenom
  const accel = sameSign && absDay > Math.abs(priorPerDay) * 1.75

  if (accel) {
    const tone: SetupTone = prior > 0 ? "positive" : "negative"
    return {
      code: "acceleration",
      label: prior > 0 ? "Uptrend acceleration" : "Downtrend acceleration",
      tone,
    }
  }
  if (sameSign) {
    const tone: SetupTone = prior > 0 ? "positive" : "negative"
    return {
      code: "continuation",
      label: prior > 0 ? "Uptrend continuation" : "Downtrend continuation",
      tone,
    }
  }
  if (flipped) return { code: "reversal_attempt", label: "Possible reversal attempt", tone: "neutral" }
  return {
    code: "pullback",
    label:
      prior > 0 && day < 0
        ? "Bull trend pullback (24h down)"
        : prior < 0 && day > 0
          ? "Bear trend bounce (24h up)"
          : "Pullback / mean-reversion",
    tone: "neutral",
  }
}

function computeContextVsLastDaySummary(validated: IndicatorExplainRequest): ContextVsLastDaySummary | null {
  const closes = validated.marketContext?.closeHistory
  if (!closes?.length) return null

  const focusDays = resolveFocusDays(validated.timeframe)
  const { start: focusStart, mode: focusMode } = startIndexLastCalendarDays(
    validated.marketContext?.closeTimesUtc,
    closes.length,
    focusDays,
  )

  const fallbackBars = validated.timeframe === "30d" ? 24 : 2
  const { start: dayStartRaw, mode: lastDayMode } = startIndexLastSeconds(
    validated.marketContext?.closeTimesUtc,
    closes.length,
    SECONDS_PER_DAY,
    fallbackBars,
  )
  const dayStart = Math.max(focusStart, dayStartRaw)

  const prior = sliceStats({
    closes,
    timesUtc: validated.marketContext?.closeTimesUtc,
    start: focusStart,
    endExclusive: dayStart,
  })
  const lastDay = sliceStats({
    closes,
    timesUtc: validated.marketContext?.closeTimesUtc,
    start: dayStart,
    endExclusive: closes.length,
  })

  const setup = classifySetup({
    priorPct: prior?.closeChangePct ?? null,
    lastDayPct: lastDay?.closeChangePct ?? null,
    focusDays,
  })

  const base: ContextVsLastDaySummaryBase = {
    timeframe: validated.timeframe,
    focusDays,
    focusMode,
    lastDayMode,
    prior,
    lastDay,
    setup,
  }

  if (validated.indicatorType === "marketVision") {
    const rsiDeltaPrior = deltaInSlice(validated.snapshot.rsiHistory, closes.length, focusStart, dayStart)
    const rsiDeltaLastDay = deltaInSlice(validated.snapshot.rsiHistory, closes.length, dayStart, closes.length)
    const mfDeltaPrior = deltaInSlice(validated.snapshot.moneyFlowHistory, closes.length, focusStart, dayStart)
    const mfDeltaLastDay = deltaInSlice(validated.snapshot.moneyFlowHistory, closes.length, dayStart, closes.length)

    const p = prior?.closeChangePct
    const r = rsiDeltaPrior
    const momentumAgreement =
      p == null || r == null ? "unknown" : Math.sign(p) === Math.sign(r) ? "confirming" : "diverging"

    return {
      ...base,
      indicatorType: "marketVision",
      rsiDeltaPrior,
      rsiDeltaLastDay,
      moneyFlowDeltaPrior: mfDeltaPrior,
      moneyFlowDeltaLastDay: mfDeltaLastDay,
      momentumAgreement,
    }
  }

  if (validated.indicatorType === "bollinger") {
    const indDeltaPrior = deltaInSlice(validated.snapshot.indicatorHistory, closes.length, focusStart, dayStart)
    const indDeltaLastDay = deltaInSlice(validated.snapshot.indicatorHistory, closes.length, dayStart, closes.length)

    const bb = validated.snapshot
    const bandPositionNow =
      isFiniteNumber(bb.indicatorCurrent) && isFiniteNumber(bb.upperCurrent) && isFiniteNumber(bb.lowerCurrent)
        ? bb.indicatorCurrent > bb.upperCurrent
          ? "above_upper"
          : bb.indicatorCurrent < bb.lowerCurrent
            ? "below_lower"
            : "inside"
        : "unknown"

    const p = prior?.closeChangePct
    const r = indDeltaPrior
    const momentumAgreement =
      p == null || r == null ? "unknown" : Math.sign(p) === Math.sign(r) ? "confirming" : "diverging"

    return {
      ...base,
      indicatorType: "bollinger",
      indicatorDeltaPrior: indDeltaPrior,
      indicatorDeltaLastDay: indDeltaLastDay,
      bandPositionNow,
      momentumAgreement,
    }
  }

  if (validated.indicatorType === "bbwp") {
    const bbDeltaPrior = deltaInSlice(validated.snapshot.bbwpHistory, closes.length, focusStart, dayStart)
    const bbDeltaLastDay = deltaInSlice(validated.snapshot.bbwpHistory, closes.length, dayStart, closes.length)
    const volatilityRegime =
      bbDeltaLastDay == null
        ? "unknown"
        : Math.abs(bbDeltaLastDay) < 0.25
          ? "flat"
          : bbDeltaLastDay > 0
            ? "expanding"
            : "contracting"

    return {
      ...base,
      indicatorType: "bbwp",
      bbwpDeltaPrior: bbDeltaPrior,
      bbwpDeltaLastDay: bbDeltaLastDay,
      volatilityRegime,
    }
  }

  // rsiDivergences
  const rsiDeltaPrior = deltaInSlice(validated.snapshot.rsiHistory, closes.length, focusStart, dayStart)
  const rsiDeltaLastDay = deltaInSlice(validated.snapshot.rsiHistory, closes.length, dayStart, closes.length)

  const times =
    validated.marketContext?.closeTimesUtc && validated.marketContext.closeTimesUtc.length === closes.length
      ? validated.marketContext.closeTimesUtc
      : null
  const focusStartTime = times?.[focusStart] ?? null
  const dayStartTime = times?.[dayStart] ?? null

  function countsInRange(divs: ReadonlyArray<z.infer<typeof RsiDivergencesSnapshotDivergenceSchema>>, startTime: number, endTime: number | null): Record<string, number> {
    return divs
      .filter((d) => d.endTime >= startTime && (endTime == null || d.endTime < endTime))
      .reduce(
        (acc, d) => {
          acc[d.type] = (acc[d.type] ?? 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )
  }

  const divergencesPriorCounts =
    isFiniteNumber(focusStartTime) && isFiniteNumber(dayStartTime)
      ? countsInRange(validated.snapshot.divergences, focusStartTime, dayStartTime)
      : null

  const divergencesLastDayCounts =
    isFiniteNumber(dayStartTime)
      ? countsInRange(validated.snapshot.divergences, dayStartTime, null)
      : null

  const latestDivergenceLastDay =
    isFiniteNumber(dayStartTime)
      ? (validated.snapshot.divergences.filter((d) => d.endTime >= dayStartTime).slice(-1)[0] ?? null)
      : null

  const p = prior?.closeChangePct
  const r = rsiDeltaPrior
  const momentumAgreement =
    p == null || r == null ? "unknown" : Math.sign(p) === Math.sign(r) ? "confirming" : "diverging"

  return {
    ...base,
    indicatorType: "rsiDivergences",
    rsiDeltaPrior,
    rsiDeltaLastDay,
    divergencesPriorCounts,
    divergencesLastDayCounts,
    latestDivergenceLastDay: latestDivergenceLastDay ? { ...latestDivergenceLastDay } : null,
    momentumAgreement,
  }
}

function resolveFocusDays(timeframe: string): number {
  // TimeScaleSelector values:
  // - 1Q  => "30d"
  // - 1Y  => "max"
  // - Max => "2y"
  if (timeframe === "30d") return 7
  if (timeframe === "max") return 30
  if (timeframe === "2y") return 90
  return DEFAULT_FOCUS_DAYS
}

function startIndexLastCalendarDays(
  timesUtc: readonly number[] | undefined,
  closesLength: number,
  focusDays: number,
): { start: number; mode: "calendar_utc" | "last_n_bars" } {
  if (!timesUtc || timesUtc.length !== closesLength || closesLength < 1) {
    return { start: Math.max(0, closesLength - focusDays), mode: "last_n_bars" }
  }
  const latest = timesUtc[closesLength - 1]
  if (latest === undefined || !Number.isFinite(latest)) {
    return { start: Math.max(0, closesLength - focusDays), mode: "last_n_bars" }
  }
  const cutoff = latest - focusDays * SECONDS_PER_DAY
  for (let i = 0; i < closesLength; i++) {
    const t = timesUtc[i]
    if (t !== undefined && t >= cutoff) return { start: i, mode: "calendar_utc" }
  }
  return { start: Math.max(0, closesLength - 1), mode: "calendar_utc" }
}

function lastFiniteInRange(values: ReadonlyArray<number | null>): { first: number | null; last: number | null } {
  let first: number | null = null
  let last: number | null = null
  for (const v of values) {
    if (v != null && Number.isFinite(v)) {
      if (first == null) first = v
      last = v
    }
  }
  return { first, last }
}

/** Compact focus slice for prompt: primary analysis window. */
function buildFocus(validated: IndicatorExplainRequest, focusDays: number): Record<string, unknown> | null {
  const closes = validated.marketContext?.closeHistory
  if (!closes?.length) return null

  const { start, mode } = startIndexLastCalendarDays(
    validated.marketContext?.closeTimesUtc,
    closes.length,
    focusDays,
  )
  const wCloses = closes.slice(start)
  const wTimes =
    validated.marketContext?.closeTimesUtc &&
    validated.marketContext.closeTimesUtc.length === closes.length
      ? validated.marketContext.closeTimesUtc.slice(start)
      : undefined

  const c0 = wCloses[0]
  const c1 = wCloses[wCloses.length - 1]
  const closePct =
    c0 !== undefined && c1 !== undefined ? pctChange(c0, c1) : null

  function sampleEvenly<T>(arr: readonly T[], max: number): { sampled: T[]; sampling: null | { mode: "even"; originalBars: number; keptBars: number } } {
    if (arr.length <= max) return { sampled: [...arr], sampling: null }
    if (max <= 1) return { sampled: [arr[arr.length - 1]!], sampling: { mode: "even", originalBars: arr.length, keptBars: 1 } }

    const out: T[] = []
    const last = arr.length - 1
    for (let i = 0; i < max; i++) {
      const idx = Math.round((i * last) / (max - 1))
      out.push(arr[idx]!)
    }
    return { sampled: out, sampling: { mode: "even", originalBars: arr.length, keptBars: max } }
  }

  const { sampled: closesFocus, sampling } = sampleEvenly(wCloses, MAX_BARS_IN_FOCUS)
  const times7d =
    wTimes?.length && wTimes.length === wCloses.length
      ? sampleEvenly(wTimes, MAX_BARS_IN_FOCUS).sampled
      : undefined

  const base: Record<string, unknown> = {
    interpretation: `Primary focus: last **${focusDays} calendar days** (approx).`,
    windowMode: mode,
    barsInWindow: wCloses.length,
    sampling,
    closeChangePctInWindow: closePct,
    closeFirstInWindow: c0 ?? null,
    closeLastInWindow: c1 ?? null,
    windowTimeRangeUtc:
      times7d?.length && times7d.length === closesFocus.length
        ? {
            firstBar: times7d[0] ?? null,
            lastBar: times7d[times7d.length - 1] ?? null,
          }
        : null,
    closeHistoryFocus: closesFocus,
  }

  if (validated.indicatorType === "marketVision") {
    const rsi = validated.snapshot.rsiHistory.slice(start)
    const mf = validated.snapshot.moneyFlowHistory.slice(start)
    const { first: rsi0, last: rsi1 } = lastFiniteInRange(rsi)
    const { first: mf0, last: mf1 } = lastFiniteInRange(mf)
    const rsiFocus = sampleEvenly(rsi, MAX_BARS_IN_FOCUS).sampled
    const mfFocus = sampleEvenly(mf, MAX_BARS_IN_FOCUS).sampled
    return {
      ...base,
      rsiHistoryFocus: rsiFocus,
      moneyFlowHistoryFocus: mfFocus,
      rsiDeltaFirstToLastFiniteFocus:
        rsi0 != null && rsi1 != null ? Number((rsi1 - rsi0).toFixed(2)) : null,
      moneyFlowDeltaFirstToLastFiniteFocus:
        mf0 != null && mf1 != null ? Number((mf1 - mf0).toFixed(2)) : null,
      wt1Current: validated.snapshot.wt1Current,
      wt2Current: validated.snapshot.wt2Current,
      rsiCurrent: validated.snapshot.rsiCurrent,
      moneyFlowCurrent: validated.snapshot.moneyFlowCurrent,
    }
  }

  if (validated.indicatorType === "bollinger") {
    const ind = validated.snapshot.indicatorHistory.slice(start)
    const { first: i0, last: i1 } = lastFiniteInRange(ind)
    const indFocus = sampleEvenly(ind, MAX_BARS_IN_FOCUS).sampled
    const upperFocus = sampleEvenly(validated.snapshot.upperHistory.slice(start), MAX_BARS_IN_FOCUS).sampled
    const lowerFocus = sampleEvenly(validated.snapshot.lowerHistory.slice(start), MAX_BARS_IN_FOCUS).sampled
    return {
      ...base,
      indicatorHistoryFocus: indFocus,
      upperHistoryFocus: upperFocus,
      lowerHistoryFocus: lowerFocus,
      rsiDeltaFirstToLastFiniteFocus:
        i0 != null && i1 != null ? Number((i1 - i0).toFixed(2)) : null,
      indicatorCurrent: validated.snapshot.indicatorCurrent,
      upperCurrent: validated.snapshot.upperCurrent,
      lowerCurrent: validated.snapshot.lowerCurrent,
      basisCurrent: validated.snapshot.basisCurrent,
    }
  }

  if (validated.indicatorType === "rsiDivergences") {
    const ind = validated.snapshot.rsiHistory.slice(start)
    const { first: i0, last: i1 } = lastFiniteInRange(ind)
    const cutoffTime = wTimes?.length ? (wTimes[0] ?? null) : null
    const divs = validated.snapshot.divergences
    const divs7d =
      cutoffTime != null ? divs.filter((d) => d.endTime >= cutoffTime) : divs
    const counts = divs7d.reduce(
      (acc, d) => {
        acc[d.type] = (acc[d.type] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
    const latest = divs7d.length ? divs7d[divs7d.length - 1] : divs.length ? divs[divs.length - 1] : null
    const indFocus = sampleEvenly(ind, MAX_BARS_IN_FOCUS).sampled

    return {
      ...base,
      rsiHistoryFocus: indFocus,
      rsiDeltaFirstToLastFiniteFocus: i0 != null && i1 != null ? Number((i1 - i0).toFixed(2)) : null,
      rsiCurrent: validated.snapshot.rsiCurrent,
      divergencesFocusCounts: counts,
      latestDivergenceFocus: latest,
      settings: validated.snapshot.settings,
    }
  }

  const bb = validated.snapshot.bbwpHistory.slice(start)
  const { first: b0, last: b1 } = lastFiniteInRange(bb)
  const bbFocus = sampleEvenly(bb, MAX_BARS_IN_FOCUS).sampled
  return {
    ...base,
    bbwpHistoryFocus: bbFocus,
    bbwpDeltaFirstToLastFiniteFocus: b0 != null && b1 != null ? Number((b1 - b0).toFixed(2)) : null,
    bbwpCurrent: validated.snapshot.bbwpCurrent,
    bbwpLookbackSetting: validated.snapshot.lookback,
  }
}

/** Short derived stats from full payload closes (context behind the focus window). */
function buildDerivedCloseHints(validated: IndicatorExplainRequest): string {
  const closes = validated.marketContext?.closeHistory
  if (!closes || closes.length < 2) return ""

  const lines: string[] = []
  const first = closes[0]
  const last = closes[closes.length - 1]
  if (first !== undefined && last !== undefined) {
    const w = pctChange(first, last)
    if (w != null)
      lines.push(`Full payload (~${closes.length} bars): close→close ${w >= 0 ? "+" : ""}${w.toFixed(2)}%`)
  }

  return lines.join("\n")
}

function formatTokenLabel(token: IndicatorExplainRequest["token"]): string {
  const symbol = token.symbol?.trim()
  const name = token.name?.trim()
  if (name && symbol) return `${name} (${symbol.toUpperCase()})`
  if (symbol) return symbol.toUpperCase()
  if (name) return name
  return token.coinId
}

interface BasePromptParts {
  payload: IndicatorExplainRequest
  tokenLabel: string
  derivedCloses: string
  focus7d: Record<string, unknown> | null
  focusDays: number
  compare: ContextVsLastDaySummary | null
}

function buildBasePromptParts(validated: IndicatorExplainRequest, compare: ContextVsLastDaySummary | null): BasePromptParts {
  // Compute focus window from the full (untrimmed) payload so intraday series can still
  // represent the full last-7-calendar-days window even if we later trim for token budget.
  const focusDays = resolveFocusDays(validated.timeframe)
  const focus7d = buildFocus(validated, focusDays)
  const payload = forPrompt(validated)
  return {
    payload,
    tokenLabel: formatTokenLabel(payload.token),
    derivedCloses: buildDerivedCloseHints(payload),
    focus7d,
    focusDays,
    compare,
  }
}

function buildSharedSections(p: BasePromptParts): string {
  return `
**Asset / window**
- Token: ${p.tokenLabel} (id: ${p.payload.token.coinId})
- Chart timeframe label: ${p.payload.timeframe}

**PRIMARY — last ${p.focusDays} days (calendar-aware when timestamps exist)**  
Anchor most of your analysis here. Use the longer JSON below only for broader context if it helps.
 ${p.focus7d ? JSON.stringify(p.focus7d, null, 2) : "(no closeHistory — cannot isolate focus window)"}

- If \`windowMode\` is \`calendar_utc\`, bars are those with \`closeTimesUtc >= lastBar - ${p.focusDays} days\`.
- If \`last_n_bars\`, timestamps were missing/misaligned — treat the window as an **approximation** (often OK for ~daily candles).

**COMPARE — context vs last 24h (calendar-aware when timestamps exist)**  
Use this section to explicitly compare the **prior part** of the focus window vs the **last 24h**. Do not invent missing values.
${p.compare ? JSON.stringify(p.compare, null, 2) : "(not enough aligned closeHistory to compute prior-vs-last-24h comparison)"}

**GROUNDING JSON (full trailing payload)** — only numeric facts you may use. Do not invent values. Treat nulls as unknown.
${JSON.stringify(p.payload, null, 2)}

**Broad payload context** (closes; 7d is still primary):
${p.derivedCloses || "(no usable closeHistory in payload)"}
`.trim()
}

function buildMarketVisionPrompt(validated: IndicatorExplainRequest & { indicatorType: "marketVision" }): string {
  const p = buildBasePromptParts(validated, computeContextVsLastDaySummary(validated))
  return `
You are a technical analyst for cryptocurrency charts. The user opened **Explain** on the **Market Vision** indicator card.

${buildSharedSections(p)}

**Indicator mechanics (how it works)**
- **RSI (0–100)**: momentum oscillator; rising RSI = strengthening momentum; falling RSI = weakening. If RSI is outside 0–100, treat it as an invalid print.
- **WaveTrend (WT1/WT2)**: two smoothed momentum lines; crossings and slope shifts often mark momentum regime changes.
- **Money flow**: a momentum/flow proxy derived from price/volume behavior; rising vs falling can confirm or contradict price impulse.

**Instructions**
- Output **Markdown** only. Be concise and trader-focused.
- Start with a single **TL;DR** line that uses the **COMPARE** section:\n  \`TL;DR: <setup.label> — prev <prior.closeChangePct>% vs 24h <lastDay.closeChangePct>%\` (if values are missing, say \`TL;DR: Context unclear\`).\n  Use the exact numbers from JSON; do not invent.
- Lead with the last ~${p.focusDays} days: price path in that window (\`closeChangePctInWindow\`) vs **RSI trend**, **WT1 vs WT2**, and **money flow trend** in the focus slice.
- Explicitly state what the **COMPARE** section implies: continuation / pullback / reversal attempt / acceleration / pause (use \`setup.code\` + \`setup.label\` when present).
- Call out whether momentum is **confirming vs diverging** when the comparison provides \`momentumAgreement\`.
- Call out **agreement vs disagreement** (e.g. price up but momentum/flow fading).
- Use **bold** sparingly. 2–4 short paragraphs or tight bullets.
- Do not dump the JSON back; interpret it.
`.trim()
}

function buildBollingerPrompt(validated: IndicatorExplainRequest & { indicatorType: "bollinger" }): string {
  const p = buildBasePromptParts(validated, computeContextVsLastDaySummary(validated))
  return `
You are a technical analyst for cryptocurrency charts. The user opened **Explain** on the **Bollinger-on-indicator** card.

${buildSharedSections(p)}

**Indicator mechanics (how it works)**
- The payload provides an **indicator value** plus **upper/lower/basis** bands.
- Bands typically represent a moving average (**basis**) plus/minus a volatility measure (often standard deviation).  
  Practical read: **near/above upper** = stretched/strong momentum; **near/below lower** = stretched/weak momentum.
- **Band expansion** suggests increasing volatility in the indicator; **band contraction** suggests compression (often precedes bigger moves).

**Instructions**
- Output **Markdown** only. Be concise and trader-focused.
- Start with a single **TL;DR** line that uses the **COMPARE** section:\n  \`TL;DR: <setup.label> — prev <prior.closeChangePct>% vs 24h <lastDay.closeChangePct>%\` (if values are missing, say \`TL;DR: Context unclear\`).\n  Use the exact numbers from JSON; do not invent.
- Lead with the last ~${p.focusDays} days: how the indicator behaved **relative to its bands** in the focus slice (stretch vs mean reversion, compression vs expansion).
- Then relate that to the 7d price window (\`closeChangePctInWindow\`) and whether the indicator is confirming or warning.
- Explicitly interpret the **COMPARE** section as one of: continuation / pullback / reversal attempt / acceleration / pause.
- If \`bandPositionNow\` is available, mention it (above upper / below lower / inside) and what that suggests about extension risk.
- If the underlying indicator is RSI-like and prints outside 0–100, do not label overbought/oversold on that number.
- Use **bold** sparingly. 2–4 short paragraphs or tight bullets.
- Do not dump the JSON back; interpret it.
`.trim()
}

function buildBBWPPrompt(validated: IndicatorExplainRequest & { indicatorType: "bbwp" }): string {
  const p = buildBasePromptParts(validated, computeContextVsLastDaySummary(validated))
  return `
You are a technical analyst for cryptocurrency charts. The user opened **Explain** on the **BBWP** (Bollinger BandWidth Percentile) card.

${buildSharedSections(p)}

**Indicator mechanics (how it works)**
- **BBWP** is a **percentile (0–100)** of Bollinger BandWidth over a lookback window: low = volatility contraction vs history; high = volatility expansion vs history.
- BBWP is **not directional** by itself; it describes regime (quiet vs active). Direction comes from price + other momentum context.
- The \`lookback\` setting changes what “percentile” means (shorter = more reactive; longer = more regime-focused).

**Instructions**
- Output **Markdown** only. Be concise and trader-focused.
- Start with a single **TL;DR** line that uses the **COMPARE** section:\n  \`TL;DR: <setup.label> — prev <prior.closeChangePct>% vs 24h <lastDay.closeChangePct>%\` (if values are missing, say \`TL;DR: Context unclear\`).\n  Use the exact numbers from JSON; do not invent.
- Lead with the last ~${p.focusDays} days: identify whether BBWP implies **coiling (low percentile)**, **expanding (rising)**, or **elevated volatility (high)** in the focus slice.
- Translate that into a trader-useful read: “expect expansion risk” / “regime already active” and tie it to the 7d price move (\`closeChangePctInWindow\`).
- Use the **COMPARE** section to say whether the last 24h move looks like a continuation / pullback / reversal attempt / acceleration / pause, and whether volatility is contracting or expanding (if \`volatilityRegime\` is available).
- Use **bold** sparingly. 2–4 short paragraphs or tight bullets.
- Do not dump the JSON back; interpret it.
`.trim()
}

function buildRsiDivergencesPrompt(validated: IndicatorExplainRequest & { indicatorType: "rsiDivergences" }): string {
  const p = buildBasePromptParts(validated, computeContextVsLastDaySummary(validated))
  return `
You are a technical analyst for cryptocurrency charts. The user opened **Explain** on the **RSI divergences** indicator card.

${buildSharedSections(p)}

**Indicator mechanics (how it works)**
- **RSI (0–100)**: momentum oscillator; rising RSI = strengthening momentum; falling RSI = weakening momentum.
- This indicator finds **pivot highs/lows** on both **price** and **RSI**, pairs them (TV-like pairing with a ±bar tolerance), then flags divergence:
  - **Bull (regular)**: price makes a **lower low** while RSI makes a **higher low**.
  - **Bear (regular)**: price makes a **higher high** while RSI makes a **lower high**.
  - **H_Bull (hidden)**: price makes a **higher low** while RSI makes a **lower low**.
  - **H_Bear (hidden)**: price makes a **lower high** while RSI makes a **higher high**.

**Instructions**
- Output **Markdown** only. Be concise and trader-focused.
- Start with a single **TL;DR** line that uses the **COMPARE** section:\n  \`TL;DR: <setup.label> — prev <prior.closeChangePct>% vs 24h <lastDay.closeChangePct>%\` (if values are missing, say \`TL;DR: Context unclear\`).\n  Use the exact numbers from JSON; do not invent.
- Anchor the analysis on the last ~${p.focusDays} days window. Mention the **latest divergence(s)** in that window (type + direction) and whether RSI is near **30/70**.
- If there are no divergences in the focus window, say so and describe the RSI trend vs price trend instead.
- Use the **COMPARE** section to classify the last 24h action vs prior context (continuation / pullback / reversal attempt / acceleration / pause). If \`divergencesLastDayCounts\` is available, mention whether divergences support or contradict that.
- Use **bold** sparingly. 2–4 short paragraphs or tight bullets.
- Do not dump the JSON back; interpret it.
`.trim()
}

function buildAnalysisPrompt(validated: IndicatorExplainRequest): string {
  if (validated.indicatorType === "marketVision") return buildMarketVisionPrompt(validated)
  if (validated.indicatorType === "bollinger") return buildBollingerPrompt(validated)
  if (validated.indicatorType === "rsiDivergences") return buildRsiDivergencesPrompt(validated)
  return buildBBWPPrompt(validated)
}

function encodeBase64Json(value: unknown): string {
  const json = JSON.stringify(value)
  // Node.js runtime
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64")
  // Edge/runtime fallback
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof btoa !== "undefined") return btoa(unescape(encodeURIComponent(json)))
  return ""
}

export async function POST(request: Request) {
  try {
    const raw = await request.text()
    let json: unknown

    try {
      const parsed = JSON.parse(raw)
      json = parsed && typeof parsed === "object" && "prompt" in parsed
        ? JSON.parse((parsed as { prompt: string }).prompt)
        : parsed
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const validated = RequestSchema.parse(json)

    if (!gemini) {
      return new Response(JSON.stringify({ error: "Gemini client not configured (GEMINI_API_KEY)" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    }

    const comparison = computeContextVsLastDaySummary(validated)
    const prompt = buildAnalysisPrompt(validated)

    const result = streamText({
      model: gemini("gemini-2.5-flash"),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      maxOutputTokens: 2500,
      abortSignal: request.signal,
    } as Parameters<typeof streamText>[0])

    // UI message stream (SSE) — pairs with useCompletion default streamProtocol ("data"), not plain text.
    return result.toUIMessageStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
        ...(comparison ? { "X-Indicator-Comparison": encodeBase64Json(comparison) } : {}),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Invalid request shape", details: error.errors }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    console.error("analyze-indicator error:", error)
    return new Response(JSON.stringify({ error: "Failed to generate explanation" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
