import { Effect } from "effect";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env.mjs";
import { effectRoute } from "@/lib/effect/server/route";
import { UpstreamHttp } from "@/lib/effect/server/upstream-http";
import {
  COINGLASS_BASE_URL,
  coinglassHeaders,
  unwrapCoinglassEnvelope,
} from "@/lib/effect/server/vendors/coinglass";

const SupportedCoinsSchema = z.array(z.string());

export const GET = effectRoute(
  () =>
    Effect.gen(function* () {
      const apiKey = env.CG_API_KEY;

      if (!apiKey) {
        // Route-specific 503 body: clients rely on the empty-data envelope.
        return NextResponse.json(
          {
            success: false,
            error:
              "CoinGlass API key not available. Configure the CG_API_KEY environment variable.",
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
          headers: coinglassHeaders(apiKey),
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
