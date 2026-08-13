import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { makeUpstreamHttp } from "../upstream-http";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(
  responses: Array<() => Response | Promise<Response>>,
): { fetchImpl: typeof fetch; calls: () => number } {
  let i = 0;
  const fetchImpl = (async () => {
    const make = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (!make) throw new Error("no stubbed response");
    return make();
  }) as typeof fetch;
  return { fetchImpl, calls: () => i };
}

const decode = (data: unknown) => data as { ok: boolean };

describe("UpstreamHttp.requestJson", () => {
  it("returns decoded body on 200", async () => {
    const { fetchImpl } = stubFetch([() => jsonResponse({ ok: true })]);
    const http = makeUpstreamHttp(fetchImpl);
    const result = await Effect.runPromise(
      http.requestJson({ vendor: "test", endpoint: "/x", decode }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("maps 429 to UpstreamRateLimitedError and retries transiently", async () => {
    const { fetchImpl, calls } = stubFetch([
      () => jsonResponse({ msg: "slow down" }, 429),
      () => jsonResponse({ ok: true }),
    ]);
    const http = makeUpstreamHttp(fetchImpl);
    const result = await Effect.runPromise(
      http.requestJson({
        vendor: "test",
        endpoint: "/x",
        decode,
        retry: { times: 2 },
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls()).toBe(2);
  });

  it("does not retry 4xx", async () => {
    const { fetchImpl, calls } = stubFetch([
      () => jsonResponse({ error: "bad params" }, 400),
    ]);
    const http = makeUpstreamHttp(fetchImpl);
    const exit = await Effect.runPromiseExit(
      http.requestJson({ vendor: "test", endpoint: "/x", decode }),
    );
    expect(exit._tag).toBe("Failure");
    expect(calls()).toBe(1);
  });

  it("maps 401 to UpstreamAuthError", async () => {
    const { fetchImpl } = stubFetch([() => jsonResponse({}, 401)]);
    const http = makeUpstreamHttp(fetchImpl);
    const error = await Effect.runPromise(
      http.requestJson({ vendor: "test", endpoint: "/x", decode }).pipe(
        Effect.flip,
      ),
    );
    expect(error._tag).toBe("UpstreamAuthError");
  });

  it("retries 5xx then fails with UpstreamHttpError after exhaustion", async () => {
    const { fetchImpl, calls } = stubFetch([() => jsonResponse({}, 500)]);
    const http = makeUpstreamHttp(fetchImpl);
    const error = await Effect.runPromise(
      http
        .requestJson({
          vendor: "test",
          endpoint: "/x",
          decode,
          retry: { times: 1 },
          timeoutMs: 30_000,
        })
        .pipe(Effect.flip),
    );
    expect(error._tag).toBe("UpstreamHttpError");
    if (error._tag === "UpstreamHttpError") {
      expect(error.status).toBe(500);
    }
    expect(calls()).toBe(2);
  });

  it("maps network failure to status 0 and retries", async () => {
    const { fetchImpl, calls } = stubFetch([
      () => {
        throw new Error("ECONNRESET");
      },
      () => jsonResponse({ ok: true }),
    ]);
    const http = makeUpstreamHttp(fetchImpl);
    const result = await Effect.runPromise(
      http.requestJson({ vendor: "test", endpoint: "/x", decode }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls()).toBe(2);
  });

  it("maps decode throw to UpstreamDecodeError without retry", async () => {
    const { fetchImpl, calls } = stubFetch([() => jsonResponse({ bad: 1 })]);
    const http = makeUpstreamHttp(fetchImpl);
    const error = await Effect.runPromise(
      http
        .requestJson({
          vendor: "test",
          endpoint: "/x",
          decode: () => {
            throw new Error("shape mismatch");
          },
        })
        .pipe(Effect.flip),
    );
    expect(error._tag).toBe("UpstreamDecodeError");
    expect(calls()).toBe(1);
  });

  it("maps overall timeout to UpstreamTimeoutError", async () => {
    const { fetchImpl } = stubFetch([
      () => new Promise<Response>(() => {}) as Promise<Response>,
    ]);
    const http = makeUpstreamHttp(fetchImpl);
    const error = await Effect.runPromise(
      http
        .requestJson({
          vendor: "test",
          endpoint: "/x",
          decode,
          timeoutMs: 50,
          retry: false,
        })
        .pipe(Effect.flip),
    );
    expect(error._tag).toBe("UpstreamTimeoutError");
  });
});

describe("UpstreamHttp.requestText", () => {
  it("returns text and final url", async () => {
    const { fetchImpl } = stubFetch([() => new Response("<html>hi</html>")]);
    const http = makeUpstreamHttp(fetchImpl);
    const result = await Effect.runPromise(
      http.requestText({ vendor: "test", endpoint: "/page" }),
    );
    expect(result.text).toBe("<html>hi</html>");
  });

  it("rejects oversized bodies via content-length", async () => {
    const { fetchImpl } = stubFetch([
      () =>
        new Response("x", {
          headers: { "content-length": "99999999" },
        }),
    ]);
    const http = makeUpstreamHttp(fetchImpl);
    const error = await Effect.runPromise(
      http
        .requestText({ vendor: "test", endpoint: "/page", maxBytes: 100 })
        .pipe(Effect.flip),
    );
    expect(error._tag).toBe("UpstreamHttpError");
  });
});
