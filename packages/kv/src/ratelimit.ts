import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { client, isRedisConfigured } from ".";

interface RatelimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

interface RatelimitLike {
  limit: (identifier: string) => Promise<RatelimitResult>;
}

// Create a mock ratelimit for when Redis is not configured
const mockRatelimit: RatelimitLike = {
  limit: async () => ({
    success: true,
    remaining: 10,
    reset: Date.now() + 10_000,
  }),
};

export const ratelimit: RatelimitLike = isRedisConfigured()
  ? new Ratelimit({
      limiter: Ratelimit.fixedWindow(10, "10s"),
      redis: client,
    })
  : mockRatelimit;

/**
 * Create a rate limiter with a custom budget, e.g. `createRatelimit(120, "60s")`.
 * Falls back to a no-op limiter when Redis is not configured (local dev).
 */
export function createRatelimit(
  tokens: number,
  window: `${number}s` | `${number}m` | `${number}h`,
): RatelimitLike {
  if (!isRedisConfigured()) return mockRatelimit;
  return new Ratelimit({
    limiter: Ratelimit.slidingWindow(tokens, window),
    redis: client,
  });
}
