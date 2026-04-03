import { NextResponse, type NextRequest } from "next/server"
import type { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { generateText } from "ai"
import { ratelimit } from "@v1/kv/ratelimit"

import { api } from "../../../../../convex/_generated/api"
import { convex, getServerToken } from "@/lib/convex-server"
import { gemini, isGeminiAvailable } from "@/lib/gemini"
import { shouldApplySmartScreenerResult } from "@/lib/smart-screener/client-result"
import type { CoingeckoMarketRowLike } from "@/lib/smart-screener/metric-catalog"
import { SMART_SCREENER_METRICS, getSmartScreenerMetric } from "@/lib/smart-screener/metric-registry"
import type { PriceHistoryPointLike } from "@/lib/smart-screener/technical-metrics"
import {
  ScreeningDslSchema,
  formatDslSummary,
  type ScreeningDsl,
  type ScreenFilterOp,
} from "@/lib/smart-screener/screening-dsl"
import {
  SmartScreenerScreenInterpretResponseSchema,
  SmartScreenerScreenRequestSchema,
  SmartScreenerScreenResponseSchema,
} from "@/lib/smart-screener/screen-api"
import { promptLooksLikeConstraints } from "@/lib/smart-screener/prompt-gating"

function safeJsonParse(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null

  function tryParse(candidate: string): unknown {
    try {
      return JSON.parse(candidate)
    } catch {
      return null
    }
  }

  const direct = tryParse(trimmed)
  if (direct) return direct

  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  const fenceParsed = tryParse(withoutFences)
  if (fenceParsed) return fenceParsed

  const firstObj = withoutFences.indexOf("{")
  const lastObj = withoutFences.lastIndexOf("}")
  if (firstObj >= 0 && lastObj > firstObj) {
    const slice = withoutFences.slice(firstObj, lastObj + 1)
    const slicedParsed = tryParse(slice)
    if (slicedParsed) return slicedParsed
  }

  return null
}

function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (!forwarded) return "127.0.0.1"
  const first = forwarded.split(",")[0]?.trim()
  return first && first.length > 0 ? first : "127.0.0.1"
}

function normalizeFilterValue(args: {
  metricUnit: string
  raw: number
}): number {
  if (!Number.isFinite(args.raw)) return args.raw

  if (args.metricUnit === "ratio") {
    return args.raw > 1 ? args.raw / 100 : args.raw
  }

  if (args.metricUnit === "percent") {
    // Heuristic: allow 0.1 to mean 10% when the user/model outputs a decimal.
    return Math.abs(args.raw) <= 1 ? args.raw * 100 : args.raw
  }

  return args.raw
}

function compare(op: ScreenFilterOp, left: number, right: number): boolean {
  if (op === "gt") return left > right
  if (op === "gte") return left >= right
  if (op === "lt") return left < right
  if (op === "lte") return left <= right
  return left === right
}

function scoreRowAgainstMarketFilters(args: {
  row: CoingeckoMarketRowLike
  filters: ScreeningDsl["filters"]
  missingByMetricId: Record<string, number>
}): boolean {
  for (const f of args.filters) {
    const metric = getSmartScreenerMetric(f.metricId)
    if (!metric || metric.source !== "markets") continue

    const rawValue = metric.getValue(args.row)
    if (rawValue == null) {
      args.missingByMetricId[f.metricId] = (args.missingByMetricId[f.metricId] ?? 0) + 1
      return false
    }

    const left = rawValue
    const right = normalizeFilterValue({ metricUnit: metric.unit, raw: f.value })
    if (!compare(f.op, left, right)) return false
  }

  return true
}

function scoreRowAgainstTechnicalFilters(args: {
  row: CoingeckoMarketRowLike
  filters: ScreeningDsl["filters"]
  seriesByDays: Record<string, ReadonlyArray<PriceHistoryPointLike> | undefined>
  missingByMetricId: Record<string, number>
}): boolean {
  for (const f of args.filters) {
    const metric = getSmartScreenerMetric(f.metricId)
    if (!metric || metric.source !== "priceHistory") continue

    const points = args.seriesByDays[metric.timeframeDays] ?? []
    const rawValue = metric.getValue(points)
    if (rawValue == null) {
      args.missingByMetricId[f.metricId] = (args.missingByMetricId[f.metricId] ?? 0) + 1
      return false
    }

    const left = rawValue
    const right = normalizeFilterValue({ metricUnit: metric.unit, raw: f.value })
    if (!compare(f.op, left, right)) return false
  }

  return true
}

function sortRows(args: {
  rows: Array<CoingeckoMarketRowLike>
  dsl: ScreeningDsl
  seriesById: Record<string, Record<string, ReadonlyArray<PriceHistoryPointLike> | undefined> | undefined>
}): Array<CoingeckoMarketRowLike> {
  if (!args.dsl.sort) return args.rows
  const metric = getSmartScreenerMetric(args.dsl.sort.metricId)
  if (!metric) return args.rows

  const order = args.dsl.sort.order
  return args.rows.slice().sort((a, b) => {
    const aSeries = args.seriesById[a.coingeckoId] ?? {}
    const bSeries = args.seriesById[b.coingeckoId] ?? {}

    const av =
      metric.source === "markets"
        ? metric.getValue(a)
        : metric.getValue(aSeries[metric.timeframeDays] ?? [])
    const bv =
      metric.source === "markets"
        ? metric.getValue(b)
        : metric.getValue(bSeries[metric.timeframeDays] ?? [])
    const aNum = av == null ? Number.NEGATIVE_INFINITY : av
    const bNum = bv == null ? Number.NEGATIVE_INFINITY : bv
    if (order === "desc") return aNum > bNum ? -1 : aNum < bNum ? 1 : 0
    return aNum < bNum ? -1 : aNum > bNum ? 1 : 0
  })
}

function buildMetricCatalogForPrompt(): string {
  return SMART_SCREENER_METRICS.map((m) => {
    const synonyms = m.synonyms.length > 0 ? ` (synonyms: ${m.synonyms.join(", ")})` : ""
    const unitHint =
      m.unit === "usd"
        ? "USD number (allow compact like 10m)"
        : m.unit === "percent"
          ? "percent points (10 means 10%)"
          : m.unit === "ratio"
            ? "ratio 0..1 (55% => 0.55)"
            : m.unit === "rank"
              ? "integer rank (1 is highest)"
              : "number"
    const sourceHint =
      m.source === "markets" ? "markets" : `history ${m.timeframeDays}d`
    return `- ${m.id}: ${m.label} [${unitHint}; source=${sourceHint}]${synonyms}`
  }).join("\n")
}

const ScreenResponseSchema = SmartScreenerScreenResponseSchema

async function interpretDsl(args: {
  systemPrompt: string
  text: string
  abortSignal: AbortSignal
}): Promise<z.infer<typeof SmartScreenerScreenInterpretResponseSchema> | null> {
  const interpret = await generateText({
    model: gemini!("gemini-2.5-flash"),
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.text },
    ],
    temperature: 0.1,
    maxOutputTokens: 450,
    abortSignal: args.abortSignal,
  })

  const raw = interpret.text.trim()
  const json = safeJsonParse(raw)
  const validated = SmartScreenerScreenInterpretResponseSchema.safeParse(json)
  return validated.success ? validated.data : null
}

export async function debugSmartScreenerInterpret(args: {
  text: string
  abortSignal: AbortSignal
}): Promise<{
  isGeminiAvailable: boolean
  attempts: Array<{
    rawText: string
    parsedJson: unknown
    schemaOk: boolean
    schemaIssues: Array<{ path: Array<string | number>; message: string }>
  }>
}> {
  if (!isGeminiAvailable || !gemini) {
    return { isGeminiAvailable: false, attempts: [] }
  }

  const metricCatalog = buildMetricCatalogForPrompt()
  const basePrompt = `
You are an intent parser for a crypto smart screener.

Return valid JSON ONLY with shape:
{
  "dsl": {
    "filters": [{ "metricId": string, "op": "gt"|"gte"|"lt"|"lte"|"eq", "value": number }],
    "sort": { "metricId": string, "order": "asc"|"desc" } | null,
    "limit": number,
    "universe": "all"|"current"|"watchlist"
  },
  "confidence": number
}

Available metrics (ONLY use these metricId values):
${metricCatalog}

Rules:
- Output MUST be valid JSON only. No markdown, no prose.
- Prefer using numeric values, not strings.
- For money, use a number. Examples: 200m => 200000000, $5m => 5000000.
- For percent metrics: use percent points (10 means 10%).
- For ratio metrics: use 0..1 (55% => 0.55).
    `.trim()

  async function runOnce(systemPrompt: string): Promise<{
    rawText: string
    parsedJson: unknown
    schemaOk: boolean
    schemaIssues: Array<{ path: Array<string | number>; message: string }>
  }> {
    const res = await generateText({
      model: gemini!("gemini-2.5-flash"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: args.text },
      ],
      temperature: 0.1,
      maxOutputTokens: 450,
      abortSignal: args.abortSignal,
    })
    const rawText = res.text.trim()
    const parsedJson = safeJsonParse(rawText)
    const validated = SmartScreenerScreenInterpretResponseSchema.safeParse(parsedJson)
    return {
      rawText,
      parsedJson,
      schemaOk: validated.success,
      schemaIssues: validated.success
        ? []
        : validated.error.issues.map((i) => ({ path: i.path, message: i.message })),
    }
  }

  const a1 = await runOnce(basePrompt)
  const a2 = await runOnce(`${basePrompt}\n\nYour previous output was invalid. Return valid JSON only.`)

  return { isGeminiAvailable: true, attempts: [a1, a2] }
}

export async function runSmartScreenerScreen(args: {
  text: string
  surface: z.infer<typeof SmartScreenerScreenRequestSchema>["surface"]
  current: z.infer<typeof SmartScreenerScreenRequestSchema>["current"]
  abortSignal: AbortSignal
}): Promise<z.infer<typeof SmartScreenerScreenResponseSchema>> {
  const intentConfidenceThreshold = 0.6
  const { text, surface, current, abortSignal } = args

  if (!isGeminiAvailable || !gemini) {
    return {
      ok: false,
      confidence: 0,
      dsl: ScreeningDslSchema.parse({ filters: [], sort: null, limit: 250, universe: "all" }),
      summary: "",
      resultIds: [],
      rows: [],
      coverage: {
        scanned: 0,
        matched: 0,
        maxRankScanned: null,
        missingByMetricId: {},
        warmupScheduled: false,
        warmupTopN: null,
        marketChartWarmupRequestedCount: 0,
        marketChartWarmupDays: [],
      },
      userMessage: "Smart screener is not configured yet.",
    }
  }

  const metricCatalog = buildMetricCatalogForPrompt()
  const systemPrompt = `
You are an intent parser for a crypto smart screener.

Return valid JSON ONLY with shape:
{
  "dsl": {
    "filters": [{ "metricId": string, "op": "gt"|"gte"|"lt"|"lte"|"eq", "value": number }],
    "sort": { "metricId": string, "order": "asc"|"desc" } | null,
    "limit": number,
    "universe": "all"|"current"|"watchlist"
  },
  "confidence": number
}

Available metrics (ONLY use these metricId values):
${metricCatalog}

Rules:
- Output MUST be valid JSON only. No markdown, no prose.
- Prefer using numeric values, not strings.
- For money, use a number. Examples: 200m => 200000000, $5m => 5000000.
- For percent metrics: use percent points (10 means 10%).
- For ratio metrics: use 0..1 (55% => 0.55).
- \"limit\" MUST be a number (1..500). If you don't know, omit it.
- If user asks for "top" or "highest", encode as sort desc. If "lowest", sort asc.
- If user asks for "all coins" or "the market", set universe="all".
- If you are not confident, set confidence <= 0.4 and return an empty filters list.
    `.trim()

  const first = await interpretDsl({ systemPrompt, text, abortSignal })
  const validated =
    first ??
    (await interpretDsl({
      systemPrompt: `${systemPrompt}\n\nYour previous output was invalid JSON or did not match schema. Return valid JSON only.`,
      text: `User prompt:\n${text}`,
      abortSignal,
    }))

  if (!validated) {
    return {
      ok: false,
      confidence: 0,
      dsl: ScreeningDslSchema.parse({ filters: [], sort: null, limit: 250, universe: "all" }),
      summary: "",
      resultIds: [],
      rows: [],
      coverage: {
        scanned: 0,
        matched: 0,
        maxRankScanned: null,
        missingByMetricId: {},
        warmupScheduled: false,
        warmupTopN: null,
        marketChartWarmupRequestedCount: 0,
        marketChartWarmupDays: [],
      },
      userMessage: "Couldn’t interpret that. Try rephrasing with concrete metrics (e.g. “fdv under 200m”).",
    }
  }

  const dsl = validated.dsl
  const confidence = validated.confidence

  if (dsl.filters.length === 0 && promptLooksLikeConstraints(text)) {
    return {
      ok: false,
      confidence: Math.min(confidence, 0.4),
      dsl,
      summary: formatDslSummary(dsl),
      resultIds: [],
      rows: [],
      coverage: {
        scanned: 0,
        matched: 0,
        maxRankScanned: null,
        missingByMetricId: {},
        warmupScheduled: false,
        warmupTopN: null,
        marketChartWarmupRequestedCount: 0,
        marketChartWarmupDays: [],
      },
      userMessage: "That looks like a constraints query, but I couldn’t map it to supported metrics. Try rephrasing.",
    }
  }

  const shouldApply = shouldApplySmartScreenerResult({
    ok: true,
    confidence,
    actionsCount: dsl.filters.length + (dsl.sort ? 1 : 0),
    threshold: intentConfidenceThreshold,
  })

  if (!shouldApply) {
    return {
      ok: false,
      confidence,
      dsl,
      summary: formatDslSummary(dsl),
      resultIds: [],
      rows: [],
      coverage: {
        scanned: 0,
        matched: 0,
        maxRankScanned: null,
        missingByMetricId: {},
        warmupScheduled: false,
        warmupTopN: null,
        marketChartWarmupRequestedCount: 0,
        marketChartWarmupDays: [],
      },
      userMessage: "Couldn’t confidently interpret that. Try rephrasing.",
    }
  }

  const maxCandidates = 5000
  const pageSize = 500
  const maxPages = Math.ceil(maxCandidates / pageSize)

  const missingByMetricId: Record<string, number> = {}
  const matchedRows: Array<CoingeckoMarketRowLike> = []
  const prefilteredRows: Array<CoingeckoMarketRowLike> = []
  const seriesById: Record<string, Record<string, ReadonlyArray<PriceHistoryPointLike> | undefined> | undefined> =
    {}

  let scanned = 0
  let minRank = 1
  let maxRankScanned: number | null = null

  const restrictIds =
    Array.isArray(current?.coingeckoIds) && current.coingeckoIds.length > 0 ? new Set(current.coingeckoIds) : null

  const technicalDaysNeeded = new Set<string>()
  for (const f of dsl.filters) {
    const m = getSmartScreenerMetric(f.metricId)
    if (m?.source === "priceHistory") technicalDaysNeeded.add(m.timeframeDays)
  }
  if (dsl.sort) {
    const m = getSmartScreenerMetric(dsl.sort.metricId)
    if (m?.source === "priceHistory") technicalDaysNeeded.add(m.timeframeDays)
  }

  const needsTechnical = technicalDaysNeeded.size > 0
  const prefilterCap = needsTechnical ? Math.min(600, Math.max(150, dsl.limit * 4)) : dsl.limit

  for (let page = 0; page < maxPages; page += 1) {
    const pageRows = await convex.query(api.coingeckoMarkets.getMarketDataPageByRank, {
      serverToken: getServerToken(),
      minRank,
      limit: pageSize,
    })

    if (pageRows.length === 0) break
    const lastRank = pageRows[pageRows.length - 1]?.marketCapRank
    if (typeof lastRank === "number") {
      maxRankScanned = maxRankScanned ? Math.max(maxRankScanned, lastRank) : lastRank
      minRank = lastRank + 1
    } else {
      minRank += pageSize
    }

    for (const row of pageRows) {
      if (scanned >= maxCandidates) break
      scanned += 1

      if (restrictIds && !restrictIds.has(row.coingeckoId)) continue
      if (!scoreRowAgainstMarketFilters({ row, filters: dsl.filters, missingByMetricId })) continue

      if (!needsTechnical) {
        matchedRows.push(row)
        if (matchedRows.length >= dsl.limit) break
        continue
      }

      prefilteredRows.push(row)
      if (prefilteredRows.length >= prefilterCap) break
    }

    if (scanned >= maxCandidates) break
    if (!needsTechnical && matchedRows.length >= dsl.limit) break
    if (needsTechnical && prefilteredRows.length >= prefilterCap) break
  }

  let marketChartWarmupRequestedCount = 0
  const marketChartWarmupDays = new Set<string>()

  if (needsTechnical && prefilteredRows.length > 0) {
    const serverToken = getServerToken()
    const uniqueIds = Array.from(new Set(prefilteredRows.map((r) => r.coingeckoId))).slice(0, prefilterCap)
    const daysList = Array.from(technicalDaysNeeded)
    const warmupKeys = new Set<string>()

    async function loadSeries(inner: {
      coingeckoId: string
      days: string
    }): Promise<{ points: ReadonlyArray<PriceHistoryPointLike>; stale: boolean }> {
      const res = await convex.query(api.coingeckoReads.getPriceHistorySeries, {
        serverToken,
        coingeckoId: inner.coingeckoId,
        timeframe: inner.days,
      })
      const points = (res.data ?? []).map((p: { timestamp: number; price: number }) => ({
        timestamp: p.timestamp,
        price: p.price,
      }))
      return { points, stale: Boolean(res.stale) }
    }

    const tasks: Array<Promise<void>> = []
    for (const coingeckoId of uniqueIds) {
      tasks.push(
        (async () => {
          const byDays: Record<string, ReadonlyArray<PriceHistoryPointLike> | undefined> = {}
          for (const days of daysList) {
            const { points, stale } = await loadSeries({ coingeckoId, days })
            byDays[days] = points

            const shouldWarmup = points.length === 0 || stale
            if (shouldWarmup && marketChartWarmupRequestedCount < 25) {
              const key = `${coingeckoId}:${days}`
              if (!warmupKeys.has(key)) {
                warmupKeys.add(key)
                marketChartWarmupRequestedCount += 1
                marketChartWarmupDays.add(days)
                void convex
                  .mutation(api.coingeckoWarmup.requestMarketChartRefresh, {
                    serverToken,
                    coingeckoId,
                    days,
                  })
                  .catch(() => null)
              }
            }
          }
          seriesById[coingeckoId] = byDays
        })(),
      )

      if (tasks.length >= 12) {
        await Promise.all(tasks)
        tasks.length = 0
      }
    }
    if (tasks.length > 0) await Promise.all(tasks)

    for (const row of prefilteredRows) {
      const byDays = seriesById[row.coingeckoId] ?? {}
      if (!scoreRowAgainstTechnicalFilters({ row, filters: dsl.filters, seriesByDays: byDays, missingByMetricId }))
        continue
      matchedRows.push(row)
      if (matchedRows.length >= dsl.limit) break
    }
  }

  const sorted = sortRows({ rows: matchedRows, dsl, seriesById }).slice(0, dsl.limit)
  const limitedRows = sorted.map((row) => ({
    coingeckoId: row.coingeckoId,
    symbol: row.symbol,
    name: row.name,
    image: row.image,
    currentPrice: row.currentPrice,
    marketCap: row.marketCap,
    marketCapRank: row.marketCapRank,
    totalVolume: row.totalVolume,
    priceChangePercentage24h: row.priceChangePercentage24h,
    updatedAt: row.updatedAt,
  }))

  const resultIds = sorted.map((r) => r.coingeckoId)
  const warmupScheduled = scanned >= maxCandidates && resultIds.length < dsl.limit && dsl.universe === "all"
  let warmupTopN: number | null = null
  if (warmupScheduled) {
    warmupTopN = 5000
    void convex
      .mutation(api.coingeckoWarmup.requestTopMarketsRefresh, {
        serverToken: getServerToken(),
        topN: warmupTopN,
      })
      .catch(() => null)
  }

  const summary = formatDslSummary(dsl)
  const userMessage =
    warmupScheduled
      ? "Results may be partial. Warming up deeper market data now—try again in a moment."
      : resultIds.length === 0 && marketChartWarmupRequestedCount > 0
        ? "No matches yet. Some history-based metrics are warming up—try again in a moment."
        : marketChartWarmupRequestedCount > 0
          ? "Some history-based metrics are warming up. Results may improve if you re-run in a moment."
          : resultIds.length === 0
            ? "No matches. Try lowering thresholds or removing a constraint."
            : null

  const resp = {
    ok: true,
    confidence,
    dsl,
    summary,
    resultIds: resultIds.slice(0, 500),
    rows: limitedRows,
    coverage: {
      scanned,
      matched: resultIds.length,
      maxRankScanned,
      missingByMetricId,
      warmupScheduled,
      warmupTopN,
      marketChartWarmupRequestedCount,
      marketChartWarmupDays: Array.from(marketChartWarmupDays),
    },
    userMessage,
  }

  const final = SmartScreenerScreenResponseSchema.safeParse(resp)
  return final.success ? final.data : (resp as z.infer<typeof SmartScreenerScreenResponseSchema>)
}

export async function POST(req: NextRequest) {
  const authResult = await auth()
  const clerkId = authResult.userId
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const ip = getRequestIp(req)
  try {
    const rateLimitResult = await ratelimit.limit(`${ip}-${clerkId}-smart-screener-screen`)
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
  } catch {
    // Never let rate limiting take down screening.
  }

  const body = await req.json().catch(() => null)
  const parsed = SmartScreenerScreenRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  const { text, surface, current } = parsed.data
  const result = await runSmartScreenerScreen({
    text,
    surface,
    current,
    abortSignal: req.signal,
  })

  const final = SmartScreenerScreenResponseSchema.safeParse(result)
  return NextResponse.json(final.success ? final.data : result, { status: 200 })
}

