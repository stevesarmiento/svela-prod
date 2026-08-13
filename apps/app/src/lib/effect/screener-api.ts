import { Context, Effect, Layer, Schema } from "effect";
import type { z } from "zod";

import {
  type SmartScreenerScreenRequestSchema,
  type SmartScreenerScreenResponse,
  SmartScreenerScreenResponseSchema,
} from "@/lib/smart-screener/screen-api";
import { requestJson } from "./http-request";

/** Accepts the pre-default/pre-refine input shape of the zod request schema. */
export type ScreenerScreenRequest = z.input<
  typeof SmartScreenerScreenRequestSchema
>;

export class ScreenerScreenFailedError extends Schema.TaggedError<ScreenerScreenFailedError>()(
  "ScreenerScreenFailedError",
  {
    message: Schema.String,
    /**
     * The full parsed `ok: false` payload. The smart-prompt dialog renders
     * `userMessage` from it inline, so the structured failure must survive
     * the error channel.
     */
    response: Schema.optional(Schema.Unknown),
  },
) {}

export interface TakerFlowMetricsRow {
  buyRatio: number;
  sellRatio: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  totalVolumeUsd: number;
  lastUpdatedMs: number;
  stale: boolean;
}

export interface TakerMetricsResponse {
  success: boolean;
  byId: Record<string, TakerFlowMetricsRow | null>;
}

const TakerFlowMetricsRowSchema = Schema.Struct({
  buyRatio: Schema.Number,
  sellRatio: Schema.Number,
  buyVolumeUsd: Schema.Number,
  sellVolumeUsd: Schema.Number,
  totalVolumeUsd: Schema.Number,
  lastUpdatedMs: Schema.Number,
  stale: Schema.Boolean,
});

const TakerMetricsResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  byId: Schema.Record(
    Schema.String,
    Schema.NullOr(TakerFlowMetricsRowSchema),
  ),
});

// The screen endpoint may run an LLM interpretation pass; the generic 8s
// default would cut off legitimate requests (the old raw fetch had no
// timeout at all).
const SCREEN_TIMEOUT_MS = 30_000;

// biome-ignore lint/complexity/noStaticOnlyClass: Effect v4 service class — the class is the Context tag; `layer` must be static
export class ScreenerApi extends Context.Service<ScreenerApi>()("ScreenerApi", {
  make: Effect.gen(function* () {
    const screen = Effect.fn("ScreenerApi.screen")(function* (
      body: ScreenerScreenRequest,
    ) {
      const response = yield* requestJson({
        endpoint: "/api/smart-screener/screen",
        decode: (data) => SmartScreenerScreenResponseSchema.parse(data),
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        timeoutMs: SCREEN_TIMEOUT_MS,
      });

      // The screen API returns structured `ok: false` payloads with 200 only;
      // a non-2xx status is a transport/infra failure (rate limit, 500, …).
      if (!response.ok) {
        return yield* Effect.fail(
          new ScreenerScreenFailedError({
            message:
              response.error?.message ??
              response.userMessage ??
              "Screen failed",
            response,
          }),
        );
      }

      return response;
    });

    const takerMetrics = Effect.fn("ScreenerApi.takerMetrics")(function* (args: {
      coins: ReadonlyArray<{ coingeckoId: string; symbol: string }>;
      range: string;
    }) {
      return yield* requestJson({
        endpoint: "/api/smart-screener/taker-metrics",
        decode: (data): TakerMetricsResponse =>
          // Fresh JSON — safe to treat the decoded readonly record as mutable.
          Schema.decodeUnknownSync(TakerMetricsResponseSchema)(
            data,
          ) as TakerMetricsResponse,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coins: args.coins, range: args.range }),
        },
      });
    });

    return { screen, takerMetrics } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

/**
 * The `response` field is `unknown` on the error schema, but it is always the
 * zod-parsed screen response when present.
 */
export function screenFailedResponse(
  error: ScreenerScreenFailedError,
): SmartScreenerScreenResponse | null {
  return (error.response as SmartScreenerScreenResponse | undefined) ?? null;
}
