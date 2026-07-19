import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { ratelimit } from "@v1/kv/ratelimit"
import { generateText, Output } from "ai"
import { api } from "../../../../../convex/_generated/api"
import { convex, getServerToken } from "@/lib/convex-server"
import { gemini, isGeminiAvailable } from "@/lib/gemini"
import {
  bollingerSignal,
  computeBbwPercentile,
  computeBollingerPercentB,
  computeRsiLast,
  dataQualityFromCounts,
  describeBriefChanges,
  squeezeSignal,
  dispersionFromChangePcts,
  dispersionFromSpread,
  dominantThemeLabel,
  filterEventsInWindow,
  getWindowMs,
  moodFromBreadthAndTone,
  numbersGroundedIn,
  rsiSignal,
  signedPct,
  summarizeTechnicals,
  toneCountsFromEvents,
  topEventKinds as computeTopEventKinds,
  trendFromCloses,
  truncateText,
  volatilityLevelFromCloses,
  type BreadthStats,
  type BriefFactsCore,
  type TechnicalLabels,
} from "@/lib/overview-daily-brief"

function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (!forwarded) return "127.0.0.1"
  const first = forwarded.split(",")[0]?.trim()
  return first && first.length > 0 ? first : "127.0.0.1"
}

// The brief is 24h-only; unknown body keys (e.g. a legacy `window`) are
// stripped by zod's default non-strict parsing.
const RequestSchema = z.object({
  force: z.boolean().optional(),
})

type CardKind = "regime" | "technicals" | "theme"
type CardTone = "positive" | "negative" | "neutral"

type BriefCard = {
  kind: CardKind
  title: string
  primary: string
  secondary: string | null
  body: string
  tone: CardTone
  details?: unknown
}

const AiCopySchema = z.object({
  summary: z.string().min(1).max(900),
  cardBodies: z.object({
    regime: z.string().min(1).max(320),
    technicals: z.string().min(1).max(320),
    theme: z.string().min(1).max(320),
  }),
})

const PriorFactsSchema = z.object({
  core: z.object({
    mood: z.enum(["risk_on", "risk_off", "mixed", "quiet"]),
    dispersion: z.enum(["high", "medium", "low", "muted"]),
    theme: z.string(),
    posture: z.enum([
      "Stretched",
      "Washed-out",
      "Elevated volatility",
      "Coiled",
      "Uptrend bias",
      "Downtrend bias",
      "Balanced",
      "Unclear",
    ]),
    topGainerSymbol: z.string().nullable(),
    topLoserSymbol: z.string().nullable(),
    eventCount: z.number(),
  }),
})

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

// Splits into sentences without treating decimal points ("+12.4%") as
// sentence boundaries.
function splitSentences(value: string): string[] {
  const guarded = normalizeText(value).replace(/(\d)\.(\d)/g, "$1\u0000$2")
  if (!guarded) return []
  const parts = guarded.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [guarded]
  return parts.map((p) => p.replaceAll("\u0000", ".").trim()).filter(Boolean)
}

function sentenceCount(value: string): number {
  return splitSentences(value).length
}

function clipSentences(value: string, max: number): string {
  const parts = splitSentences(value)
  if (parts.length === 0) return ""
  const clipped = parts.slice(0, max).join(" ").trim()
  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function buildCards(args: {
  windowLabel: string
  mood: "risk_on" | "risk_off" | "mixed" | "quiet"
  dispersion: "high" | "medium" | "low" | "muted"
  dataQuality: "solid" | "ok" | "patchy" | "unknown"
  covered: number | null
  coinCount: number | null
  technicals: ReturnType<typeof summarizeTechnicals>
  themeLabel: string
  windowEventsCount: number
  windowEventsUniqueCoins: number
  topEventKinds: string[]
  eventTone: CardTone
  eventToneCounts: { positive: number; negative: number; neutral: number }
  breadth: BreadthStats | null
  technicalSampleSize: number
}): Array<Omit<BriefCard, "body">> {
  const moodLabel =
    args.mood === "risk_on"
      ? "Risk-on"
      : args.mood === "risk_off"
        ? "Risk-off"
        : args.mood === "quiet"
          ? "Quiet"
          : "Mixed"

  const dispersionLabel = titleCase(args.dispersion)

  const coverageLine =
    args.coinCount && args.coinCount > 0 && args.covered != null
      ? `Coverage: ${Math.max(0, args.covered)}/${args.coinCount}`
      : `Coverage: ${titleCase(args.dataQuality)}`

  // Prefer full-watchlist breadth over event tone — tone is sparse and
  // mostly neutral, breadth actually describes participation.
  const participation = args.breadth
    ? ` • Breadth: ${args.breadth.advancers}↑/${args.breadth.decliners}↓`
    : args.windowEventsCount > 0
      ? ` • Tone: ${args.eventToneCounts.positive}↑/${args.eventToneCounts.negative}↓`
      : ""

  const regimeTone: CardTone =
    args.mood === "risk_on" ? "positive" : args.mood === "risk_off" ? "negative" : "neutral"

  const themeSecondary =
    args.windowEventsCount > 0
      ? `${args.windowEventsCount} events • ${args.windowEventsUniqueCoins} coins${args.topEventKinds.length > 0 ? ` • ${args.topEventKinds.join(" • ")}` : ""}`
      : "No notable watchlist events in this window."

  return [
    {
      kind: "regime",
      title: "Regime",
      primary: `Regime: ${moodLabel}`,
      secondary: `${coverageLine} • Dispersion: ${dispersionLabel}${participation}`,
      tone: regimeTone,
    },
    {
      kind: "technicals",
      title: "Technicals",
      primary: `Posture: ${args.technicals.posture}`,
      secondary: `RSI: ${args.technicals.rsi} • Trend: ${args.technicals.trend} • Vol: ${args.technicals.volatility}${args.technicalSampleSize > 0 ? ` • Sample: ${args.technicalSampleSize} names` : ""}`,
      tone: args.technicals.tone,
    },
    {
      kind: "theme",
      title: "Theme",
      primary: `Theme: ${args.themeLabel}`,
      secondary: themeSecondary,
      tone: args.eventTone,
    },
  ]
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await auth()
    const clerkId = authResult.userId
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const ip = getRequestIp(req)
    try {
      const rateLimitResult = await ratelimit.limit(`${ip}-${clerkId}-overview-daily-brief`)
      if (!rateLimitResult.success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
      }
    } catch (error) {
      console.warn("overview daily-brief ratelimit error (skipping):", error)
    }

    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const window = "24h" as const

    const snapshot = await convex.query(api.overview.getMyOverviewSnapshotForServer, {
      serverToken: getServerToken(),
      clerkId,
    })

    const now = Date.now()

    const moversBlock = snapshot?.movers24h

    const windowEvents = filterEventsInWindow(snapshot?.events.events ?? [], window, now)
    const topEventKinds = computeTopEventKinds(windowEvents, 2)

    const windowLabel = "the last day"

    const eventToneCounts = toneCountsFromEvents(windowEvents)

    const breadth: BreadthStats | null = moversBlock?.breadth ?? null

    const mood = moodFromBreadthAndTone({
      breadth,
      eventsCount: windowEvents.length,
      toneCounts: eventToneCounts,
    })

    const dispersion = breadth
      ? dispersionFromSpread(breadth.spreadPct)
      : dispersionFromChangePcts(
          [
            ...(moversBlock?.gainers ?? []).slice(0, 3),
            ...(moversBlock?.losers ?? []).slice(0, 3),
          ].map((row) => row?.changePct ?? 0),
        )

    const dataQuality = dataQualityFromCounts({
      coinCount: moversBlock?.coinCount ?? null,
      missingMarketDataCount: moversBlock?.missingMarketDataCount ?? null,
    })

    const themeLabel = dominantThemeLabel(topEventKinds)

    const timeframe = "7"
    const loadTechnicalLabels = async (coingeckoId: string | null): Promise<TechnicalLabels | null> => {
      if (!coingeckoId) return null
      try {
        const series = await convex.query(api.coingeckoReads.getPriceHistorySeries, {
          serverToken: getServerToken(),
          coingeckoId,
          timeframe,
        })
        const closes = (series.data ?? [])
          .map((p) => (Number.isFinite(p.close ?? Number.NaN) ? (p.close as number) : p.price))
          .filter((n) => typeof n === "number" && Number.isFinite(n))
        if (closes.length < 20) return null
        const rsi = computeRsiLast(closes, 14)
        return {
          rsi: rsiSignal(rsi),
          trend: trendFromCloses(closes, 16),
          volatility: volatilityLevelFromCloses(closes, 48),
          bollinger: bollingerSignal(computeBollingerPercentB(closes, 20, 2)),
          squeeze: squeezeSignal(computeBbwPercentile(closes, 20, 96)),
        }
      } catch {
        return null
      }
    }

    // Technicals sample the WATCHLIST, not just the ranked movers: every
    // mover (they're where the action is) plus a rotating daily slice of the
    // rest of the list, so over a week the whole watchlist gets covered.
    const TECH_SAMPLE_TARGET = 16
    const technicalCandidates = (() => {
      const byId = new Map<string, { coingeckoId: string; symbol: string }>()
      for (const row of [...(moversBlock?.gainers ?? []), ...(moversBlock?.losers ?? [])]) {
        if (row?.coingeckoId && !byId.has(row.coingeckoId)) {
          byId.set(row.coingeckoId, { coingeckoId: row.coingeckoId, symbol: row.symbol.toUpperCase() })
        }
      }
      const rest = (snapshot?.coins ?? []).filter((c) => !byId.has(c.coingeckoId))
      if (rest.length > 0) {
        const dayIndex = Math.floor(now / 86_400_000)
        const offset = dayIndex % rest.length
        const rotated = [...rest.slice(offset), ...rest.slice(0, offset)]
        for (const c of rotated) {
          if (byId.size >= TECH_SAMPLE_TARGET) break
          byId.set(c.coingeckoId, { coingeckoId: c.coingeckoId, symbol: c.symbol.toUpperCase() })
        }
      }
      return Array.from(byId.values()).slice(0, TECH_SAMPLE_TARGET)
    })()

    const technicalSamplesWithSymbol = (
      await Promise.all(
        technicalCandidates.map(async (c) => {
          const labels = await loadTechnicalLabels(c.coingeckoId)
          return labels ? { symbol: c.symbol, ...labels } : null
        }),
      )
    ).filter((x): x is { symbol: string } & TechnicalLabels => Boolean(x))
    const technicals = summarizeTechnicals(technicalSamplesWithSymbol)

    const windowEventsUniqueCoins = new Set(windowEvents.map((e) => e.coingeckoId)).size
    const eventTone: CardTone =
      eventToneCounts.positive > eventToneCounts.negative + 1
        ? "positive"
        : eventToneCounts.negative > eventToneCounts.positive + 1
          ? "negative"
          : "neutral"

    const covered =
      moversBlock &&
      Number.isFinite(moversBlock.coinCount ?? Number.NaN) &&
      Number.isFinite(moversBlock.missingMarketDataCount ?? Number.NaN)
        ? Math.max(0, (moversBlock.coinCount ?? 0) - (moversBlock.missingMarketDataCount ?? 0))
        : null

    const cardsBase = buildCards({
      windowLabel,
      mood,
      dispersion,
      dataQuality,
      covered,
      coinCount: moversBlock?.coinCount ?? null,
      technicals,
      themeLabel,
      windowEventsCount: windowEvents.length,
      windowEventsUniqueCoins,
      topEventKinds,
      eventTone,
      eventToneCounts,
      breadth,
      technicalSampleSize: technicalSamplesWithSymbol.length,
    })

    const toMoverFact = (row: { symbol: string; name: string; changePct: number }) => ({
      symbol: row.symbol.toUpperCase(),
      name: row.name,
      change: signedPct(row.changePct),
    })
    const gainerFacts = (moversBlock?.gainers ?? []).slice(0, 3).map(toMoverFact)
    const loserFacts = (moversBlock?.losers ?? []).slice(0, 3).map(toMoverFact)
    const topGainerFact = gainerFacts[0] ?? null
    const topLoserFact = loserFacts[0] ?? null

    // Most recent event per coin, so headlines cover breadth instead of one
    // noisy name.
    const pickedHeadlines = (() => {
      const sorted = [...windowEvents].sort((a, b) => b.occurredAtMs - a.occurredAtMs)
      const seen = new Set<string>()
      const picked: typeof sorted = []
      for (const e of sorted) {
        if (seen.has(e.coingeckoId)) continue
        seen.add(e.coingeckoId)
        picked.push(e)
        if (picked.length >= 5) break
      }
      return picked
    })()
    const headlineEvents = pickedHeadlines.map((e) => ({
      symbol: e.symbol.toUpperCase(),
      kind: e.kind,
      tone: e.tone,
      title: truncateText(e.title, 120),
    }))

    const core: BriefFactsCore = {
      mood,
      dispersion,
      theme: themeLabel,
      posture: technicals.posture,
      topGainerSymbol: topGainerFact?.symbol ?? null,
      topLoserSymbol: topLoserFact?.symbol ?? null,
      eventCount: windowEvents.length,
    }

    // Diff against the previous brief (if reasonably recent) so the copy can
    // lead with what actually changed instead of re-describing the same tape.
    let changesSinceLastBrief: string[] = []
    try {
      const prior = await convex.query(api.overview.getMyOverviewBriefFactsForServer, {
        serverToken: getServerToken(),
        clerkId,
        window,
      })
      if (prior && now - prior.generatedAt <= 3 * getWindowMs(window)) {
        const priorFacts = PriorFactsSchema.safeParse(prior.facts)
        if (priorFacts.success) {
          changesSinceLastBrief = describeBriefChanges(priorFacts.data.core, core)
        }
      }
    } catch (error) {
      console.warn("overview daily-brief prior-facts read failed (skipping delta):", error)
    }

    const facts = {
      window,
      windowLabel,
      watchlistCoinCount: snapshot?.watchlistCoinCount ?? 0,
      limited: snapshot?.limited ?? false,
      regime: {
        mood,
        dispersion,
        dataQuality,
        coveredCoins: covered,
        coinCount: moversBlock?.coinCount ?? null,
        eventToneCounts,
        breadth: breadth
          ? {
              advancers: breadth.advancers,
              decliners: breadth.decliners,
              flat: breadth.flat,
              medianChange: signedPct(breadth.medianChangePct),
              movedMoreThan5Pct: breadth.bigMovers,
            }
          : null,
      },
      movers: {
        gainers: gainerFacts,
        losers: loserFacts,
      },
      technicals: {
        sampleSize: technicalSamplesWithSymbol.length,
        posture: technicals.posture,
        rsi: technicals.rsi,
        trend: technicals.trend,
        volatility: technicals.volatility,
        byCoin: technicalSamplesWithSymbol.map((t) => ({
          symbol: t.symbol,
          rsi: t.rsi,
          trend: t.trend,
          volatility: t.volatility,
          bollinger: t.bollinger ?? "unknown",
          squeeze: t.squeeze ?? "unknown",
        })),
      },
      theme: {
        label: themeLabel,
        eventCount: windowEvents.length,
        uniqueCoins: windowEventsUniqueCoins,
        topKinds: topEventKinds,
        recentHeadlines: headlineEvents,
      },
      changesSinceLastBrief: changesSinceLastBrief.length > 0 ? changesSinceLastBrief : null,
    }

    const stretched = technicalSamplesWithSymbol
      .filter((t) => t.rsi === "overbought" || t.bollinger === "above_band")
      .map((t) => t.symbol)
    const washed = technicalSamplesWithSymbol
      .filter((t) => t.rsi === "oversold" || t.bollinger === "below_band")
      .map((t) => t.symbol)
    const coiled = technicalSamplesWithSymbol.filter((t) => t.squeeze === "squeeze").map((t) => t.symbol)
    const topHeadline = headlineEvents[0] ?? null

    // "News-driven tape" reads badly inside "the event tape leans …".
    const themePhrase = themeLabel === "News-driven tape" ? "news-driven" : themeLabel.toLowerCase()

    const breadthTotal = breadth ? breadth.advancers + breadth.decliners + breadth.flat : 0

    const defaultBodies: Record<CardKind, string> = {
      regime: breadth
        ? `${breadth.advancers} of ${breadthTotal} names advanced and ${breadth.bigMovers} moved more than 5%, ${
            mood === "risk_on"
              ? "so participation is broader than the leaders alone suggest"
              : mood === "risk_off"
                ? "so the weakness runs deeper than a few laggards"
                : "so direction is name-by-name rather than list-wide"
          }.`
        : windowEvents.length > 0
          ? `Signals split ${eventToneCounts.positive} positive / ${eventToneCounts.negative} negative across ${windowEvents.length} events${topGainerFact ? `, with ${topGainerFact.symbol} (${topGainerFact.change}) doing the most lifting` : ""}.`
          : "The tape is fairly quiet in this window, with fewer signals showing up than usual.",
      technicals:
        technicalSamplesWithSymbol.length > 0
          ? stretched.length > 0
            ? `${stretched.slice(0, 3).join(", ")} look${stretched.length === 1 ? "s" : ""} stretched (RSI/Bollinger), so follow-through there may be fragile.`
            : washed.length > 0
              ? `${washed.slice(0, 3).join(", ")} look${washed.length === 1 ? "s" : ""} washed-out (RSI/Bollinger), which can set up choppy rebounds.`
              : coiled.length > 0
                ? `${coiled.slice(0, 3).join(", ")} ${coiled.length === 1 ? "is" : "are"} coiling in unusually tight ranges, which often precedes a bigger move.`
                : `Across ${technicalSamplesWithSymbol.length} names sampled from the watchlist the posture reads ${technicals.posture.toLowerCase()}, with volatility ${technicals.volatility}.`
          : "Not enough price history is available to form a clean technical posture read right now.",
      theme: topHeadline
        ? `Recent items like “${truncateText(topHeadline.title, 90)}” (${topHeadline.symbol}) are setting the tone.`
        : "No single theme is dominating the watchlist event tape for this window.",
    }

    const fallbackSummary = (() => {
      const sentences: string[] = []

      if (topGainerFact && topLoserFact && topGainerFact.symbol !== topLoserFact.symbol) {
        sentences.push(
          `${topGainerFact.symbol} (${topGainerFact.change}) led your watchlist over ${windowLabel}, while ${topLoserFact.symbol} (${topLoserFact.change}) lagged.`,
        )
      } else if (topGainerFact) {
        sentences.push(`${topGainerFact.symbol} (${topGainerFact.change}) set the pace for your watchlist over ${windowLabel}.`)
      } else {
        sentences.push(`Here’s a quick note on your watchlist over ${windowLabel}.`)
      }

      const moodDesc =
        mood === "risk_on" ? "risk-on" : mood === "risk_off" ? "risk-off" : mood === "quiet" ? "quiet" : "mixed"
      if (breadth) {
        sentences.push(
          `Underneath, the tape reads ${moodDesc} — ${breadth.advancers} of ${breadthTotal} names up, ${breadth.decliners} down, with a median move of ${signedPct(breadth.medianChangePct)}.`,
        )
      } else {
        const dispersionDesc =
          dispersion === "high"
            ? "a handful of outsized moves driving the tone"
            : dispersion === "medium"
              ? "enough dispersion for quick leadership rotations"
              : dispersion === "low"
                ? "moves staying fairly contained"
                : "little movement to speak of"
        sentences.push(`The overall mood reads ${moodDesc}, with ${dispersionDesc}.`)
      }

      if (topHeadline) {
        sentences.push(
          `The event tape leans ${themePhrase} — most recently “${truncateText(topHeadline.title, 80)}” on ${topHeadline.symbol}.`,
        )
      } else {
        sentences.push("The event tape is light, so it’s mostly a price-action read.")
      }

      if (changesSinceLastBrief.length > 0) {
        sentences.push(`Since the last brief, ${changesSinceLastBrief.slice(0, 2).join(", and ")}.`)
      } else if (dataQuality === "patchy") {
        sentences.push("Data coverage is patchy, so consider regenerating once more market data lands.")
      } else if (snapshot?.limited) {
        sentences.push("This read is based on limited coverage right now, so keep it as directional context.")
      }

      return sentences.slice(0, 4).join(" ")
    })()

    let summary = normalizeText(fallbackSummary)
    const bodies: Record<CardKind, string> = { ...defaultBodies }
    let modelName: string | null = null

    if (isGeminiAvailable && gemini) {
      const system = `
You write short, grounded copy for a crypto watchlist dashboard brief.

The goal: an "Insight Note" — specific and informative, different every day because it leans on that day's actual data instead of generic market language.

Input is JSON with deterministic facts: regime (including breadth across the FULL watchlist — advancers/decliners, median move, how many names moved more than five percent), top movers, per-coin technicals, recent event headlines, and (optionally) what changed since the previous brief.

Output must be valid JSON only with:
{
  "summary": string,
  "cardBodies": {
    "regime": string,
    "technicals": string,
    "theme": string
  }
}

Rules:
- Ground every claim in the input JSON. Never invent numbers, symbols, or headlines. Reuse numeric values exactly as given (e.g. "+12.4%").
- summary: one paragraph, three to four sentences, no markdown.
  1) Lead with the most consequential specific: the standout mover(s) by symbol and change, or the dominant headline.
  2) Add regime context in plain language, preferring breadth ("X of Y names up, median move Z") over abstract mood words — the leaders are a handful of names, breadth is what describes the whole watchlist.
  3) If changesSinceLastBrief is non-null, work in what changed since the last brief; otherwise add theme color instead.
- cardBodies.regime: one or two sentences on participation, citing regime.breadth (advancers vs decliners, median move, big movers) when present; fall back to eventToneCounts otherwise.
- cardBodies.technicals: one or two sentences naming which sampled coins look stretched, washed-out, coiled (squeeze), or trending, using technicals.byCoin (rsi, bollinger band position, squeeze). The sample spans the watchlist, not just movers. If the sample is empty, say the read is limited.
- cardBodies.theme: one or two sentences tying the theme to concrete headlines — paraphrase a title and name the coins involved.
- Each card body must add information the summary did not already state; do not restate the deterministic labels shown next to the card.
- Avoid financial advice language ("buy", "sell", "should"). Calm, plain analyst tone.
      `.trim()

      try {
        modelName = "gemini-2.5-flash"
        const result = await generateText({
          model: gemini(modelName),
          system,
          prompt: JSON.stringify(facts, null, 2),
          output: Output.object({
            schema: AiCopySchema,
            name: "OverviewDailyBriefCopy",
            description: "A short summary paragraph and three card bodies.",
          }),
          temperature: 0.5,
          maxOutputTokens: 600,
          maxRetries: 2,
          abortSignal: req.signal,
        })

        const factsJson = JSON.stringify(facts)
        const out = result.output
        const nextSummary = normalizeText(out.summary)
        if (
          nextSummary &&
          numbersGroundedIn(nextSummary, factsJson) &&
          sentenceCount(nextSummary) >= 2 &&
          sentenceCount(nextSummary) <= 4
        ) {
          summary = nextSummary
        } else {
          console.warn(
            `overview daily-brief: AI summary rejected (grounded=${numbersGroundedIn(nextSummary, factsJson)}, sentences=${sentenceCount(nextSummary)}), using fallback`,
          )
        }

        const nextBodies: Record<CardKind, string> = {
          regime: clipSentences(out.cardBodies.regime, 2),
          technicals: clipSentences(out.cardBodies.technicals, 2),
          theme: clipSentences(out.cardBodies.theme, 2),
        }

        for (const kind of Object.keys(nextBodies) as CardKind[]) {
          const b = normalizeText(nextBodies[kind])
          if (!b || !numbersGroundedIn(b, factsJson)) {
            console.warn(`overview daily-brief: AI card body "${kind}" rejected, using fallback`)
            continue
          }
          bodies[kind] = b
        }
      } catch (error) {
        console.warn("overview daily-brief: gemini generation failed, using fallback:", error)
        modelName = null
      }
    }

    // Structured per-card payloads rendered as rich blocks in the UI (breadth
    // meter, per-coin technical groups, headline mini-list). Built
    // deterministically so they're present with or without AI copy.
    const groupedSymbols = new Set([...stretched, ...washed, ...coiled])
    const trendingUp = technicalSamplesWithSymbol
      .filter((t) => !groupedSymbols.has(t.symbol) && t.trend === "up")
      .map((t) => t.symbol)
    const trendingDown = technicalSamplesWithSymbol
      .filter((t) => !groupedSymbols.has(t.symbol) && t.trend === "down")
      .map((t) => t.symbol)

    const cardDetails: Record<CardKind, unknown> = {
      regime: {
        breadth: breadth
          ? {
              advancers: breadth.advancers,
              decliners: breadth.decliners,
              flat: breadth.flat,
              medianChangePct: breadth.medianChangePct,
              bigMovers: breadth.bigMovers,
            }
          : null,
        toneCounts: eventToneCounts,
        eventCount: windowEvents.length,
      },
      technicals: {
        sampleSize: technicalSamplesWithSymbol.length,
        groups: [
          { label: "Stretched", symbols: stretched },
          { label: "Washed-out", symbols: washed },
          { label: "Coiled", symbols: coiled },
          { label: "Uptrend", symbols: trendingUp },
          { label: "Downtrend", symbols: trendingDown },
        ].filter((g) => g.symbols.length > 0),
      },
      theme: {
        headlines: pickedHeadlines.slice(0, 3).map((e) => ({
          symbol: e.symbol.toUpperCase(),
          title: truncateText(e.title, 110),
          tone: e.tone,
          occurredAtMs: e.occurredAtMs,
        })),
      },
    }

    const cards: BriefCard[] = cardsBase.map((c) => ({
      ...c,
      body: bodies[c.kind],
      details: cardDetails[c.kind],
    }))

    const saved = await convex.mutation(api.overview.upsertMyOverviewBriefForServer, {
      serverToken: getServerToken(),
      clerkId,
      window,
      brief: {
        summary,
        headline: "Last day",
        bullets: [],
        risks: [],
        opportunities: [],
        cards,
        model: modelName,
      },
      facts: { version: 1, core },
    })

    return NextResponse.json(saved, { status: 200 })
  } catch (error) {
    console.error("overview daily-brief error:", error)
    return NextResponse.json({ error: "Failed to generate brief" }, { status: 500 })
  }
}
