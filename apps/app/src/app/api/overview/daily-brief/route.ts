import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { ratelimit } from "@v1/kv/ratelimit"
import { generateText, Output } from "ai"
import { api } from "../../../../../convex/_generated/api"
import { convex, getServerToken } from "@/lib/convex-server"
import { gemini, isGeminiAvailable } from "@/lib/gemini"
import {
  computeRsiLast,
  dataQualityFromCounts,
  dispersionFromChangePcts,
  dominantThemeLabel,
  filterEventsInWindow,
  moodFromToneCounts,
  rsiSignal,
  summarizeTechnicals,
  toneCountsFromEvents,
  topEventKinds as computeTopEventKinds,
  trendFromCloses,
  volatilityLevelFromCloses,
  type TechnicalLabels,
} from "@/lib/overview-daily-brief"

function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (!forwarded) return "127.0.0.1"
  const first = forwarded.split(",")[0]?.trim()
  return first && first.length > 0 ? first : "127.0.0.1"
}

const RequestSchema = z.object({
  window: z.enum(["24h", "7d"]),
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
}

const AiCopySchema = z.object({
  summary: z.string().min(1).max(700),
  cardBodies: z.object({
    regime: z.string().min(1).max(240),
    technicals: z.string().min(1).max(240),
    theme: z.string().min(1).max(240),
  }),
})

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function hasDigits(value: string): boolean {
  return /[0-9]/.test(value)
}

function sentenceCount(value: string): number {
  const text = normalizeText(value)
  if (!text) return 0
  const parts = text.split(/[.!?]+/).map((p) => p.trim()).filter(Boolean)
  return parts.length
}

function toOneSentence(value: string): string {
  const text = normalizeText(value)
  if (!text) return ""
  const match = text.match(/^(.+?[.!?])(\s|$)/)
  const one = match?.[1] ?? text
  return one.endsWith(".") || one.endsWith("!") || one.endsWith("?") ? one : `${one}.`
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
      secondary: `${coverageLine} • Dispersion: ${dispersionLabel}`,
      tone: regimeTone,
    },
    {
      kind: "technicals",
      title: "Technicals",
      primary: `Posture: ${args.technicals.posture}`,
      secondary: `RSI: ${args.technicals.rsi} • Trend: ${args.technicals.trend} • Vol: ${args.technicals.volatility}`,
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

    const window = parsed.data.window

    const snapshot = await convex.query(api.overview.getMyOverviewSnapshotForServer, {
      serverToken: getServerToken(),
      clerkId,
    })

    const now = Date.now()

    const moversBlock = window === "7d" ? snapshot?.movers7d : snapshot?.movers24h

    const windowEvents = filterEventsInWindow(snapshot?.events.events ?? [], window, now)
    const topEventKinds = computeTopEventKinds(windowEvents, 2)

    const windowLabel = window === "7d" ? "the last week" : "the last day"

    const eventToneCounts = toneCountsFromEvents(windowEvents)

    const mood = moodFromToneCounts({ eventsCount: windowEvents.length, toneCounts: eventToneCounts })

    const dispersion = dispersionFromChangePcts(
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

    const timeframe = window === "7d" ? "30" : "7"
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
        }
      } catch {
        return null
      }
    }

    const candidateIds = Array.from(
      new Set(
        [
          ...(moversBlock?.gainers ?? []).slice(0, 2).map((x) => x.coingeckoId),
          ...(moversBlock?.losers ?? []).slice(0, 2).map((x) => x.coingeckoId),
        ].filter(Boolean),
      ),
    ).slice(0, 4)

    const technicalSamples = (await Promise.all(candidateIds.map((id) => loadTechnicalLabels(id)))).filter(
      (x): x is TechnicalLabels => Boolean(x),
    )
    const technicals = summarizeTechnicals(technicalSamples)

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
    })

    const facts = {
      window,
      windowLabel,
      watchlistCoinCount: snapshot?.watchlistCoinCount ?? 0,
      limited: snapshot?.limited ?? false,
      insights: {
        mood,
        dispersion,
        dataQuality,
        theme: themeLabel,
      },
      technicals: {
        sampleSize: technicalSamples.length,
        posture: technicals.posture,
        rsi: technicals.rsi,
        trend: technicals.trend,
        volatility: technicals.volatility,
      },
      events: {
        countInWindow: windowEvents.length,
        uniqueCoins: windowEventsUniqueCoins,
        topKinds: topEventKinds,
        toneCounts: eventToneCounts,
      },
    }

    const defaultBodies: Record<CardKind, string> = {
      regime:
        mood === "quiet"
          ? "The tape is fairly quiet in this window, with fewer signals showing up than usual."
          : mood === "risk_on"
            ? "The watchlist reads more risk-on than risk-off, with upside-style signals outweighing downside ones."
            : mood === "risk_off"
              ? "The watchlist reads more risk-off than risk-on, with downside-style signals taking the lead."
              : "The watchlist reads mixed, with strength and weakness showing up at the same time.",
      technicals:
        technicalSamples.length > 0
          ? "Technicals look more posture-driven than name-driven here, which can make follow-through feel uneven."
          : "Not enough price history is available to form a clean technical posture read right now.",
      theme:
        windowEvents.length > 0
          ? "Events are clustering into a small set of themes, which usually explains why the feed feels repetitive."
          : "No single theme is dominating the watchlist event tape for this window.",
    }

    const fallbackSummary = (() => {
      const sentences: string[] = []
      sentences.push(`Here’s a quick note on your watchlist over ${windowLabel}.`)
      if (mood === "quiet") sentences.push("The tape feels quieter than usual, with fewer signals competing for attention.")
      if (mood === "risk_on") sentences.push("The mood leans risk-on overall, even if not every name is participating.")
      if (mood === "risk_off") sentences.push("The mood leans risk-off overall, with more downside-style signals showing up.")
      if (mood === "mixed") sentences.push("The mood reads mixed, with strength and weakness coexisting in the same window.")

      if (dispersion === "high") sentences.push("Dispersion is high, so a handful of moves can make the whole watchlist feel louder.")
      if (dispersion === "medium") sentences.push("Dispersion is noticeable, which can create quick leadership rotations.")
      if (dispersion === "muted") sentences.push("Dispersion is muted, so it’s more of a grind than a sprint.")

      if (windowEvents.length > 0) sentences.push(`The event tape clusters around ${themeLabel.toLowerCase()}, which helps explain what’s driving attention.`)
      else sentences.push("The event tape is light, so it’s mostly a price-action read.")

      if (technicals.posture === "Stretched") sentences.push("Technically, the group looks a bit stretched, so follow-through may feel fragile.")
      else if (technicals.posture === "Washed-out") sentences.push("Technically, the group looks washed-out in places, which can set up choppy rebounds.")
      else if (technicals.posture === "Elevated volatility") sentences.push("Technically, volatility looks elevated, which can widen the range of outcomes.")
      else if (technicals.posture === "Uptrend bias") sentences.push("Technically, the posture tilts upward, which can make dips feel shallower.")
      else if (technicals.posture === "Downtrend bias") sentences.push("Technically, the posture tilts downward, which can make rallies feel harder to sustain.")
      else if (technicals.posture === "Balanced") sentences.push("Technically, posture looks fairly balanced, which often leads to more selective follow-through.")
      else sentences.push("Technicals are a bit unclear right now, so treat this as a high-level read.")

      if (dataQuality === "patchy") sentences.push("Data coverage is patchy, so consider regenerating once more market data lands.")
      else if (snapshot?.limited) sentences.push("This read is based on limited coverage right now, so keep it as directional context.")

      const clipped = sentences.slice(0, 3)
      return clipped.join(" ")
    })()

    let summary = normalizeText(fallbackSummary)
    const bodies: Record<CardKind, string> = { ...defaultBodies }
    let modelName: string | null = null

    if (isGeminiAvailable && gemini) {
      const system = `
You write short, grounded UX copy for a crypto watchlist dashboard.

The goal: an "Insight Note" — a warm, narrative paragraph that feels human and non-repetitive.

Input is JSON with deterministic insights and counts. Do not re-state top gainers/losers; that information is shown elsewhere in the UI.

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
- Do not invent facts or numbers. Use only what's in the input JSON.
- Do not include any digits (0-9) in your output.
- summary: a single paragraph (3 sentences), conversational, no markdown. Do not mention token symbols or "top gainer/loser". Focus on mood, dispersion, and theme.
- Each card body: exactly 1 sentence, no markdown. It should add color, not repeat the deterministic lines.
- Avoid financial advice language ("buy", "sell", "should").

Style examples (do not copy verbatim):
- "This window feels mixed, with pockets of momentum but no clean direction. A recurring theme nudges the tape, making the feed feel louder than it is. Posture looks stretched, so reactions may outpace follow-through."
- "The watchlist reads calmer than usual, with fewer signals demanding attention. Themes tend to repeat, making the day feel headline-driven. Posture looks balanced, so follow-through may be selective."
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
            description: "A short summary paragraph and three one-sentence card bodies.",
          }),
          temperature: 0.2,
          maxOutputTokens: 500,
          maxRetries: 2,
          abortSignal: req.signal,
        })

        const out = result.output
        const nextSummary = normalizeText(out.summary)
        if (nextSummary && !hasDigits(nextSummary) && sentenceCount(nextSummary) >= 2 && sentenceCount(nextSummary) <= 4) {
          summary = nextSummary
        }

        const nextBodies: Record<CardKind, string> = {
          regime: toOneSentence(out.cardBodies.regime),
          technicals: toOneSentence(out.cardBodies.technicals),
          theme: toOneSentence(out.cardBodies.theme),
        }

        for (const kind of Object.keys(nextBodies) as CardKind[]) {
          const b = normalizeText(nextBodies[kind])
          if (!b || hasDigits(b)) continue
          bodies[kind] = b
        }
      } catch {
        modelName = null
      }
    }

    const cards: BriefCard[] = cardsBase.map((c) => ({
      ...c,
      body: bodies[c.kind],
    }))

    const saved = await convex.mutation(api.overview.upsertMyOverviewBriefForServer, {
      serverToken: getServerToken(),
      clerkId,
      window,
      brief: {
        summary,
        headline: window === "7d" ? "Last week" : "Last day",
        bullets: [],
        risks: [],
        opportunities: [],
        cards,
        model: modelName,
      },
    })

    return NextResponse.json(saved, { status: 200 })
  } catch (error) {
    console.error("overview daily-brief error:", error)
    return NextResponse.json({ error: "Failed to generate brief" }, { status: 500 })
  }
}
