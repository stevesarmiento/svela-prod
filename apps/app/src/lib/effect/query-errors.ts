/**
 * Typed retry predicate for the global TanStack Query `retry` option.
 *
 * Effect services reject with their tagged error instances (see
 * runtime-*.ts), so retryability can be decided on the error taxonomy
 * instead of regexing status codes out of message strings.
 */

const NEVER_RETRY_TAG_SUFFIXES = [
  "DecodeError",
  "InvalidParamsError",
  "UnauthorizedError",
  "NotFoundError",
] as const;

function getTag(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const tag = (error as { _tag?: unknown })._tag;
  return typeof tag === "string" ? tag : null;
}

export function isRetryableQueryError(error: unknown): boolean {
  const tag = getTag(error);

  if (tag !== null) {
    // Deterministic failures — the answer won't change on retry.
    if (NEVER_RETRY_TAG_SUFFIXES.some((suffix) => tag.endsWith(suffix))) {
      return false;
    }
    // The CoinGecko service already retried 429s internally; piling query
    // retries on top just extends the rate-limit window.
    if (tag === "CoinGeckoRateLimitedError") return false;

    // Transport errors carry no status; they are the network-failure
    // (status 0) case of the shared taxonomy.
    if (tag.endsWith("TransportError")) return true;

    const status = (error as { status?: unknown }).status;
    return (
      typeof status === "number" &&
      (status === 0 || status === 408 || status >= 500)
    );
  }

  // Untyped errors (legacy fetches, non-Effect rejections): keep the old
  // message-regex heuristic — any embedded 4xx means don't retry.
  const message = error instanceof Error ? error.message : "";
  return !/\b4\d\d\b/.test(message);
}
