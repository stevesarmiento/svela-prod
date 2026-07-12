/**
 * CoinGecko fetch helper with bounded retry/backoff.
 *
 * Retries only transient failures (429 / 5xx / network errors), honoring
 * Retry-After when CoinGecko provides it. Client errors (4xx other than 429)
 * fail immediately — retrying them just burns quota.
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_AFTER_CAP_MS = 8_000;
/** Backoff for attempt 1 → 2 and 2 → 3 when no Retry-After is provided. */
const BACKOFF_MS = [500, 1_500];

export function getCoinGeckoApiKey(): string {
  const key = process.env.X_CG_PRO_API_KEY;
  if (!key) throw new Error("Missing X_CG_PRO_API_KEY in Convex environment");
  return key;
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

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchCoinGeckoJson(
  endpoint: string,
  apiKey: string,
  options?: { maxAttempts?: number },
): Promise<unknown> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: {
          "x-cg-pro-api-key": apiKey,
          Accept: "application/json",
        },
      });
    } catch (error) {
      // Network error — retryable.
      lastError =
        error instanceof Error ? error : new Error("CoinGecko fetch failed");
      if (attempt < maxAttempts) {
        await sleep(BACKOFF_MS[attempt - 1] ?? 1_500);
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      return await response.json();
    }

    const body = await response.text().catch(() => "");
    lastError = new Error(
      `CoinGecko request failed (${response.status}): ${body.slice(0, 200)}`,
    );

    if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
      throw lastError;
    }

    const retryAfterMs = parseRetryAfterMs(response);
    await sleep(retryAfterMs ?? BACKOFF_MS[attempt - 1] ?? 1_500);
  }

  throw lastError ?? new Error("CoinGecko request failed after retries");
}
