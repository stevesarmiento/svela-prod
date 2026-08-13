/**
 * Shared upstream-fetch helper with bounded retry/backoff.
 *
 * Retries only transient failures (429 / 5xx by default, plus network errors
 * and timeouts), honoring Retry-After when the upstream provides it. Client
 * errors (4xx other than 429) fail immediately — retrying them just burns
 * quota. All failures surface as UpstreamHttpError so call sites can branch
 * on status/kind instead of parsing error strings.
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_AFTER_CAP_MS = 8_000;
const DEFAULT_TIMEOUT_MS = 10_000;
/** Backoff for attempt 1 → 2 and 2 → 3 when no Retry-After is provided. */
const DEFAULT_BACKOFF_MS: readonly number[] = [500, 1_500];
const BODY_SNIPPET_LENGTH = 200;

export class UpstreamHttpError extends Error {
  readonly source: string;
  readonly status: number | null;
  readonly kind: "http" | "network" | "timeout";
  readonly bodySnippet: string;
  readonly attempts: number;

  constructor(args: {
    source: string;
    status: number | null;
    kind: "http" | "network" | "timeout";
    bodySnippet: string;
    attempts: number;
  }) {
    super(
      `[${args.source}] upstream request failed (${
        args.status ?? args.kind
      }) after ${args.attempts} attempt(s): ${args.bodySnippet}`,
    );
    this.name = "UpstreamHttpError";
    this.source = args.source;
    this.status = args.status;
    this.kind = args.kind;
    this.bodySnippet = args.bodySnippet;
    this.attempts = args.attempts;
  }
}

/**
 * Thrown when an upstream response was HTTP-ok but its JSON shape failed
 * schema validation. Kept separate from UpstreamHttpError so shape drift is
 * greppable independently of transport failures.
 */
export class UpstreamValidationError extends Error {
  readonly source: string;
  readonly summary: string;

  constructor(args: { source: string; summary: string }) {
    super(`[${args.source}] upstream response failed validation: ${args.summary}`);
    this.name = "UpstreamValidationError";
    this.source = args.source;
    this.summary = args.summary;
  }
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  }

  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), RETRY_AFTER_CAP_MS);
  }

  return null;
}

function defaultShouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export interface FetchUpstreamJsonOptions {
  /** Short upstream identifier used in error messages, e.g. "coingecko". */
  source: string;
  init?: RequestInit;
  maxAttempts?: number;
  timeoutMs?: number;
  shouldRetry?: (status: number) => boolean;
  backoffMs?: readonly number[];
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function fetchUpstreamJson(
  url: string,
  opts: FetchUpstreamJsonOptions,
): Promise<unknown> {
  const {
    source,
    init,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    shouldRetry = defaultShouldRetry,
    backoffMs = DEFAULT_BACKOFF_MS,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
  } = opts;

  const fallbackBackoffMs = backoffMs[backoffMs.length - 1] ?? 1_500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      // Guarded: not every isolate runtime exposes AbortSignal.timeout.
      const signal =
        typeof AbortSignal === "function" &&
        typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(timeoutMs)
          : null;

      // react-doctor-disable-next-line react-doctor/no-fetch-response-used-without-status-check -- response.ok is checked before the success-path read; the non-ok .text() is deliberate error-payload capture
      response = await fetchImpl(url, {
        ...init,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      // Timeouts and network errors are both transient — retryable.
      const kind = isTimeoutError(error) ? "timeout" : "network";
      if (attempt < maxAttempts) {
        await sleepImpl(backoffMs[attempt - 1] ?? fallbackBackoffMs);
        continue;
      }
      throw new UpstreamHttpError({
        source,
        status: null,
        kind,
        bodySnippet: String(
          error instanceof Error ? error.message : error,
        ).slice(0, BODY_SNIPPET_LENGTH),
        attempts: attempt,
      });
    }

    if (response.ok) {
      return await response.json();
    }

    const body = await response.text().catch(() => "");
    const httpError = new UpstreamHttpError({
      source,
      status: response.status,
      kind: "http",
      bodySnippet: body.slice(0, BODY_SNIPPET_LENGTH),
      attempts: attempt,
    });

    if (!shouldRetry(response.status) || attempt >= maxAttempts) {
      throw httpError;
    }

    const retryAfterMs = parseRetryAfterMs(response);
    await sleepImpl(
      retryAfterMs ?? backoffMs[attempt - 1] ?? fallbackBackoffMs,
    );
  }

  // Unreachable: every loop path either returns or throws.
  throw new UpstreamHttpError({
    source,
    status: null,
    kind: "network",
    bodySnippet: "request failed after retries",
    attempts: maxAttempts,
  });
}
