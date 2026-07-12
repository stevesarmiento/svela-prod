import { type NextRequest, NextResponse } from "next/server";
import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

const DAY_MS = 24 * 60 * 60 * 1000;

const OHLCParamsSchema = z.object({
  id: z.string(),
  vs_currency: z.string().optional().default("usd"),
  days: z
    .enum(["1", "7", "14", "30", "90", "180", "365", "max"])
    .optional()
    .default("7"),
  precision: z.string().optional().nullable(),
})

export interface OHLCDataPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

async function handleGet(request: NextRequest) {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url)

  const params = OHLCParamsSchema.safeParse({
    id: searchParams.get("id"),
    vs_currency: searchParams.get("vs_currency"),
    days: searchParams.get("days"),
    precision: searchParams.get("precision"),
  })

  if (!params.success) {
    return NextResponse.json({ error: "Invalid parameters", details: params.error.issues }, { status: 400 })
  }

  const { id: coinId, vs_currency, days } = params.data;

  if (vs_currency.toLowerCase() !== "usd") {
    return NextResponse.json(
      { error: "Only vs_currency=usd is supported", data: [] },
      { status: 400 },
    );
  }

  const timeframe = `${days}_ohlc`;
  const series = await convex.query(api.coingeckoReads.getPriceHistorySeries, {
    serverToken: getServerToken(),
    coingeckoId: coinId,
    timeframe,
  });

  // Demand signal for the chart scheduler (throttled server-side).
  void convex
    .mutation(api.coingeckoState.recordSeriesView, {
      serverToken: getServerToken(),
      coingeckoId: coinId,
      timeframe,
    })
    .catch(() => null);

  // A recorded successful fetch proves full-window coverage (young coins
  // simply have less history); the earliest-point heuristic is only a
  // fallback for series that predate chartSeries metadata.
  const earliest = series.data[0]?.timestamp ?? null;
  const legacyCoverage =
    earliest == null ? true : earliest <= Date.now() - Number(days === "max" ? 365 : days) * DAY_MS * 0.85;
  const hasCoverage = series.freshness.coverage === "full" || legacyCoverage;

  const warming = series.freshness.warming;
  const warmupRequested = series.data.length < 2 || series.stale || !hasCoverage;
  if (warmupRequested && !warming) {
    void convex
      .mutation(api.coingeckoWarmup.requestOhlcRefresh, {
        serverToken: getServerToken(),
        coingeckoId: coinId,
        days,
      })
      .catch(() => null);
  }

  const transformedData: Array<OHLCDataPoint> = series.data.map((point) => {
    const close = point.close ?? point.price;
    return {
      timestamp: point.timestamp,
      open: point.open ?? close,
      high: point.high ?? close,
      low: point.low ?? close,
      close,
    };
  });

  return NextResponse.json(
    {
      data: transformedData,
      cached: true,
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
        // Don't edge-cache stale/warming payloads — warmup polls must see
        // fresh data as soon as Convex has it.
        "Cache-Control":
          warmupRequested || warming
            ? "private, no-store"
            : "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
export const GET = withAuthRatelimit(handleGet, {
  name: "coingecko-ohlc",
});
