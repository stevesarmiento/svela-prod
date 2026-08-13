import { Cause, type Effect, Exit } from "effect";
import { NextResponse } from "next/server";
import type { RouteErrors } from "./errors";
import type { ServerServices } from "./layer";
import { runServerExit } from "./runtime";

/**
 * Maps failure tags to HTTP responses. Success paths never pass through
 * here — routes build their own Response, which is what keeps existing
 * success body shapes byte-compatible.
 *
 * Details (upstream bodies, schema issues) go to console.error only;
 * clients get a generic message in a `{ success: false, error }` envelope.
 */
export function routeErrorResponse(
  error: RouteErrors,
  routeName: string,
): Response {
  switch (error._tag) {
    case "RequestValidationError":
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    case "MissingApiKeyError":
      return NextResponse.json(
        { success: false, error: `${error.vendor} API key not available` },
        { status: 503 },
      );
    case "UpstreamRateLimitedError":
      console.error(`[${routeName}] upstream rate limited:`, error.message);
      return NextResponse.json(
        { success: false, error: "Upstream rate limit exceeded" },
        { status: 429, headers: { "Retry-After": "30" } },
      );
    case "UpstreamAuthError":
    case "UpstreamHttpError":
    case "UpstreamDecodeError":
      console.error(
        `[${routeName}] upstream failure (${error._tag}) at ${error.endpoint}:`,
        error.message,
      );
      return NextResponse.json(
        { success: false, error: "Upstream request failed" },
        { status: 502 },
      );
    case "ConvexQueryError":
      console.error(
        `[${routeName}] convex failure (${error.label}):`,
        error.message,
      );
      return NextResponse.json(
        { success: false, error: "Data request failed" },
        { status: 502 },
      );
    case "UpstreamTimeoutError":
      console.error(`[${routeName}] upstream timeout at ${error.endpoint}`);
      return NextResponse.json(
        { success: false, error: "Upstream request timed out" },
        { status: 504 },
      );
    case "ConvexTimeoutError":
      console.error(`[${routeName}] convex timeout (${error.label})`);
      return NextResponse.json(
        { success: false, error: "Data request timed out" },
        { status: 504 },
      );
  }
}

/** Runs a route effect against the server layer and translates failures. */
export async function runRouteEffect(
  effect: Effect.Effect<Response, RouteErrors, ServerServices>,
  routeName: string,
): Promise<Response> {
  const exit = await runServerExit(effect);
  return Exit.match(exit, {
    onSuccess: (response) => response,
    onFailure: (cause) => {
      const failure = cause.reasons.find(Cause.isFailReason);
      if (failure) {
        return routeErrorResponse(failure.error, routeName);
      }
      console.error(`[${routeName}] unexpected defect:`, Cause.pretty(cause));
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    },
  });
}
