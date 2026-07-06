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
  const rawSymbol = (searchParams.get("symbol") || "").trim();
  const range = (searchParams.get("range") || "24h").trim();

  if (!rawSymbol) {
    return NextResponse.json(
      { success: false, error: "Symbol parameter is required" },
      { status: 400 },
    );
  }

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

  // Support check and snapshot read are independent — run them concurrently
  // instead of paying two sequential Convex round trips.
  const [isSupported, snapshot] = await Promise.all([
    convex.query(api.coins.isCoinglassSupported, {
      serverToken,
      symbol,
    }),
    convex.query(api.coinglassReads.getTakerBuySellExchangeListSnapshot, {
      serverToken,
      symbol,
      range,
    }),
  ]);
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

  if (!snapshot.data || snapshot.stale) {
    void convex
      .mutation(
        api.coinglassWarmup.requestTakerBuySellExchangeListSnapshotRefresh,
        {
          serverToken,
          symbol,
          range,
        },
      )
      .catch(() => null);
  }

  return NextResponse.json(
    {
      success: true,
      data: snapshot.data
        ? {
            symbol: snapshot.data.symbol,
            overall: snapshot.data.overall,
            exchanges: snapshot.data.exchanges,
          }
        : {
            symbol,
            overall: {
              buyRatio: 0,
              sellRatio: 0,
              buyVolumeUsd: 0,
              sellVolumeUsd: 0,
              totalVolumeUsd: 0,
            },
            exchanges: [],
          },
      range,
      symbol,
      originalInput: rawSymbol,
      coinInfo,
      lastUpdated: new Date(snapshot.lastUpdated || 0).toISOString(),
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
  name: "coinglass-taker-exchange",
});
