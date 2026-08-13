import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";

export const dynamic = "force-dynamic";
const DAY_MS = 24 * 60 * 60 * 1000;

function expectsWindowCoverage(timeframe: string): number | null {
  if (timeframe === "max") return 1825;
  const n = Number(timeframe);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

interface MarketChartParams {
  id?: string;
  vs_currency?: string;
  days?: string;
}

export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

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

      const coinId = params.id;
      const timeframe = params.days || "7";

      const series = yield* convex.serverQuery(
        api.coingeckoReads.getPriceHistorySeries,
        { coingeckoId: coinId, timeframe },
        { label: "getPriceHistorySeries" },
      );

      // Record the view as a demand signal for the chart scheduler — on every
      // request, even when data is fresh (writes are throttled server-side).
      yield* convex.warmup(
        api.coingeckoState.recordSeriesView,
        { coingeckoId: coinId, timeframe },
        "coingecko-market-chart:recordSeriesView",
      );

      // Coverage: any recorded successful fetch proves the full window (a
      // market_chart response always contains everything CoinGecko has), so young
      // coins stop re-warming forever. The earliest-point heuristic remains only
      // as a fallback for series that predate chartSeries metadata.
      const expectedDays = expectsWindowCoverage(timeframe);
      const earliest = series.data[0]?.timestamp ?? null;
      const legacyCoverage =
        expectedDays == null || earliest == null
          ? true
          : earliest <= Date.now() - expectedDays * DAY_MS * 0.85;
      const hasCoverage = series.freshness.coverage === "full" || legacyCoverage;

      const warming = series.freshness.warming;
      const warmupRequested =
        series.data.length < 2 || series.stale || !hasCoverage;
      if (warmupRequested && !warming) {
        yield* convex.warmup(
          api.coingeckoWarmup.requestMarketChartRefresh,
          { coingeckoId: coinId, days: timeframe },
          "coingecko-market-chart:requestMarketChartRefresh",
        );
      }

      return NextResponse.json(
        {
          data: {
            prices: series.data.map((point) => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.price,
            })),
            volumes: series.data.map((point) => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.volume || 0,
            })),
            market_caps: series.data.map((point) => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.marketCap || 0,
            })),
          },
          status: {
            cached: true,
            stale: series.stale,
            warmupRequested,
            warming,
            coverage: series.freshness.coverage,
            points: series.data.length,
            lastUpdated: series.lastUpdated,
            lastFetchedAt: series.freshness.lastFetchedAt ?? null,
          },
        },
        {
          status: 200,
          headers: {
            // Don't edge-cache stale/warming payloads: clients fast-poll while a
            // warmup is in flight, and an s-maxage'd stale body would keep serving
            // the old series for up to 90s after Convex already has fresh data.
            "Cache-Control":
              warmupRequested || warming
                ? "private, no-store"
                : "public, s-maxage=30, stale-while-revalidate=60",
          },
        },
      );
    }),
  { name: "coingecko-market-chart", requireAuth: true },
);
