import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";

export const dynamic = "force-dynamic";

export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const searchParams = request.nextUrl.searchParams;
      const exchange = (searchParams.get("exchange") || "Binance").trim();
      const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
      const interval = (searchParams.get("interval") || "4h").trim();
      const limit = Math.min(512, Math.max(2, Number(searchParams.get("limit") || 42)));

      if (!symbol) {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Missing required parameter: symbol" }),
        );
      }

      const series = yield* convex.serverQuery(
        api.coinglassReads.getSpotTakerBuySellVolumeHistorySeries,
        { exchange, symbol, interval, limit },
        { label: "getSpotTakerBuySellVolumeHistorySeries" },
      );

      if (series.data.length < 2 || series.stale) {
        yield* convex.warmup(
          api.coinglassWarmup.requestSpotTakerBuySellVolumeHistoryRefresh,
          { exchange, symbol, interval, limit },
          "coinglass-spot-taker-volume:requestSpotTakerBuySellVolumeHistoryRefresh",
        );
      }

      return NextResponse.json(
        {
          success: true,
          data: series.data.map((point: { timestamp: number; takerBuyVolumeUsd: number; takerSellVolumeUsd: number }) => ({
            time: point.timestamp,
            takerBuyVolumeUsd: point.takerBuyVolumeUsd,
            takerSellVolumeUsd: point.takerSellVolumeUsd,
          })),
          count: series.data.length,
          exchange,
          symbol,
          interval,
          limit,
          originalInput: symbol,
          lastUpdated: new Date(series.lastUpdated || 0).toISOString(),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        },
      );
    }),
  { name: "coinglass-spot-taker-volume", requireAuth: true },
);
