import { Effect } from "effect";
import { api } from "../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";

const DAY_MS = 24 * 60 * 60 * 1000;

function expectsWindowCoverage(timeframe: string): number | null {
  if (timeframe === "max") return 1825;
  const n = Number(timeframe);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export interface MarketChartPoint {
  time: number;
  value: number;
}

export interface MarketChartPayload {
  data: {
    prices: MarketChartPoint[];
    volumes: MarketChartPoint[];
    market_caps: MarketChartPoint[];
  };
  status: {
    cached: true;
    stale: boolean;
    warmupRequested: boolean;
    warming: boolean;
    coverage: "full" | "unknown";
    points: number;
    lastUpdated: number;
    lastFetchedAt: number | null;
  };
}

/** True when the payload may be edge-cached (nothing is warming or about to refresh). */
export function isCacheable(payload: MarketChartPayload): boolean {
  return !payload.status.warmupRequested && !payload.status.warming;
}

export const CACHEABLE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;
export const UNCACHEABLE_HEADERS = { "Cache-Control": "private, no-store" } as const;

/**
 * Reads one coin's price-history series from Convex and records the demand
 * signals (view + warmup request) exactly as the single-coin route does.
 * Shared by `/market-chart` and `/market-chart/batch`.
 */
export const loadMarketChart = (coinId: string, timeframe: string) =>
  Effect.gen(function* () {
    const convex = yield* ConvexService;

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
    const warmupRequested = series.data.length < 2 || series.stale || !hasCoverage;
    if (warmupRequested && !warming) {
      yield* convex.warmup(
        api.coingeckoWarmup.requestMarketChartRefresh,
        { coingeckoId: coinId, days: timeframe },
        "coingecko-market-chart:requestMarketChartRefresh",
      );
    }

    const payload: MarketChartPayload = {
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
    };
    return payload;
  });
