import { type NextRequest, NextResponse } from "next/server";

import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
import { SmartScreenerScreenRequestSchema } from "@/lib/smart-screener/screen-api";
import { runSmartScreenerScreen } from "@/lib/smart-screener/server/screen";

function getDevToken(): string | null {
  return process.env.SMART_SCREENER_DEV_TOKEN ?? null;
}

/**
 * Dev/eval-only replay endpoint (404 in production, dev-token gated).
 *
 * Extra body flags on top of the public contract:
 * - `debug: true`    -> include raw model attempts in the response
 * - `noCache: true`  -> bypass the interpretation cache (evals measure the
 *                       model, not Redis)
 */
async function handlePost(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expected = getDevToken();
  if (!expected) {
    return NextResponse.json(
      { error: "SMART_SCREENER_DEV_TOKEN is not configured" },
      { status: 500 },
    );
  }

  const provided = req.headers.get("x-smart-screener-dev-token");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SmartScreenerScreenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const flags = (body ?? {}) as Record<string, unknown>;
  const debug = flags.debug === true;
  const noCache = flags.noCache === true;

  try {
    const { response, debugAttempts } = await runSmartScreenerScreen({
      request: parsed.data,
      identifier: "internal-dev",
      abortSignal: req.signal,
      surfaceOverride: "internal",
      bypassCache: noCache,
      // Dev-only route (404 in prod, token-gated): eval sweeps run dozens of
      // sequential interprets and must not trip the per-user LLM budget.
      bypassBudget: true,
      collectDebug: debug,
    });

    if (debug) {
      return NextResponse.json(
        { result: response, attempts: debugAttempts ?? [] },
        { status: 200 },
      );
    }
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[internal-smart-screener] unhandled:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export const POST = withAuthRatelimit(handlePost, {
  name: "internal-smart-screener",
});
