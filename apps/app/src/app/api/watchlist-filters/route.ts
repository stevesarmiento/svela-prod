import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { ratelimit } from "@v1/kv/ratelimit"
import { generateText } from "ai"
import { api } from "../../../../convex/_generated/api"
import { convex, getServerToken } from "@/lib/convex-server"
import { gemini, isGeminiAvailable } from "@/lib/gemini"
import { RequestSchema, ResponseSchema } from "@/lib/smart-screener/intent-schemas"

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (!forwarded) return "127.0.0.1"
  // Can be a list like "client, proxy1, proxy2"
  const first = forwarded.split(",")[0]?.trim()
  return first && first.length > 0 ? first : "127.0.0.1"
}

export async function POST(req: NextRequest) {
  const telemetryEnabled = process.env.SMART_SCREENER_TELEMETRY_DISABLED !== "1"
  let telemetryContext: { surface: "watchlist" | "screener"; text: string } | null = null

  try {
    const authResult = await auth()
    const clerkId = authResult.userId

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Never let rate limiting take down intent parsing.
    const ip = getRequestIp(req)
    try {
      const rateLimitResult = await ratelimit.limit(`${ip}-${clerkId}-watchlist-filters`)
      if (!rateLimitResult.success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
      }
    } catch (error) {
      console.warn("watchlist-filters ratelimit error (skipping):", error)
    }

    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { text, surface, watchlistGroups, current } = parsed.data
    telemetryContext = { surface, text }

    // Hard fallback: if Gemini isn’t configured, never block.
    if (!isGeminiAvailable || !gemini) {
      return NextResponse.json(
        { actions: [], fallbackSearchText: text, confidence: 0 } satisfies z.infer<typeof ResponseSchema>,
        { status: 200 },
      )
    }

    const systemPrompt = `
You are an intent parser for a crypto smart screener filters UI.

Your job: interpret the user's text and return a single JSON object with shape:
{
  "actions": [
    { "kind": "watchlistGroupId", "value": string|null },
    { "kind": "changeFilter", "value": "all"|"positive"|"negative" },
    { "kind": "sortBy", "value": "name"|"price"|"change"|"marketCap"|"volume" },
    { "kind": "sortOrder", "value": "asc"|"desc" },
    { "kind": "takerFilter", "value": {
        "range": "1h"|"4h"|"12h"|"24h"|"7d",
        "exchange": string|null,
        "minBuyRatio": number|null,
        "minBuyVolumeUsd": number|null,
        "minTotalVolumeUsd": number|null,
        "minNetBuyUsd": number|null,
        "requireBuyGreaterThanSell": boolean
      }
    }
  ],
  "fallbackSearchText": string|null,
  "confidence": number
}

Rules:
- Output MUST be valid JSON only. No markdown, no prose.
- Only choose watchlistGroupId values from the provided watchlistGroups list (match by semantics).
- If the user seems to mean a watchlist (e.g. "my majors", "blue chips", "ownership"), set watchlistGroupId.
- If the user expresses sort intent (e.g. "market cap descending", "highest volume", "sort price asc"), set sortBy/sortOrder.
- If the user expresses 24h change intent (e.g. "only green", "negative", "down"), set changeFilter.
- If the user expresses taker intent (e.g. "high taker buy ratio", "taker buy > sell", "net buy > $10m", "buy ratio above 55%"), set takerFilter.
  - minBuyRatio MUST be 0..1 (if the user says 55%, output 0.55).
  - For USD thresholds like "$10m", output numbers (e.g. 10000000). Use the field that matches intent:
    - "net buy" => minNetBuyUsd
    - "buy volume" => minBuyVolumeUsd
    - "total volume" => minTotalVolumeUsd
  - "buy > sell" => requireBuyGreaterThanSell = true
  - exchange can be null (overall) or a string like "Binance" (prefer "Binance" when the user says it).
  - range should be inferred from timeframe hints (default to "24h").
- If you are not confident you can map to actions, return actions:[] and set fallbackSearchText to the original text and confidence <= 0.4.
- If you do return actions, set fallbackSearchText to null.

Current state (may help disambiguate):
${current ? JSON.stringify(current) : "null"}

Available watchlists:
${JSON.stringify(watchlistGroups)}
    `.trim()

    const result = await generateText({
      model: gemini("gemini-2.5-flash"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      maxOutputTokens: 250,
      abortSignal: req.signal,
    })

    const raw = result.text.trim()
    const json = safeJsonParse(raw)
    const validated = ResponseSchema.safeParse(json)

    if (!validated.success) {
      if (telemetryEnabled) {
        void convex
          .mutation(api.smartScreenerTelemetry.recordPromptFailure, {
            serverToken: getServerToken(),
            createdAtMs: Date.now(),
            surface,
            prompt: text,
            confidence: 0,
            actionKinds: [],
            fallbackSearchText: text,
            errorType: "invalid_output",
          })
          .catch(() => null)
      }
      return NextResponse.json(
        { actions: [], fallbackSearchText: text, confidence: 0 },
        { status: 200 },
      )
    }

    if (telemetryEnabled) {
      const actionKinds = validated.data.actions.map((a) => a.kind)
      const shouldRecord = validated.data.actions.length === 0 || validated.data.confidence < 0.6
      if (shouldRecord) {
        void convex
          .mutation(api.smartScreenerTelemetry.recordPromptFailure, {
            serverToken: getServerToken(),
            createdAtMs: Date.now(),
            surface,
            prompt: text,
            confidence: validated.data.confidence,
            actionKinds,
            fallbackSearchText: validated.data.fallbackSearchText ?? undefined,
            errorType: "low_confidence",
          })
          .catch(() => null)
      }
    }

    return NextResponse.json(validated.data, { status: 200 })
  } catch (error) {
    console.error("watchlist-filters intent error:", error)
    if (telemetryEnabled && telemetryContext) {
      void convex
        .mutation(api.smartScreenerTelemetry.recordPromptFailure, {
          serverToken: getServerToken(),
          createdAtMs: Date.now(),
          surface: telemetryContext.surface,
          prompt: telemetryContext.text,
          confidence: 0,
          actionKinds: [],
          fallbackSearchText: telemetryContext.text,
          errorType: "exception",
        })
        .catch(() => null)
    }
    return NextResponse.json(
      { actions: [], fallbackSearchText: null, confidence: 0 },
      { status: 500 },
    )
  }
}

