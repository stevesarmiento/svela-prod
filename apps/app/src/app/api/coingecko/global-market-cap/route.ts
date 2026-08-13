import { Effect } from "effect";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

const GlobalMarketCapParamsSchema = z.object({
  vs_currency: z.string().optional().default("usd"),
  days: z.enum(["1", "7", "30", "365"]).optional().default("7"),
});

function expectsWindowCoverage(timeframe: "1" | "7" | "30" | "365"): number {
  return Number(timeframe);
}

export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const { searchParams } = new URL(request.url);
      const parsed = GlobalMarketCapParamsSchema.safeParse({
        vs_currency: searchParams.get("vs_currency"),
        days: searchParams.get("days"),
      });

      if (!parsed.success) {
        // Route-specific 400 contract: includes zod issue details.
        return NextResponse.json(
          { error: "Invalid parameters", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { vs_currency, days } = parsed.data;
      if (vs_currency.toLowerCase() !== "usd") {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Only vs_currency=usd is supported" }),
        );
      }

      const series = yield* convex.serverQuery(
        api.coingeckoReads.getGlobalMarketHistorySeries,
        { timeframe: days },
        { label: "getGlobalMarketHistorySeries" },
      );

      const expectedDays = expectsWindowCoverage(days);
      const earliest = series.data[0]?.timestamp ?? null;
      const hasCoverage =
        earliest == null
          ? true
          : earliest <= Date.now() - expectedDays * DAY_MS * 0.85;

      const warmupRequested =
        series.data.length < 2 || series.stale || !hasCoverage;
      if (warmupRequested) {
        yield* convex.warmup(
          api.coingeckoWarmup.requestGlobalMarketCapRefresh,
          { days },
          "coingecko-global-market-cap:requestGlobalMarketCapRefresh",
        );
      }

      return NextResponse.json(
        {
          data: {
            market_cap: series.data.map((point) => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.marketCapUsd,
            })),
            volume: series.data.map((point) => ({
              time: Math.floor(point.timestamp / 1000),
              value: point.volumeUsd,
            })),
          },
          status: {
            cached: true,
            stale: series.stale,
            warmupRequested,
            points: series.data.length,
            lastUpdated: series.lastUpdated,
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
  { name: "coingecko-global-market-cap", requireAuth: true },
);
