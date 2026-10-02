import { Effect } from "effect";
import { NextResponse } from "next/server";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";
import { CACHEABLE_HEADERS, UNCACHEABLE_HEADERS, isCacheable, loadMarketChart } from "./load";

export const dynamic = "force-dynamic";

interface MarketChartParams {
  id?: string;
  vs_currency?: string;
  days?: string;
}

export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const searchParams = request.nextUrl.searchParams;
      const params: MarketChartParams = {
        id: searchParams.get("id") || undefined,
        vs_currency: searchParams.get("vs_currency") || "usd",
        days: searchParams.get("days") || "7",
      };

      if (!params.id) {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Missing required parameter: id" }),
        );
      }

      if (params.vs_currency?.toLowerCase() !== "usd") {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Only vs_currency=usd is supported" }),
        );
      }

      const payload = yield* loadMarketChart(params.id, params.days || "7");

      return NextResponse.json(payload, {
        status: 200,
        // Don't edge-cache stale/warming payloads: clients fast-poll while a
        // warmup is in flight, and an s-maxage'd stale body would keep serving
        // the old series for up to 90s after Convex already has fresh data.
        headers: isCacheable(payload) ? CACHEABLE_HEADERS : UNCACHEABLE_HEADERS,
      });
    }),
  { name: "coingecko-market-chart", requireAuth: true },
);
