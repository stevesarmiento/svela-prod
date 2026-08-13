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
 * - `public-burst` limiter: matches the old raw @v1/kv fixed-window budget
 *   (10/10s) for the handful of routes that used it directly.
 *
 * Rate limiting fails open (matches the existing watchlist-filters
 * pattern) so a Redis hiccup never takes the dashboard down.
 */
const limiters = {
  llm: createRatelimit(20, "60s"),
  "market-data": createRatelimit(240, "60s"),
  "public-burst": createRatelimit(10, "10s"),
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

export function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "127.0.0.1";
}

export interface ResolvedProtection {
  userId: string | null;
}

/**
 * Auth-once + rate limit. Returns a Response when the request must be
 * rejected, otherwise the resolved session. Shared by `withAuthRatelimit`
 * and the Effect route adapter so auth() runs exactly once per request.
 */
export async function resolveProtection(
  req: NextRequest,
  opts: ProtectOptions,
): Promise<ResolvedProtection | Response> {
  const limiter = limiters[opts.limiter ?? "market-data"];

  const authResult = await auth().catch(() => null);
  const userId = authResult?.userId ?? null;

  if (opts.requireAuth && !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const identifier = `${opts.name}:${userId ?? getRequestIp(req)}`;
    const { success } = await limiter.limit(identifier);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } catch (error) {
    // Fail open: rate limiting is best-effort protection.
    console.warn(`[${opts.name}] ratelimit error (skipping):`, error);
  }

  return { userId };
}

// Generic over the route context so dynamic routes' typed
// `{ params: Promise<{ id: string }> }` flows through unchanged.
export function withAuthRatelimit<Ctx = unknown>(
  handler: (req: NextRequest, ctx: Ctx) => Promise<Response> | Response,
  opts: ProtectOptions,
): (req: NextRequest, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    const resolved = await resolveProtection(req, opts);
    if (resolved instanceof Response) return resolved;
    return handler(req, ctx);
  };
}
