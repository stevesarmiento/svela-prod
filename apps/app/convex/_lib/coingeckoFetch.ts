/**
 * CoinGecko fetch helper — a thin wrapper over the shared upstream helper
 * that applies CoinGecko headers/API key and default retry policy.
 *
 * Retries only transient failures (429 / 5xx / network errors), honoring
 * Retry-After when CoinGecko provides it. Client errors (4xx other than 429)
 * fail immediately — retrying them just burns quota.
 */

import { fetchUpstreamJson } from "./upstreamFetch";

export function getCoinGeckoApiKey(): string {
  const key = process.env.X_CG_PRO_API_KEY;
  if (!key) throw new Error("Missing X_CG_PRO_API_KEY in Convex environment");
  return key;
}

export async function fetchCoinGeckoJson(
  endpoint: string,
  apiKey: string,
  options?: { maxAttempts?: number },
): Promise<unknown> {
  return fetchUpstreamJson(endpoint, {
    source: "coingecko",
    init: {
      headers: {
        "x-cg-pro-api-key": apiKey,
        Accept: "application/json",
      },
    },
    ...(options?.maxAttempts !== undefined
      ? { maxAttempts: options.maxAttempts }
      : {}),
  });
}
