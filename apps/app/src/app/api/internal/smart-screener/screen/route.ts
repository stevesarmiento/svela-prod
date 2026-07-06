import { NextResponse, type NextRequest } from "next/server"
import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";

import { SmartScreenerScreenRequestSchema } from "@/lib/smart-screener/screen-api"
import {
  debugSmartScreenerInterpret,
  runSmartScreenerScreen,
} from "@/app/api/smart-screener/screen/route"

function getDevToken(): string | null {
  return process.env.SMART_SCREENER_DEV_TOKEN ?? null
}

async function handlePost(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const expected = getDevToken()
  if (!expected) {
    return NextResponse.json(
      { error: "SMART_SCREENER_DEV_TOKEN is not configured" },
      { status: 500 },
    )
  }

  const provided = req.headers.get("x-smart-screener-dev-token")
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Validate request shape for clearer errors in terminal.
  const body = await req.json().catch(() => null)
  const parsed = SmartScreenerScreenRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const debug = Boolean(
    body &&
      typeof body === "object" &&
      "debug" in (body as Record<string, unknown>) &&
      (body as Record<string, unknown>).debug === true,
  )

  if (debug) {
    const interpretation = await debugSmartScreenerInterpret({
      text: parsed.data.text,
      abortSignal: req.signal,
    })
    const result = await runSmartScreenerScreen({
      text: parsed.data.text,
      surface: parsed.data.surface,
      current: parsed.data.current,
      abortSignal: req.signal,
    })
    return NextResponse.json({ interpretation, result }, { status: 200 })
  }

  const result = await runSmartScreenerScreen({
    text: parsed.data.text,
    surface: parsed.data.surface,
    current: parsed.data.current,
    abortSignal: req.signal,
  })

  return NextResponse.json(result, { status: 200 })
}


export const POST = withAuthRatelimit(handlePost, {
  name: "internal-smart-screener",
});
