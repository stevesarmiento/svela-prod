import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  shared: {
    VERCEL_URL: z
      .string()
      .optional()
      .transform((v) => (v ? `https://${v}` : undefined)),
    PORT: z.coerce.number().default(3000),
  },
  server: {
    OPENPANEL_SECRET_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    CG_API_KEY: z.string().optional(),
    'CG-API-KEY': z.string().optional(),
    X_CG_PRO_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    X_CAPI_API_KEY: z.string().optional(),
    API_ENCRYPTION_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_OPENPANEL_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_CONVEX_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_SOLANA_NETWORK: z.string().optional(),
    NEXT_PUBLIC_SOLANA_RPC_URL: z.string().optional(),
    NEXT_PUBLIC_HELIUS_API_KEY: z.string().optional(),
    NEXT_PUBLIC_TITAN_API_KEY: z.string().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_OPENPANEL_CLIENT_ID:
      process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SOLANA_NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_HELIUS_API_KEY: process.env.NEXT_PUBLIC_HELIUS_API_KEY,
    OPENPANEL_SECRET_KEY: process.env.OPENPANEL_SECRET_KEY,
    PORT: process.env.PORT,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    CG_API_KEY: process.env.CG_API_KEY,
    X_CG_PRO_API_KEY: process.env.X_CG_PRO_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    X_CAPI_API_KEY: process.env.X_CAPI_API_KEY,
    'CG-API-KEY': process.env['CG-API-KEY'],
    API_ENCRYPTION_KEY: process.env.API_ENCRYPTION_KEY,
    NEXT_PUBLIC_TITAN_API_KEY: process.env.NEXT_PUBLIC_TITAN_API_KEY,
  },
  skipValidation: !!process.env.CI || !!process.env.SKIP_ENV_VALIDATION,
});
