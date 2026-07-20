import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
import { SmartScreenerScreenRequestSchema } from "@/lib/smart-screener/screen-api";
import { runSmartScreenerScreen } from "@/lib/smart-screener/server/screen";

function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return "127.0.0.1";
  const first = forwarded.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "127.0.0.1";
}

async function handlePost(req: NextRequest) {
  const userId = (await auth().catch(() => null))?.userId ?? null;

  const body = await req.json().catch(() => null);
  const parsed = SmartScreenerScreenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { response } = await runSmartScreenerScreen({
      request: parsed.data,
      identifier: userId ?? getRequestIp(req),
      abortSignal: req.signal,
    });
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    // The orchestrator catches expected failures; this is the last resort.
    console.error("[smart-screener-screen] unhandled:", error);
    return NextResponse.json(
      { error: "Internal error", code: "internal" },
      { status: 500 },
    );
  }
}

export const POST = withAuthRatelimit(handlePost, {
  name: "smart-screener-screen",
  requireAuth: true,
});
