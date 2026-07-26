import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Client-safe env only. Never add server secrets here — this module is
// imported from client components, so everything in it ships to the browser.
// Server code should import "@/env.mjs" instead.
export const env = createEnv({
  shared: {
    NODE_ENV: z.enum(["development", "production", "test"]),
  },
  client: {
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_CONVEX_URL: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_SOLANA_NETWORK: z.string().optional(),
    NEXT_PUBLIC_SOLANA_RPC_URL: z.string().optional(),
    NEXT_PUBLIC_DISABLE_ALPHA_FEATURES: z.string().optional().default('true'),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SOLANA_NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_DISABLE_ALPHA_FEATURES: process.env.NEXT_PUBLIC_DISABLE_ALPHA_FEATURES,
  },
  skipValidation: !!process.env.CI || !!process.env.SKIP_ENV_VALIDATION,
});
