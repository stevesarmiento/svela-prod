import { convex, getServerToken } from "@/lib/convex-server";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

function isProbablyCoinGeckoId(value: string): boolean {
  return value.includes("-") || value.toLowerCase() === value;
}

export async function GET(request: NextRequest) {
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

  const snapshot = await convex.query(
    api.coinglassReads.getTakerBuySellExchangeListSnapshot,
    {
      serverToken,
      symbol,
      range,
    },
  );

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
