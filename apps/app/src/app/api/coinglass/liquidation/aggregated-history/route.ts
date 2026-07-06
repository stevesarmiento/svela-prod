import { convex, getServerToken } from "@/lib/convex-server";
import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

function isProbablyCoinGeckoId(value: string): boolean {
  return value.includes("-") || value.toLowerCase() === value;
}

async function handleGet(request: NextRequest) {
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

  const serverToken = getServerToken();

  let symbol = rawSymbol.toUpperCase();
  let coinInfo: {
    symbol: string;
    name: string;
    coinId: number;
    isSupported: boolean;
  } | null = null;

  const numericCoinId = Number.parseInt(rawSymbol, 10);
  if (!Number.isNaN(numericCoinId)) {
    const resolved = await convex.query(api.coins.getCoinglassSymbolByCoinId, {
      serverToken,
      coinId: numericCoinId,
    });
    if (!resolved) {
      return NextResponse.json(
        {
          success: false,
          error: `Coin with ID ${numericCoinId} not found or not supported by CoinGlass`,
          coinId: numericCoinId,
        },
        { status: 400 },
      );
    }
    symbol = resolved.symbol.toUpperCase();
    coinInfo = {
      symbol,
      name: resolved.name,
      coinId: resolved.coinId,
      isSupported: resolved.isSupported,
    };
  } else if (isProbablyCoinGeckoId(rawSymbol)) {
    const coin = await convex.query(api.coins.getCoinGeckoCoinById, {
      serverToken,
      coingeckoId: rawSymbol.toLowerCase(),
    });
    if (coin) symbol = coin.symbol.toUpperCase();
  }

  const isSupported = await convex.query(api.coins.isCoinglassSupported, {
    serverToken,
    symbol,
  });
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

  const series = await convex.query(
    api.coinglassReads.getLiquidationHistorySeries,
    {
      serverToken,
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
  );

  if (series.data.length < 2 || series.stale) {
    void convex
      .mutation(api.coinglassWarmup.requestLiquidationHistoryRefresh, {
        serverToken,
        symbol,
        interval,
        exchangeList,
        limit,
      })
      .catch(() => null);
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
}

export const GET = withAuthRatelimit(handleGet, {
  name: "coinglass-liquidation",
});
