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

    return {
      ...base,
      rsiHistory7d: cap(ind),
      rsiDeltaFirstToLastFinite7d: i0 != null && i1 != null ? Number((i1 - i0).toFixed(2)) : null,
      rsiCurrent: validated.snapshot.rsiCurrent,
      divergences7dCounts: counts,
      latestDivergence7d: latest,
      settings: validated.snapshot.settings,
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

interface BasePromptParts {
  payload: IndicatorExplainRequest
  tokenLabel: string
  derivedCloses: string
  focus7d: Record<string, unknown> | null
}

function buildBasePromptParts(validated: IndicatorExplainRequest): BasePromptParts {
  const payload = forPrompt(validated)
  return {
    payload,
    tokenLabel: formatTokenLabel(payload.token),
    derivedCloses: buildDerivedCloseHints(payload),
    focus7d: buildLast7DaysFocus(payload),
  }
}

function buildSharedSections(p: BasePromptParts): string {
  return `
**Asset / window**
- Token: ${p.tokenLabel} (id: ${p.payload.token.coinId})
- Chart timeframe label: ${p.payload.timeframe}

**PRIMARY — last ${FOCUS_DAYS} days (calendar-aware when timestamps exist)**  
Anchor most of your analysis here. Use the longer JSON below only for broader context if it helps.
${p.focus7d ? JSON.stringify(p.focus7d, null, 2) : "(no closeHistory — cannot isolate 7d window)"}

- If \`windowMode\` is \`calendar_utc\`, bars are those with \`closeTimesUtc >= lastBar - ${FOCUS_DAYS} days\`.
- If \`last_n_bars\`, timestamps were missing/misaligned — treat the window as an **approximation** (often OK for ~daily candles).

**GROUNDING JSON (full trailing payload)** — only numeric facts you may use. Do not invent values. Treat nulls as unknown.
${JSON.stringify(p.payload, null, 2)}

**Broad payload context** (closes; 7d is still primary):
${p.derivedCloses || "(no usable closeHistory in payload)"}
`.trim()
}

function buildMarketVisionPrompt(validated: IndicatorExplainRequest & { indicatorType: "marketVision" }): string {
  const p = buildBasePromptParts(validated)
  return `
You are a technical analyst for cryptocurrency charts. The user opened **Explain** on the **Market Vision** indicator card.

${buildSharedSections(p)}

**Indicator mechanics (how it works)**
- **RSI (0–100)**: momentum oscillator; rising RSI = strengthening momentum; falling RSI = weakening. If RSI is outside 0–100, treat it as an invalid print.
- **WaveTrend (WT1/WT2)**: two smoothed momentum lines; crossings and slope shifts often mark momentum regime changes.
- **Money flow**: a momentum/flow proxy derived from price/volume behavior; rising vs falling can confirm or contradict price impulse.

**Instructions**
- Output **Markdown** only. Be concise and trader-focused.
- Lead with the last ~${FOCUS_DAYS} days: price path in that window (\`closeChangePctInWindow\`) vs **RSI trend**, **WT1 vs WT2**, and **money flow trend** in the 7d slice.
- Call out **agreement vs disagreement** (e.g. price up but momentum/flow fading).
- Use **bold** sparingly. 2–4 short paragraphs or tight bullets.
- Do not dump the JSON back; interpret it.
`.trim()
}

function buildBollingerPrompt(validated: IndicatorExplainRequest & { indicatorType: "bollinger" }): string {
  const p = buildBasePromptParts(validated)
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
- Lead with the last ~${FOCUS_DAYS} days: how the indicator behaved **relative to its bands** in the 7d slice (stretch vs mean reversion, compression vs expansion).
- Then relate that to the 7d price window (\`closeChangePctInWindow\`) and whether the indicator is confirming or warning.
- If the underlying indicator is RSI-like and prints outside 0–100, do not label overbought/oversold on that number.
- Use **bold** sparingly. 2–4 short paragraphs or tight bullets.
- Do not dump the JSON back; interpret it.
`.trim()
}

function buildBBWPPrompt(validated: IndicatorExplainRequest & { indicatorType: "bbwp" }): string {
  const p = buildBasePromptParts(validated)
  return `
You are a technical analyst for cryptocurrency charts. The user opened **Explain** on the **BBWP** (Bollinger BandWidth Percentile) card.

${buildSharedSections(p)}

**Indicator mechanics (how it works)**
- **BBWP** is a **percentile (0–100)** of Bollinger BandWidth over a lookback window: low = volatility contraction vs history; high = volatility expansion vs history.
- BBWP is **not directional** by itself; it describes regime (quiet vs active). Direction comes from price + other momentum context.
- The \`lookback\` setting changes what “percentile” means (shorter = more reactive; longer = more regime-focused).

**Instructions**
- Output **Markdown** only. Be concise and trader-focused.
- Lead with the last ~${FOCUS_DAYS} days: identify whether BBWP implies **coiling (low percentile)**, **expanding (rising)**, or **elevated volatility (high)** in the 7d slice.
- Translate that into a trader-useful read: “expect expansion risk” / “regime already active” and tie it to the 7d price move (\`closeChangePctInWindow\`).
- Use **bold** sparingly. 2–4 short paragraphs or tight bullets.
- Do not dump the JSON back; interpret it.
`.trim()
}

function buildRsiDivergencesPrompt(validated: IndicatorExplainRequest & { indicatorType: "rsiDivergences" }): string {
  const p = buildBasePromptParts(validated)
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
- Anchor the analysis on the last ~${FOCUS_DAYS} days window. Mention the **latest divergence(s)** in that window (type + direction) and whether RSI is near **30/70**.
- If there are no divergences in the 7d window, say so and describe the RSI trend vs price trend instead.
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
