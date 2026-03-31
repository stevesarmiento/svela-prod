import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { ratelimit } from "@v1/kv/ratelimit"
import { generateText } from "ai"
import { gemini, isGeminiAvailable } from "@/lib/gemini"

const WatchlistGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

const RequestSchema = z.object({
  text: z.string().min(1),
  watchlistGroups: z.array(WatchlistGroupSchema).max(200),
  current: z
    .object({
      watchlistGroupId: z.string().nullable(),
      changeFilter: z.enum(["all", "positive", "negative"]),
      sortBy: z.enum(["name", "price", "change", "marketCap", "volume"]),
      sortOrder: z.enum(["asc", "desc"]),
    })
    .optional(),
})

const ActionSchema = z.union([
  z.object({ kind: z.literal("watchlistGroupId"), value: z.string().nullable() }),
  z.object({ kind: z.literal("changeFilter"), value: z.enum(["all", "positive", "negative"]) }),
  z.object({
    kind: z.literal("sortBy"),
    value: z.enum(["name", "price", "change", "marketCap", "volume"]),
  }),
  z.object({ kind: z.literal("sortOrder"), value: z.enum(["asc", "desc"]) }),
])

const ResponseSchema = z.object({
  actions: z.array(ActionSchema),
  fallbackSearchText: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

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

    const { text, watchlistGroups, current } = parsed.data

    // Hard fallback: if Gemini isn’t configured, never block.
    if (!isGeminiAvailable || !gemini) {
      return NextResponse.json(
        { actions: [], fallbackSearchText: text, confidence: 0 } satisfies z.infer<typeof ResponseSchema>,
        { status: 200 },
      )
    }

    const systemPrompt = `
You are an intent parser for a crypto watchlist filters UI.

Your job: interpret the user's text and return a single JSON object with shape:
{
  "actions": [
    { "kind": "watchlistGroupId", "value": string|null },
    { "kind": "changeFilter", "value": "all"|"positive"|"negative" },
    { "kind": "sortBy", "value": "name"|"price"|"change"|"marketCap"|"volume" },
    { "kind": "sortOrder", "value": "asc"|"desc" }
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
      return NextResponse.json(
        { actions: [], fallbackSearchText: text, confidence: 0 },
        { status: 200 },
      )
    }

    return NextResponse.json(validated.data, { status: 200 })
  } catch (error) {
    console.error("watchlist-filters intent error:", error)
    return NextResponse.json(
      { actions: [], fallbackSearchText: null, confidence: 0 },
      { status: 500 },
    )
  }
}

