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
