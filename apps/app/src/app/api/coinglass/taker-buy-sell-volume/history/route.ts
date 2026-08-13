import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
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

      const [spot, futures] = yield* Effect.all(
        [
          convex.serverQuery(
            api.coinglassReads.getSpotTakerBuySellVolumeHistorySeries,
            { exchange, symbol, interval, limit },
            { label: "getSpotTakerBuySellVolumeHistorySeries" },
          ),
          convex.serverQuery(
            api.coinglassReads.getFuturesTakerBuySellVolumeHistorySeries,
            { exchange, symbol, interval, limit },
            { label: "getFuturesTakerBuySellVolumeHistorySeries" },
          ),
        ],
        { concurrency: 2 },
      );

      if (spot.data.length < 2 || spot.stale) {
        yield* convex.warmup(
          api.coinglassWarmup.requestSpotTakerBuySellVolumeHistoryRefresh,
          { exchange, symbol, interval, limit },
          "coinglass-taker-volume:requestSpotTakerBuySellVolumeHistoryRefresh",
        );
      }

      if (futures.data.length < 2 || futures.stale) {
        yield* convex.warmup(
          api.coinglassWarmup.requestFuturesTakerBuySellVolumeHistoryRefresh,
          { exchange, symbol, interval, limit },
          "coinglass-taker-volume:requestFuturesTakerBuySellVolumeHistoryRefresh",
        );
      }

      return NextResponse.json(
        {
          success: true,
          exchange,
          symbol,
          interval,
          limit,
          spot: spot.data.map((point: { timestamp: number; takerBuyVolumeUsd: number; takerSellVolumeUsd: number }) => ({
            time: point.timestamp,
            takerBuyVolumeUsd: point.takerBuyVolumeUsd,
            takerSellVolumeUsd: point.takerSellVolumeUsd,
          })),
          futures: futures.data.map(
            (point: { timestamp: number; takerBuyVolumeUsd: number; takerSellVolumeUsd: number }) => ({
              time: point.timestamp,
              takerBuyVolumeUsd: point.takerBuyVolumeUsd,
              takerSellVolumeUsd: point.takerSellVolumeUsd,
            }),
          ),
          lastUpdated: {
            spot: spot.lastUpdated,
            futures: futures.lastUpdated,
          },
          stale: {
            spot: spot.stale,
            futures: futures.stale,
          },
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        },
      );
    }),
  { name: "coinglass-taker-volume", requireAuth: true },
);
