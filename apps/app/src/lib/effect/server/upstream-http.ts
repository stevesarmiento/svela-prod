import { Context, Effect, Layer, Schedule } from "effect";
import {
  UpstreamAuthError,
  UpstreamDecodeError,
  type UpstreamErrors,
  UpstreamHttpError,
  UpstreamRateLimitedError,
  UpstreamTimeoutError,
} from "./errors";

export interface RequestJsonArgs<A> {
  vendor: string;
  endpoint: string;
  decode: (data: unknown) => A;
  init?: RequestInit & { next?: { revalidate?: number } };
  /** Whole-request budget. Also wired into fetch via AbortSignal so sockets actually close. */
  timeoutMs?: number;
  /** Transient-only retry (429 / network / 5xx). Default 2 retries; pass false to disable. */
  retry?: { times: number } | false;
}

export interface RequestTextArgs {
  vendor: string;
  endpoint: string;
  init?: RequestInit;
  timeoutMs?: number;
  /** Reject bodies larger than this many bytes (content-length or read cap). */
  maxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_TEXT_BYTES = 2_000_000;

function getErrorMessage(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (typeof record.message === "string") return record.message;
  if (typeof record.details === "string") return record.details;
  return null;
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function makeHttpError(args: {
  vendor: string;
  endpoint: string;
  status: number;
  message: string;
}): UpstreamErrors {
  if (args.status === 429) return new UpstreamRateLimitedError(args);
  if (args.status === 401 || args.status === 403) {
    return new UpstreamAuthError(args);
  }
  return new UpstreamHttpError(args);
}

function isTransient(error: UpstreamErrors): boolean {
  if (error._tag === "UpstreamRateLimitedError") return true;
  return (
    error._tag === "UpstreamHttpError" &&
    (error.status === 0 || error.status >= 500)
  );
}

function withAbortTimeout(
  init: RequestInit | undefined,
  timeoutMs: number,
): RequestInit {
  // Fiber interruption doesn't abort the socket; a dangling fetch pins the
  // lambda instance, so the fetch itself must carry the deadline too.
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  return signal ? { ...init, signal } : { ...init };
}

interface UpstreamHttpShape {
  readonly requestJson: <A>(
    args: RequestJsonArgs<A>,
  ) => Effect.Effect<A, UpstreamErrors>;
  readonly requestText: (
    args: RequestTextArgs,
  ) => Effect.Effect<{ text: string; finalUrl: string }, UpstreamErrors>;
}

export function makeUpstreamHttp(
  fetchImpl: typeof fetch = globalThis.fetch,
): UpstreamHttpShape {
  const rawRequest = (args: {
    vendor: string;
    endpoint: string;
    init?: RequestInit;
    timeoutMs: number;
  }) =>
    Effect.tryPromise({
      try: () =>
        fetchImpl(args.endpoint, withAbortTimeout(args.init, args.timeoutMs)),
      catch: (error) =>
        new UpstreamHttpError({
          vendor: args.vendor,
          endpoint: args.endpoint,
          status: 0,
          message: error instanceof Error ? error.message : String(error),
        }),
    });

  const requestJson = <A>(args: RequestJsonArgs<A>) => {
    const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retry = args.retry ?? { times: 2 };

    const attempt = rawRequest({
      vendor: args.vendor,
      endpoint: args.endpoint,
      init: args.init,
      timeoutMs,
    }).pipe(
      Effect.flatMap((response) =>
        Effect.tryPromise({
          try: async () => ({
            response,
            body: await parseJsonOrText(response),
          }),
          catch: (error) =>
            new UpstreamHttpError({
              vendor: args.vendor,
              endpoint: args.endpoint,
              status: response.status,
              message: error instanceof Error ? error.message : String(error),
            }),
        }),
      ),
      Effect.flatMap(({ response, body }) => {
        if (!response.ok) {
          const message =
            getErrorMessage(body) ?? `Request failed: ${response.status}`;
          return Effect.fail(
            makeHttpError({
              vendor: args.vendor,
              endpoint: args.endpoint,
              status: response.status,
              message,
            }),
          );
        }
        return Effect.try({
          try: () => args.decode(body),
          catch: (error) =>
            new UpstreamDecodeError({
              vendor: args.vendor,
              endpoint: args.endpoint,
              message: error instanceof Error ? error.message : String(error),
            }),
        });
      }),
    );

    const withRetry =
      retry === false
        ? attempt
        : attempt.pipe(
            Effect.retry({
              schedule: Schedule.exponential("500 millis", 2),
              times: retry.times,
              while: isTransient,
            }),
          );

    return withRetry.pipe(
      Effect.timeout(`${timeoutMs} millis`),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(
          new UpstreamTimeoutError({
            vendor: args.vendor,
            endpoint: args.endpoint,
          }),
        ),
      ),
    );
  };

  const requestText = (args: RequestTextArgs) => {
    const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = args.maxBytes ?? DEFAULT_MAX_TEXT_BYTES;

    return rawRequest({
      vendor: args.vendor,
      endpoint: args.endpoint,
      init: args.init,
      timeoutMs,
    }).pipe(
      Effect.flatMap((response) => {
        if (!response.ok) {
          return Effect.fail(
            makeHttpError({
              vendor: args.vendor,
              endpoint: args.endpoint,
              status: response.status,
              message: `Request failed: ${response.status}`,
            }),
          );
        }
        const contentLength = Number(
          response.headers.get("content-length") ?? "0",
        );
        if (contentLength > maxBytes) {
          return Effect.fail(
            new UpstreamHttpError({
              vendor: args.vendor,
              endpoint: args.endpoint,
              status: response.status,
              message: `Response too large: ${contentLength} bytes`,
            }),
          );
        }
        return Effect.tryPromise({
          try: async () => ({
            text: (await response.text()).slice(0, maxBytes),
            finalUrl: response.url,
          }),
          catch: (error) =>
            new UpstreamHttpError({
              vendor: args.vendor,
              endpoint: args.endpoint,
              status: response.status,
              message: error instanceof Error ? error.message : String(error),
            }),
        });
      }),
      Effect.timeout(`${timeoutMs} millis`),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(
          new UpstreamTimeoutError({
            vendor: args.vendor,
            endpoint: args.endpoint,
          }),
        ),
      ),
    );
  };

  return { requestJson, requestText };
}

// biome-ignore lint/complexity/noStaticOnlyClass: Effect v4 service class — the class is the Context tag; `layer` must be static
export class UpstreamHttp extends Context.Service<UpstreamHttp>()(
  "server/UpstreamHttp",
  { make: Effect.sync(() => makeUpstreamHttp()) },
) {
  static readonly layer = Layer.effect(this, this.make);
  /** Test seam: build a layer over a stubbed fetch. */
  static layerWith(fetchImpl: typeof fetch) {
    return Layer.succeed(UpstreamHttp, makeUpstreamHttp(fetchImpl));
  }
}
