import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const exchange = (searchParams.get("exchange") || "Binance").trim();
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = (searchParams.get("interval") || "4h").trim();
  const limit = Math.min(512, Math.max(2, Number(searchParams.get("limit") || 42)));

  if (!symbol) return NextResponse.json({ error: "Missing required parameter: symbol" }, { status: 400 });

  const [spot, futures] = await Promise.all([
    convex.query(api.coinglassReads.getSpotTakerBuySellVolumeHistorySeries, {
      serverToken: getServerToken(),
      exchange,
      symbol,
      interval,
      limit,
    }),
    convex.query(api.coinglassReads.getFuturesTakerBuySellVolumeHistorySeries, {
      serverToken: getServerToken(),
      exchange,
      symbol,
      interval,
      limit,
    }),
  ]);

  if (spot.data.length < 2 || spot.stale) {
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

  if (futures.data.length < 2 || futures.stale) {
    void convex
      .mutation(api.coinglassWarmup.requestFuturesTakerBuySellVolumeHistoryRefresh, {
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
}

