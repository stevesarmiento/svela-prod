import { type NextRequest, NextResponse } from "next/server";
import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

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

  const searchParams = request.nextUrl.searchParams;
  const exchange = (searchParams.get("exchange") || "Binance").trim();
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = (searchParams.get("interval") || "4h").trim();
  const limit = Math.min(512, Math.max(2, Number(searchParams.get("limit") || 42)));

  if (!symbol) {
    return NextResponse.json({ error: "Missing required parameter: symbol" }, { status: 400 });
  }

  const series = await convex.query(api.coinglassReads.getSpotTakerBuySellVolumeHistorySeries, {
    serverToken: getServerToken(),
    exchange,
    symbol,
    interval,
    limit,
  });

  if (series.data.length < 2 || series.stale) {
    void convex
      .mutation(api.coinglassWarmup.requestSpotTakerBuySellVolumeHistoryRefresh, {
        serverToken: getServerToken(),
        exchange,
        symbol,
        interval,
        limit,
      })
      .catch(() => null);
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
}


export const GET = withAuthRatelimit(handleGet, {
  name: "coinglass-spot-taker-volume",
});
