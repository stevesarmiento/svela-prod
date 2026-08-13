import { describe, expect, it } from "bun:test";
import {
  fetchUpstreamJson,
  UpstreamHttpError,
} from "../convex/_lib/upstreamFetch";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function stubFetch(
  responses: Array<Response | Error>,
): { fetchImpl: typeof fetch; calls: () => number } {
  let index = 0;
  const fetchImpl = (async () => {
    const next = responses[index];
    index += 1;
    if (!next) throw new Error("stubFetch: no response queued");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => index };
}

function stubSleep(): { sleepImpl: (ms: number) => Promise<void>; sleeps: number[] } {
  const sleeps: number[] = [];
  const sleepImpl = async (ms: number) => {
    sleeps.push(ms);
  };
  return { sleepImpl, sleeps };
}

function timeoutError(): Error {
  const error = new Error("The operation timed out");
  error.name = "TimeoutError";
  return error;
}

describe("fetchUpstreamJson", () => {
  it("retries on 429 and caps Retry-After at 8000ms", async () => {
    const { fetchImpl, calls } = stubFetch([
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "30" }, // 30s → capped at 8s
      }),
      jsonResponse({ ok: true }),
    ]);
    const { sleepImpl, sleeps } = stubSleep();

    const result = await fetchUpstreamJson("https://example.test/x", {
      source: "test",
      fetchImpl,
      sleepImpl,
    });

    expect(result).toEqual({ ok: true });
    expect(calls()).toBe(2);
    expect(sleeps).toEqual([8000]);
  });

  it("does not retry a 400 and reports status/kind/attempts", async () => {
    const { fetchImpl, calls } = stubFetch([
      new Response("bad request body", { status: 400 }),
      jsonResponse({ ok: true }),
    ]);
    const { sleepImpl, sleeps } = stubSleep();

    let caught: unknown;
    try {
      await fetchUpstreamJson("https://example.test/x", {
        source: "test",
        fetchImpl,
        sleepImpl,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UpstreamHttpError);
    const error = caught as UpstreamHttpError;
    expect(error.name).toBe("UpstreamHttpError");
    expect(error.source).toBe("test");
    expect(error.status).toBe(400);
    expect(error.kind).toBe("http");
    expect(error.bodySnippet).toBe("bad request body");
    expect(error.attempts).toBe(1);
    expect(calls()).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("retries a network error and then succeeds", async () => {
    const { fetchImpl, calls } = stubFetch([
      new TypeError("fetch failed"),
      jsonResponse({ recovered: true }),
    ]);
    const { sleepImpl, sleeps } = stubSleep();

    const result = await fetchUpstreamJson("https://example.test/x", {
      source: "test",
      fetchImpl,
      sleepImpl,
    });

    expect(result).toEqual({ recovered: true });
    expect(calls()).toBe(2);
    expect(sleeps).toEqual([500]);
  });

  it("reports kind \"timeout\" when the request times out", async () => {
    const { fetchImpl } = stubFetch([timeoutError()]);
    const { sleepImpl } = stubSleep();

    let caught: unknown;
    try {
      await fetchUpstreamJson("https://example.test/x", {
        source: "test",
        maxAttempts: 1,
        fetchImpl,
        sleepImpl,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UpstreamHttpError);
    const error = caught as UpstreamHttpError;
    expect(error.kind).toBe("timeout");
    expect(error.status).toBeNull();
    expect(error.attempts).toBe(1);
  });

  it("throws with the attempt count when retries are exhausted", async () => {
    const { fetchImpl, calls } = stubFetch([
      new Response("down", { status: 503 }),
      new Response("down", { status: 503 }),
      new Response("down", { status: 503 }),
    ]);
    const { sleepImpl, sleeps } = stubSleep();

    let caught: unknown;
    try {
      await fetchUpstreamJson("https://example.test/x", {
        source: "test",
        maxAttempts: 3,
        fetchImpl,
        sleepImpl,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UpstreamHttpError);
    const error = caught as UpstreamHttpError;
    expect(error.status).toBe(503);
    expect(error.attempts).toBe(3);
    expect(calls()).toBe(3);
    expect(sleeps).toEqual([500, 1500]);
  });

  it("does not retry a 500 when shouldRetry says no", async () => {
    const { fetchImpl, calls } = stubFetch([
      new Response("server error", { status: 500 }),
      jsonResponse({ ok: true }),
    ]);
    const { sleepImpl, sleeps } = stubSleep();

    let caught: unknown;
    try {
      await fetchUpstreamJson("https://example.test/x", {
        source: "test",
        shouldRetry: () => false,
        fetchImpl,
        sleepImpl,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UpstreamHttpError);
    const error = caught as UpstreamHttpError;
    expect(error.status).toBe(500);
    expect(error.attempts).toBe(1);
    expect(calls()).toBe(1);
    expect(sleeps).toEqual([]);
  });
});
