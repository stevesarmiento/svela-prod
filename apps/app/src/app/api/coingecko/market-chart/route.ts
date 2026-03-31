import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

interface MarketChartParams {
  id?: string;
  vs_currency?: string;
  days?: string;
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

  const searchParams = request.nextUrl.searchParams;
  const params: MarketChartParams = {
    id: searchParams.get("id") || undefined,
    vs_currency: searchParams.get("vs_currency") || "usd",
    days: searchParams.get("days") || "7",
  };

  if (!params.id) {
    return NextResponse.json({ error: "Missing required parameter: id" }, { status: 400 });
  }

  if (params.vs_currency?.toLowerCase() !== "usd") {
    return NextResponse.json(
      { error: "Only vs_currency=usd is supported" },
      { status: 400 },
    );
  }

  const coinId = params.id;
  const timeframe = params.days || "7";

  const series = await convex.query(api.coingeckoReads.getPriceHistorySeries, {
    serverToken: getServerToken(),
    coingeckoId: coinId,
    timeframe,
  });

  if (series.data.length < 2 || series.stale) {
    void convex
      .mutation(api.coingeckoWarmup.requestMarketChartRefresh, {
        serverToken: getServerToken(),
        coingeckoId: coinId,
        days: timeframe,
      })
      .catch(() => null);
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