import { Duration, Effect, Schedule } from "effect";
import {
  HttpDecodeError,
  type HttpRequestError,
  HttpStatusError,
  HttpTransportError,
} from "./http-errors";

/**
 * Generic JSON request helper for new Effect-based API services.
 *
 * Modeled on the per-service `requestJson` helpers (see coingecko-api.ts) but
 * with the shared {@link HttpRequestError} taxonomy. Existing services keep
 * their own helpers/tags — only new services should use this.
 */

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

function isTransient(error: HttpRequestError): boolean {
  // Transport failures (status 0 equivalent), 429s, and 5xx are worth
  // retrying; 4xx/decode errors won't change on retry.
  if (error._tag === "HttpTransportError") return true;
  if (error._tag === "HttpStatusError") {
    return error.status === 429 || error.status >= 500;
  }
  return false;
}

export function requestJson<A>(args: {
  endpoint: string;
  decode: (data: unknown) => A;
  init?: RequestInit;
  timeoutMs?: number;
  retry?: { times: number } | false;
}): Effect.Effect<A, HttpRequestError> {
  const timeoutMs = args.timeoutMs ?? 8000;
  const retry = args.retry ?? false;

  let effect: Effect.Effect<A, HttpRequestError> = Effect.tryPromise({
    // The fiber's AbortSignal is threaded into fetch so interruption
    // (e.g. TanStack Query cancellation via runPromise({ signal })) aborts
    // the in-flight request.
    try: (signal) => fetch(args.endpoint, { ...args.init, signal }),
    catch: (error) =>
      new HttpTransportError({
        endpoint: args.endpoint,
        message: String(error),
      }),
  }).pipe(
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: async () => ({ response, body: await parseJsonOrText(response) }),
        catch: (error) =>
          new HttpStatusError({
            endpoint: args.endpoint,
            status: response.status,
            message: String(error),
          }),
      }),
    ),
    Effect.flatMap(({ response, body }): Effect.Effect<A, HttpRequestError> => {
      if (!response.ok) {
        const message =
          getErrorMessage(body) ?? `Request failed: ${response.status}`;
        return Effect.fail(
          new HttpStatusError({
            endpoint: args.endpoint,
            status: response.status,
            message,
          }),
        );
      }

      return Effect.try({
        try: () => args.decode(body),
        catch: (error) =>
          new HttpDecodeError({
            endpoint: args.endpoint,
            message: error instanceof Error ? error.message : String(error),
          }),
      });
    }),
  );

  if (retry !== false) {
    effect = effect.pipe(
      Effect.retry({
        schedule: Schedule.exponential("500 millis", 2),
        times: retry.times,
        while: isTransient,
      }),
    );
  }

  return effect.pipe(
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(
        new HttpStatusError({
          endpoint: args.endpoint,
          status: 408,
          message: "Request timed out",
        }),
      ),
    ),
  );
}
