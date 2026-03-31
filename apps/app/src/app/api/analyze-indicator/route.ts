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
const FOCUS_DAYS = 7
/** Max bars we attach in the 7d focus JSON (keeps prompt size sane for intraday series). */
const MAX_BARS_IN_7D_FOCUS = 56

function startIndexLastCalendarDays(
  timesUtc: readonly number[] | undefined,
  closesLength: number,
): { start: number; mode: "calendar_utc" | "last_n_bars" } {
  if (!timesUtc || timesUtc.length !== closesLength || closesLength < 1) {
    return { start: Math.max(0, closesLength - FOCUS_DAYS), mode: "last_n_bars" }
  }
  const latest = timesUtc[closesLength - 1]
  if (latest === undefined || !Number.isFinite(latest)) {
    return { start: Math.max(0, closesLength - FOCUS_DAYS), mode: "last_n_bars" }
  }
  const cutoff = latest - FOCUS_DAYS * SECONDS_PER_DAY
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

/** Compact 7-day slice for prompt: primary analysis window. */
function buildLast7DaysFocus(validated: IndicatorExplainRequest): Record<string, unknown> | null {
  const closes = validated.marketContext?.closeHistory
  if (!closes?.length) return null

  const { start, mode } = startIndexLastCalendarDays(validated.marketContext?.closeTimesUtc, closes.length)
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

  const cap = <T,>(arr: readonly T[]): T[] => {
    if (arr.length <= MAX_BARS_IN_7D_FOCUS) return [...arr]
    return [...arr.slice(-MAX_BARS_IN_7D_FOCUS)]
  }

  const base: Record<string, unknown> = {
    interpretation: `Primary focus: last **${FOCUS_DAYS} calendar days** (approx).`,
    windowMode: mode,
    barsInWindow: wCloses.length,
    closeChangePctInWindow: closePct,
    closeFirstInWindow: c0 ?? null,
    closeLastInWindow: c1 ?? null,
    windowTimeRangeUtc:
      wTimes?.length && wTimes.length === wCloses.length
        ? {
            firstBar: wTimes[0] ?? null,
            lastBar: wTimes[wTimes.length - 1] ?? null,
          }
        : null,
  }

  if (validated.indicatorType === "marketVision") {
    const rsi = validated.snapshot.rsiHistory.slice(start)
    const mf = validated.snapshot.moneyFlowHistory.slice(start)
    const { first: rsi0, last: rsi1 } = lastFiniteInRange(rsi)
    const { first: mf0, last: mf1 } = lastFiniteInRange(mf)
    return {
      ...base,
      rsiHistory7d: cap(rsi),
      moneyFlowHistory7d: cap(mf),
      rsiDeltaFirstToLastFinite7d:
        rsi0 != null && rsi1 != null ? Number((rsi1 - rsi0).toFixed(2)) : null,
      moneyFlowDeltaFirstToLastFinite7d:
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
    return {
      ...base,
      indicatorHistory7d: cap(ind),
      upperHistory7d: cap(validated.snapshot.upperHistory.slice(start)),
      lowerHistory7d: cap(validated.snapshot.lowerHistory.slice(start)),
      rsiDeltaFirstToLastFinite7d:
        i0 != null && i1 != null ? Number((i1 - i0).toFixed(2)) : null,
      indicatorCurrent: validated.snapshot.indicatorCurrent,
      upperCurrent: validated.snapshot.upperCurrent,
      lowerCurrent: validated.snapshot.lowerCurrent,
      basisCurrent: validated.snapshot.basisCurrent,
    }
  }

  const bb = validated.snapshot.bbwpHistory.slice(start)
  const { first: b0, last: b1 } = lastFiniteInRange(bb)
  return {
    ...base,
    bbwpHistory7d: cap(bb),
    bbwpDeltaFirstToLastFinite7d: b0 != null && b1 != null ? Number((b1 - b0).toFixed(2)) : null,
    bbwpCurrent: validated.snapshot.bbwpCurrent,
    bbwpLookbackSetting: validated.snapshot.lookback,
  }
}

/** Short derived stats from full payload closes (context behind the 7d window). */
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

function buildAnalysisPrompt(validated: IndicatorExplainRequest): string {
  const payload = forPrompt(validated)
  const derivedCloses = buildDerivedCloseHints(payload)
  const focus7d = buildLast7DaysFocus(payload)
  const label = formatTokenLabel(payload.token)

  const indicatorLabel =
    payload.indicatorType === "marketVision"
      ? "Momentum (Market Vision): RSI + WaveTrend + money flow vs price."
      : payload.indicatorType === "bollinger"
        ? "RSI + Bollinger-style bands on the indicator (stretched vs contained)."
        : "BBWP: volatility percentile / bandwidth regime vs price."

  return `
You are a technical analyst for cryptocurrency charts. The user opened **Explain** on one indicator card.

**Asset / window**
- Token: ${label} (id: ${payload.token.coinId})
- Chart timeframe label: ${payload.timeframe}
- ${indicatorLabel}

**PRIMARY — last ${FOCUS_DAYS} days (calendar-aware when timestamps exist)**  
Anchor most of your analysis here. Use the longer JSON below only for broader context if it helps.
${focus7d ? JSON.stringify(focus7d, null, 2) : "(no closeHistory — cannot isolate 7d window)"}

- If \`windowMode\` is \`calendar_utc\`, bars are those with \`closeTimesUtc >= lastBar - ${FOCUS_DAYS} days\`.
- If \`last_n_bars\`, timestamps were missing/misaligned — treat the window as an **approximation** (often OK for ~daily candles).

**GROUNDING JSON (full trailing payload)** — only numeric facts you may use. Do not invent values. Treat nulls as unknown.
${JSON.stringify(payload, null, 2)}

**Broad payload context** (closes; 7d is still primary):
${derivedCloses || "(no usable closeHistory in payload)"}

**Instructions**
- Output **Markdown** only. Be concise and trader-focused.
- **Lead with the last ~${FOCUS_DAYS} days**: price path in that window (\`closeChangePctInWindow\`, histories) vs indicator behavior (momentum, bands, or BBWP regime). Then briefly note if the wider payload conflicts or confirms.
- For **marketVision**: WT1 vs WT2 vs price in the 7d window; RSI slope vs price; money flow trend vs price.
- For **bollinger**: RSI vs bands **in the 7d** slice — stretch / reversion vs continuation.
- For **bbwp**: volatility regime vs price **in the 7d** slice — coiling, expansion risk.
- If **RSI is outside 0–100**, invalid print — do not label overbought/oversold on that number.
- Use **bold** sparingly. 2–4 short paragraphs or tight bullets.
- Do not dump the JSON back; interpret it.
`.trim()
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
