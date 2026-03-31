import "server-only";

import { Redis } from "@upstash/redis";

// Only create Redis client if environment variables are available
export const client = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

// Add a check function to verify if Redis is properly configured
export const isRedisConfigured = () => {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
};
