import type { Effect } from "effect";
import type { NextRequest } from "next/server";
import {
  type ProtectOptions,
  type ResolvedProtection,
  resolveProtection,
} from "@/lib/api/with-auth-ratelimit";
import type { RouteErrors } from "./errors";
import type { ServerServices } from "./layer";
import { runRouteEffect } from "./route-runner";

export { getRequestIp } from "@/lib/api/with-auth-ratelimit";
export { routeErrorResponse, runRouteEffect } from "./route-runner";

/**
 * Effect-based route adapter: auth-once + rate limit via the shared
 * `resolveProtection`, then run the route effect against the server layer
 * and translate failures to consistent HTTP responses.
 */
export function effectRoute<Ctx = unknown>(
  build: (
    req: NextRequest,
    ctx: Ctx,
    session: ResolvedProtection,
  ) => Effect.Effect<Response, RouteErrors, ServerServices>,
  opts: ProtectOptions,
): (req: NextRequest, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    const resolved = await resolveProtection(req, opts);
    if (resolved instanceof Response) return resolved;
    return runRouteEffect(build(req, ctx, resolved), opts.name);
  };
}
