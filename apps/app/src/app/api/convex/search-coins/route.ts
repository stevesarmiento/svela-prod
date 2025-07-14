import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { NextRequest, NextResponse } from "next/server";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 20 } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
    }

    // Use CoinGecko search instead of legacy CoinMarketCap search
    const coins = await convex.query(api.coins.searchCoinGeckoCoins, { 
      query: query.toString(),
      limit: Number(limit)
    });

    // Transform to match expected interface (coinId -> coingeckoId)
    const transformedCoins = coins.map(coin => ({
      coinId: coin.coingeckoId, // Use CoinGecko ID as coinId
      name: coin.name,
      symbol: coin.symbol
    }));

    return NextResponse.json(transformedCoins);
  } catch (error) {
    console.error("Error searching CoinGecko coins:", error);
    return NextResponse.json(
      { error: "Failed to search coins" },
      { status: 500 }
    );
  }
} 