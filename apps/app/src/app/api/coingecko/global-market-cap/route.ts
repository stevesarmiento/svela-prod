import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

const GlobalMarketCapParamsSchema = z.object({
  vs_currency: z.string().optional().default("usd"),
  days: z.enum(["1", "7", "30", "365"]).optional().default("7"),
});

function expectsWindowCoverage(timeframe: "1" | "7" | "30" | "365"): number {
  return Number(timeframe);
}

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = GlobalMarketCapParamsSchema.safeParse({
    vs_currency: searchParams.get("vs_currency"),
    days: searchParams.get("days"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { vs_currency, days } = parsed.data;
  if (vs_currency.toLowerCase() !== "usd") {
    return NextResponse.json(
      { error: "Only vs_currency=usd is supported" },
      { status: 400 },
    );
  }

  const series = await convex.query(
    api.coingeckoReads.getGlobalMarketHistorySeries,
    {
      serverToken: getServerToken(),
      timeframe: days,
    },
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
    void convex
      .mutation(api.coingeckoWarmup.requestGlobalMarketCapRefresh, {
        serverToken: getServerToken(),
        days,
      })
      .catch(() => null);
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
}
