import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";
import { resolveCoinglassSymbol } from "@/lib/effect/server/vendors/coinglass";

export const dynamic = "force-dynamic";

export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const searchParams = request.nextUrl.searchParams;
      const rawSymbol = (searchParams.get("symbol") || "").trim();
      const interval = (searchParams.get("interval") || "12h").trim();
      const unit = (searchParams.get("unit") || "usd").trim();
      const limit = Math.min(
        512,
        Math.max(2, Number(searchParams.get("limit") || 30)),
      );
      const startTimeParam = searchParams.get("start_time");
      const endTimeParam = searchParams.get("end_time");
      const startTime = startTimeParam ? Number(startTimeParam) : undefined;
      const endTime = endTimeParam ? Number(endTimeParam) : undefined;

      if (!rawSymbol) {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Symbol parameter is required" }),
        );
      }

      // Resolve user input into a CoinGlass base symbol.
      const resolved = yield* resolveCoinglassSymbol(convex, rawSymbol);
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
            api.coinglassReads.getOpenInterestHistorySeries,
            {
              symbol,
              interval,
              unit,
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
            { label: "getOpenInterestHistorySeries" },
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
          api.coinglassWarmup.requestOpenInterestHistoryRefresh,
          { symbol, interval, unit, limit },
          "coinglass-open-interest:requestOpenInterestHistoryRefresh",
        );
      }

      return NextResponse.json(
        {
          success: true,
          data: series.data.map((point) => ({
            timestamp: point.timestamp,
            open: point.open,
            high: point.high,
            low: point.low,
            close: point.close,
          })),
          count: series.data.length,
          symbol,
          interval,
          unit,
          originalInput: rawSymbol,
          coinInfo,
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
  { name: "coinglass-open-interest" },
);
