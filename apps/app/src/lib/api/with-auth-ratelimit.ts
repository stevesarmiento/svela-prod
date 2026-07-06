import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createRatelimit } from "@v1/kv/ratelimit";

/**
 * Shared protection for API route handlers.
 *
 * - `llm` limiter: strict budget for routes that spend money per call
 *   (Gemini/OpenAI). Combine with `requireAuth: true`.
 * - `market-data` limiter: generous budget sized for dashboard bursts
 *   (e.g. a cold screener firing ~24 inline-chart requests at once).
 *
 * Rate limiting fails open (matches the existing watchlist-filters
 * pattern) so a Redis hiccup never takes the dashboard down.
 */
const limiters = {
  llm: createRatelimit(20, "60s"),
  "market-data": createRatelimit(240, "60s"),
} as const;

type LimiterKind = keyof typeof limiters;

export interface ProtectOptions {
  /** Unique per route; namespaces the rate-limit key. */
  name: string;
  /** Reject with 401 when there is no Clerk session. */
  requireAuth?: boolean;
  /** Which budget to apply. Defaults to "market-data". */
  limiter?: LimiterKind;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "127.0.0.1";
}

// Generic over the route context so dynamic routes' typed
// `{ params: Promise<{ id: string }> }` flows through unchanged.
export function withAuthRatelimit<Ctx = unknown>(
  handler: (req: NextRequest, ctx: Ctx) => Promise<Response> | Response,
  opts: ProtectOptions,
): (req: NextRequest, ctx: Ctx) => Promise<Response> {
  const limiter = limiters[opts.limiter ?? "market-data"];

  return async (req, ctx) => {
    const authResult = await auth().catch(() => null);
    const userId = authResult?.userId ?? null;

    if (opts.requireAuth && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const identifier = `${opts.name}:${userId ?? clientIp(req)}`;
      const { success } = await limiter.limit(identifier);
      if (!success) {
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429 },
        );
      }
    } catch (error) {
      // Fail open: rate limiting is best-effort protection.
      console.warn(`[${opts.name}] ratelimit error (skipping):`, error);
    }

    return handler(req, ctx);
  };
}
