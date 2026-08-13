import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { effectRoute } from "@/lib/effect/server/route";
import { resolveCoinglassSymbol } from "@/lib/effect/server/vendors/coinglass";

export const dynamic = "force-dynamic";

export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const searchParams = request.nextUrl.searchParams;
      const rawSymbol = (searchParams.get("symbol") || "BTC").trim();
      const interval = (searchParams.get("interval") || "1d").trim();
      const exchangeList = (searchParams.get("exchange_list") || "Binance").trim();
      const limit = Math.min(
        512,
        Math.max(2, Number(searchParams.get("limit") || 30)),
      );
      const startTimeParam = searchParams.get("start_time");
      const endTimeParam = searchParams.get("end_time");
      const startTime = startTimeParam ? Number(startTimeParam) : undefined;
      const endTime = endTimeParam ? Number(endTimeParam) : undefined;

      const resolved = yield* resolveCoinglassSymbol(convex, rawSymbol, {
        // Route-specific contract: the 400 body includes the numeric coinId.
        coinIdNotFound: (coinId) =>
          Effect.succeed(
            NextResponse.json(
              {
                success: false,
                error: `Coin with ID ${coinId} not found or not supported by CoinGlass`,
                coinId,
              },
              { status: 400 },
            ),
          ),
      });
      if (resolved instanceof Response) return resolved;
      const { symbol, coinInfo } = resolved;

      // Support check and series read are independent — run them concurrently
      // instead of paying two sequential Convex round trips.
      const [isSupported, series] = yield* Effect.all(
        [
          convex.serverQuery(
            api.coins.isCoinglassSupported,
            { symbol },
            { label: "isCoinglassSupported" },
          ),
          convex.serverQuery(
            api.coinglassReads.getLiquidationHistorySeries,
            {
              symbol,
              interval,
              exchangeList,
              limit,
              startTime:
                typeof startTime === "number" && Number.isFinite(startTime)
                  ? startTime
                  : undefined,
              endTime:
                typeof endTime === "number" && Number.isFinite(endTime)
                  ? endTime
                  : undefined,
            },
            { label: "getLiquidationHistorySeries" },
          ),
        ],
        { concurrency: 2 },
      );
      if (!isSupported) {
        return NextResponse.json(
          {
            success: false,
            error: `Symbol ${symbol} is not supported by CoinGlass`,
            inputSymbol: rawSymbol,
          },
          { status: 400 },
        );
      }

      if (series.data.length < 2 || series.stale) {
        yield* convex.warmup(
          api.coinglassWarmup.requestLiquidationHistoryRefresh,
          { symbol, interval, exchangeList, limit },
          "coinglass-liquidation:requestLiquidationHistoryRefresh",
        );
      }

      return NextResponse.json(
        {
          success: true,
          data: series.data.map((point) => ({
            timestamp: point.timestamp,
            date: new Date(point.timestamp).toISOString(),
            longLiquidations: point.longLiquidations,
            shortLiquidations: point.shortLiquidations,
            totalLiquidations: point.totalLiquidations,
          })),
          count: series.data.length,
          symbol,
          originalInput: rawSymbol,
          coinInfo,
          interval,
          exchangeList,
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
  { name: "coinglass-liquidation" },
);
