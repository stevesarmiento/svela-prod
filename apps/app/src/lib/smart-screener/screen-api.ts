import { z } from "zod"

import { ScreeningDslSchema } from "./screening-dsl"

export const SmartScreenerScreenRequestSchema = z.object({
  text: z.string().min(1),
  surface: z.enum(["watchlist", "screener"]).optional().default("screener"),
  current: z
    .object({
      coingeckoIds: z.array(z.string()).max(2000).optional(),
    })
    .optional(),
})

export const SmartScreenerScreenInterpretResponseSchema = z.object({
  dsl: ScreeningDslSchema,
  confidence: z.number().min(0).max(1),
})

export const SmartScreenerScreenResponseSchema = z.object({
  ok: z.boolean(),
  confidence: z.number().min(0).max(1),
  dsl: ScreeningDslSchema,
  summary: z.string(),
  resultIds: z.array(z.string()).max(500),
  rows: z.array(
    z.object({
      coingeckoId: z.string(),
      symbol: z.string(),
      name: z.string(),
      image: z.string(),
      currentPrice: z.number().optional(),
      marketCap: z.number().optional(),
      marketCapRank: z.number().optional(),
      totalVolume: z.number().optional(),
      priceChangePercentage24h: z.number().optional(),
      updatedAt: z.number().optional(),
    }),
  ),
  coverage: z.object({
    scanned: z.number(),
    matched: z.number(),
    maxRankScanned: z.number().nullable(),
    missingByMetricId: z.record(z.number()),
    warmupScheduled: z.boolean(),
    warmupTopN: z.number().nullable(),
    marketChartWarmupRequestedCount: z.number().optional().default(0),
    marketChartWarmupDays: z.array(z.string()).optional().default([]),
  }),
  userMessage: z.string().nullable(),
})

export interface SmartScreenerScreenResponse
  extends z.infer<typeof SmartScreenerScreenResponseSchema> {}

