import { Effect } from "effect";
import { NextResponse } from "next/server";
import { z } from "zod";
import { effectRoute } from "@/lib/effect/server/route";
import { UpstreamHttp } from "@/lib/effect/server/upstream-http";
import { ConvexQueryError } from "@/lib/effect/server/errors";
import {
  COINGLASS_BASE_URL,
  unwrapCoinglassEnvelope,
} from "@/lib/effect/server/vendors/coinglass";
import { getApiHeaders, getUserApiKey } from "@/lib/user-api-keys";

const SupportedCoinsSchema = z.array(z.string());

export const GET = effectRoute(
  (_req, _ctx, session) =>
    Effect.gen(function* () {
      const apiKeyResult = yield* Effect.tryPromise({
        try: () => getUserApiKey(session.userId, "coinglass", "CG_API_KEY"),
        catch: (error) =>
          new ConvexQueryError({
            label: "getUserApiKey",
            message: error instanceof Error ? error.message : String(error),
          }),
      });

      if (!apiKeyResult.key) {
        // Route-specific 503 body: clients rely on the empty-data envelope.
        return NextResponse.json(
          {
            success: false,
            error:
              "CoinGlass API key not available. Please add your API key in settings or configure CG_API_KEY environment variable.",
            data: [],
            count: 0,
            lastUpdated: new Date().toISOString(),
          },
          { status: 503 },
        );
      }

      const http = yield* UpstreamHttp;
      const coins = yield* http.requestJson({
        vendor: "coinglass",
        endpoint: `${COINGLASS_BASE_URL}/futures/supported-coins`,
        decode: (data) =>
          SupportedCoinsSchema.parse(unwrapCoinglassEnvelope(data)),
        init: {
          headers: getApiHeaders("coinglass", apiKeyResult.key),
          // Cache for 1 minute as per CoinGlass docs
          next: { revalidate: 60 },
        },
      });

      return NextResponse.json(
        {
          success: true,
          data: coins,
          count: coins.length,
          lastUpdated: new Date().toISOString(),
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
          },
        },
      );
    }),
  {
    name: "coinglass-supported-coins",
    // Parity with the previous raw @v1/kv fixed-window budget (10/10s).
    limiter: "public-burst",
  },
);
