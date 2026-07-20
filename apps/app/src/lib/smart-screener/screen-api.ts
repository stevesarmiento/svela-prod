import { z } from "zod";

import { ScreeningDslSchema } from "./screening-dsl";

/**
 * Unified smart-screener request: exactly ONE of `text` (interpret + execute)
 * or `dsl` (execute-only — edited-chip resubmission, URL restore; never
 * touches the LLM or its rate budget).
 */
export const SmartScreenerScreenRequestSchema = z
  .object({
    text: z.string().min(1).optional(),
    dsl: ScreeningDslSchema.optional(),
    /** With `text`: return the parsed DSL without executing it (eval harness). */
    interpretOnly: z.boolean().optional().default(false),
    surface: z.enum(["watchlist", "screener"]).optional().default("screener"),
    current: z
      .object({
        coingeckoIds: z.array(z.string()).max(2000).optional(),
      })
      .optional(),
  })
  .superRefine((req, ctx) => {
    const hasText = typeof req.text === "string" && req.text.length > 0;
    const hasDsl = req.dsl !== undefined;
    if (hasText === hasDsl) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of `text` or `dsl`.",
      });
    }
    if (req.interpretOnly && !hasText) {
      ctx.addIssue({
        code: "custom",
        path: ["interpretOnly"],
        message: "`interpretOnly` requires `text`.",
      });
    }
  });

export type SmartScreenerScreenRequest = z.infer<
  typeof SmartScreenerScreenRequestSchema
>;

export const SmartScreenerScreenInterpretResponseSchema = z.object({
  dsl: ScreeningDslSchema,
  confidence: z.number().min(0).max(1),
});

export const SmartScreenerErrorCodeSchema = z.enum([
  "not_configured",
  "interpretation_failed",
  "low_confidence",
  "invalid_dsl",
  "upstream_timeout",
  "rate_limited",
  "internal",
]);

export type SmartScreenerErrorCode = z.infer<
  typeof SmartScreenerErrorCodeSchema
>;

/**
 * Response. All post-unification fields are ADDITIVE (optional) so a deployed
 * client keeps parsing during rollout; warmup fields survive (zeroed) even
 * though technical metrics no longer fetch series at request time.
 */
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
      /** Computed values for the DSL's filter/sort metricIds (null = missing data). */
      metrics: z.record(z.number().nullable()).optional(),
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
    takerCoinsRequested: z.number().optional().default(0),
    takerCoinsMissing: z.number().optional().default(0),
    takerWarmupRequestedCount: z.number().optional().default(0),
  }),
  userMessage: z.string().nullable(),
  requestId: z.string().optional(),
  interpretation: z
    .object({
      source: z.enum(["llm", "cache", "provided"]),
      model: z.string().optional(),
      latencyMs: z.number().optional(),
      promptVersion: z.number().optional(),
    })
    .optional(),
  error: z
    .object({
      code: SmartScreenerErrorCodeSchema,
      message: z.string(),
    })
    .optional(),
});

export interface SmartScreenerScreenResponse
  extends z.infer<typeof SmartScreenerScreenResponseSchema> {}
