import { NextResponse } from "next/server";
import { BASE_URL, fetchWithErrorHandling } from "../utils";

export async function GET() {
  try {
    const data = await fetchWithErrorHandling(
      `${BASE_URL}/cryptocurrency/listings/latest?start=1&limit=25&sort=market_cap&sort_dir=desc&aux=cmc_rank`
    );
    
    const topCoins = data.data.map((coin: any) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      cmc_rank: coin.cmc_rank,
      logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
      quote: coin.quote
    }));

    return NextResponse.json({
      coins: topCoins
    });
  } catch (error) {
    console.error("Top coins route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch top coins" },
      { status: 500 }
    );
  }
}