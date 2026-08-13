import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import {
  ConvexTimeoutError,
  MissingApiKeyError,
  RequestValidationError,
  UpstreamHttpError,
  UpstreamRateLimitedError,
} from "../errors";

// route-runner's import chain reaches env.mjs (via the Convex singleton);
// bun test doesn't run under Next so validation must be skipped, and the
// import must happen after the flag is set.
process.env.SKIP_ENV_VALIDATION = "1";
process.env.NEXT_PUBLIC_CONVEX_URL ??= "https://test.convex.cloud";
const { runRouteEffect } = await import("../route-runner");

// The Clerk-facing `effectRoute` wrapper is a 3-line composition of
// `resolveProtection` (existing, exercised by 23 routes) + `runRouteEffect`;
// Clerk's `server-only` guard can't load under bun test, so tests target
// the runner, which owns all mapping behavior.
const handlerFor =
  (effect: Parameters<typeof runRouteEffect>[0]) => () =>
    runRouteEffect(effect, "test-route");

describe("effectRoute failure mapping", () => {
  it("passes success Response through untouched", async () => {
    const handler = handlerFor(
        Effect.succeed(
          new Response(JSON.stringify({ custom: "shape" }), {
            headers: { "Cache-Control": "public, s-maxage=60" },
          }),
        ),
    );
    const res = await handler();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60");
    expect(await res.json()).toEqual({ custom: "shape" });
  });

  it("RequestValidationError → 400 with message", async () => {
    const handler = handlerFor(
 Effect.fail(new RequestValidationError({ message: "bad id" })),
    );
    const res = await handler();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "bad id" });
  });

  it("MissingApiKeyError → 503", async () => {
    const handler = handlerFor(
 Effect.fail(new MissingApiKeyError({ vendor: "coinglass" })),
    );
    const res = await handler();
    expect(res.status).toBe(503);
  });

  it("UpstreamRateLimitedError → 429 with Retry-After", async () => {
    const handler = handlerFor(
        Effect.fail(
          new UpstreamRateLimitedError({
            vendor: "coingecko",
            endpoint: "/x",
            message: "slow down",
          }),
        ),
    );
    const res = await handler();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("UpstreamHttpError → 502 without leaking upstream detail", async () => {
    const handler = handlerFor(
        Effect.fail(
          new UpstreamHttpError({
            vendor: "coingecko",
            endpoint: "/x",
            status: 500,
            message: "secret upstream body content",
          }),
        ),
    );
    const res = await handler();
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain("secret");
  });

  it("ConvexTimeoutError → 504", async () => {
    const handler = handlerFor(
 Effect.fail(new ConvexTimeoutError({ label: "q" })),
    );
    const res = await handler();
    expect(res.status).toBe(504);
  });

  it("defects → 500 generic", async () => {
    const handler = handlerFor(
        Effect.sync(() => {
          throw new Error("bug with secrets");
        }),
    );
    const res = await handler();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal server error");
  });
});
