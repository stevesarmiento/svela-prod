import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { ratelimit } from "@v1/kv/ratelimit"
import { generateText, Output } from "ai"
import { api } from "../../../../../convex/_generated/api"
import { convex, getServerToken } from "@/lib/convex-server"
import { gemini, isGeminiAvailable } from "@/lib/gemini"

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

const AiBriefSchema = z.object({
  summary: z.string().min(1).max(700),
  headline: z.string().min(1).max(160),
  bullets: z.array(z.string().min(1).max(220)).max(8).default([]),
  risks: z.array(z.string().min(1).max(220)).max(6).default([]),
  opportunities: z.array(z.string().min(1).max(220)).max(6).default([]),
})

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeList(items: ReadonlyArray<string>, max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of items) {
    const text = normalizeText(raw)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

function sanitizeAiBrief(brief: z.infer<typeof AiBriefSchema>): z.infer<typeof AiBriefSchema> {
  return {
    summary:
      normalizeText(brief.summary).slice(0, 700) ||
      "No major movers or notable events were detected in the current cache window.",
    headline: normalizeText(brief.headline).slice(0, 160) || "Overview brief",
    bullets: normalizeList(brief.bullets ?? [], 6),
    risks: normalizeList(brief.risks ?? [], 4),
    opportunities: normalizeList(brief.opportunities ?? [], 4),
  }
}

function buildFallbackBrief(args: {
  window: "24h" | "7d"
  topGainer?: { symbol: string; changePct: number }
  topLoser?: { symbol: string; changePct: number }
  eventKinds: string[]
}): z.infer<typeof AiBriefSchema> {
  const parts: string[] = []
  if (args.topGainer) {
    parts.push(
      `${args.topGainer.symbol.toUpperCase()} is leading over the last ${args.window} (${args.topGainer.changePct > 0 ? "+" : ""}${args.topGainer.changePct.toFixed(2)}%).`,
    )
  }
  if (args.topLoser) {
    parts.push(
      `${args.topLoser.symbol.toUpperCase()} is the main laggard (${args.topLoser.changePct > 0 ? "+" : ""}${args.topLoser.changePct.toFixed(2)}%).`,
    )
  }
  if (args.eventKinds.length > 0) {
    parts.push(`Event types showing up: ${args.eventKinds.join(", ")}.`)
  }

  return sanitizeAiBrief({
    summary:
      parts.length > 0
        ? parts.join(" ")
        : "No major movers or notable events were detected in the current cache window.",
    headline: `Watchlist ${args.window} brief`,
    bullets: [],
    risks: [],
    opportunities: [],
  })
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

    const moversBlock = window === "7d" ? snapshot?.movers7d : snapshot?.movers24h
    const eventKinds = Array.from(new Set((snapshot?.events.events ?? []).map((e) => e.kind))).slice(0, 6)
    const topGainer = moversBlock?.gainers?.[0]
      ? { symbol: moversBlock.gainers[0].symbol, changePct: moversBlock.gainers[0].changePct }
      : undefined
    const topLoser = moversBlock?.losers?.[0]
      ? { symbol: moversBlock.losers[0].symbol, changePct: moversBlock.losers[0].changePct }
      : undefined

    if (!isGeminiAvailable || !gemini) {
      const fallback = buildFallbackBrief({ window, topGainer, topLoser, eventKinds })
      const saved = await convex.mutation(api.overview.upsertMyOverviewBriefForServer, {
        serverToken: getServerToken(),
        clerkId,
        window,
        brief: { ...fallback, model: null },
      })
      return NextResponse.json(saved, { status: 200 })
    }

    const moversPayload = moversBlock
      ? {
          gainers: moversBlock.gainers.slice(0, 5).map((m) => ({
            symbol: m.symbol,
            changePct: m.changePct,
            impactUsd: m.impactUsd,
          })),
          losers: moversBlock.losers.slice(0, 5).map((m) => ({
            symbol: m.symbol,
            changePct: m.changePct,
            impactUsd: m.impactUsd,
          })),
        }
      : { gainers: [], losers: [] }

    const eventsPayload = (snapshot?.events.events ?? []).slice(0, 12).map((e) => ({
      kind: e.kind,
      symbol: e.symbol,
      title: e.title,
      summary: e.summary,
      occurredAtMs: e.occurredAtMs,
    }))

    const prompt = JSON.stringify(
      {
        window,
        movers: moversPayload,
        events: eventsPayload,
      },
      null,
      2,
    )

    const system = `
You write a short daily brief for a crypto watchlist dashboard.

The user wants a quick, conversational paragraph they can digest in seconds.

Rules:
- Do not invent facts or numbers. Use only values provided in the input JSON.
- summary MUST be a single paragraph (2-4 sentences). No bullets, no markdown.
- Mention the biggest gainer/loser when present, and 1-2 notable events when present.
- If there isn't enough signal, say so plainly.

Style:
- Calm, helpful, neutral tone. No hype.
- Avoid financial advice language ("you should buy/sell").
    `.trim()

    const modelName = "gemini-2.5-flash"
    const result = await generateText({
      model: gemini(modelName),
      system,
      prompt,
      output: Output.object({
        schema: AiBriefSchema,
        name: "OverviewDailyBrief",
        description: "A daily brief: one short summary paragraph plus optional lists.",
      }),
      temperature: 0.2,
      maxOutputTokens: 650,
      maxRetries: 2,
      abortSignal: req.signal,
    })

    const brief = sanitizeAiBrief(result.output)

    const saved = await convex.mutation(api.overview.upsertMyOverviewBriefForServer, {
      serverToken: getServerToken(),
      clerkId,
      window,
      brief: { ...brief, model: modelName },
    })

    return NextResponse.json(saved, { status: 200 })
  } catch (error) {
    console.error("overview daily-brief error:", error)
    return NextResponse.json({ error: "Failed to generate brief" }, { status: 500 })
  }
}

