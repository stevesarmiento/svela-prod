import { createHash } from "node:crypto";

import { client, isRedisConfigured } from "@v1/kv/client";

import { SMART_SCREENER_METRIC_IDS } from "../metric-registry";
import { SMART_SCREENER_PROMPT_VERSION } from "./prompt";

/**
 * Interpretation cache: temp-0.1 interpretations are near-deterministic, so
 * a (normalized prompt -> DSL) cache is safe and kills repeat LLM spend.
 *
 * Key: ss:interp:v{PROMPT_VERSION}:{hash(metricIds)}:{sha256(normalized text)}
 * - PROMPT_VERSION bump invalidates on prompt changes.
 * - The metric-id hash invalidates when metrics are added/removed WITHOUT a
 *   version bump (belt and braces).
 *
 * Fail-open everywhere: a Redis hiccup must never break screening.
 */

export interface CachedInterpretation {
  /** Unparsed DSL JSON — re-validated through ScreeningDslSchema on read. */
  dsl: unknown;
  confidence: number;
  model: string;
}

const CATALOG_HASH = createHash("sha256")
  .update(SMART_SCREENER_METRIC_IDS.join(","))
  .digest("hex")
  .slice(0, 8);

const TTL_CONFIDENT_SECONDS = 24 * 60 * 60;
const TTL_UNCONFIDENT_SECONDS = 10 * 60;
const CONFIDENT_THRESHOLD = 0.6;

function cacheKey(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  const textHash = createHash("sha256").update(normalized).digest("hex");
  return `ss:interp:v${SMART_SCREENER_PROMPT_VERSION}:${CATALOG_HASH}:${textHash}`;
}

export async function getCachedInterpretation(
  text: string,
): Promise<CachedInterpretation | null> {
  if (!isRedisConfigured()) return null;
  try {
    const value = await client.get<CachedInterpretation>(cacheKey(text));
    if (!value || typeof value !== "object") return null;
    if (typeof value.confidence !== "number" || typeof value.model !== "string")
      return null;
    return value;
  } catch {
    return null;
  }
}

export function setCachedInterpretation(
  text: string,
  value: CachedInterpretation,
): void {
  if (!isRedisConfigured()) return;
  const ttl =
    value.confidence >= CONFIDENT_THRESHOLD
      ? TTL_CONFIDENT_SECONDS
      : TTL_UNCONFIDENT_SECONDS;
  void client.set(cacheKey(text), value, { ex: ttl }).catch(() => null);
}
