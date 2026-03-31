import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

const MarketsParamsSchema = z.object({
  ids: z.string(), // Comma-separated CoinGecko IDs (e.g., "bitcoin,ethereum")
  vs_currency: z.string().optional().default("usd"),
  include_24hr_change: z.boolean().optional().default(true),
  include_24hr_vol: z.boolean().optional().default(true),
  include_last_updated_at: z.boolean().optional().default(true),
})

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
  const params = MarketsParamsSchema.safeParse({
    ids: searchParams.get("ids"),
    vs_currency: searchParams.get("vs_currency") || undefined,
    include_24hr_change: searchParams.get("include_24hr_change") === "true",
    include_24hr_vol: searchParams.get("include_24hr_vol") === "true",
    include_last_updated_at: searchParams.get("include_last_updated_at") === "true",
  });

  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: params.error.issues },
      { status: 400 },
    );
  }

  const { ids, vs_currency } = params.data;
  if (vs_currency.toLowerCase() !== "usd") {
    return NextResponse.json(
      { error: "Only vs_currency=usd is supported" },
      { status: 400 },
    );
  }

  const uniqueIds = Array.from(
    new Set(
      ids
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ).slice(0, 250);

  const docs = await Promise.all(
    uniqueIds.map(async (id) => {
      return await convex.query(api.coingeckoMarkets.getMarketDataByCoingeckoId, {
        serverToken: getServerToken(),
        coingeckoId: id,
      });
    }),
  );

  const data = docs
    .filter((d) => d !== null)
    .map((d) => ({
      id: d.coingeckoId,
      symbol: d.symbol,
      name: d.name,
      image: d.image,
      current_price: d.currentPrice ?? null,
      market_cap: d.marketCap ?? null,
      market_cap_rank: d.marketCapRank ?? null,
      fully_diluted_valuation: d.fullyDilutedValuation ?? null,
      total_volume: d.totalVolume ?? null,
      high_24h: d.high24h ?? null,
      low_24h: d.low24h ?? null,
      price_change_24h: d.priceChange24h ?? null,
      price_change_percentage_24h: d.priceChangePercentage24h ?? null,
      market_cap_change_24h: d.marketCapChange24h ?? null,
      market_cap_change_percentage_24h: d.marketCapChangePercentage24h ?? null,
      circulating_supply: d.circulatingSupply ?? null,
      total_supply: d.totalSupply ?? null,
      max_supply: d.maxSupply ?? null,
      ath: d.ath ?? null,
      ath_change_percentage: d.athChangePercentage ?? null,
      ath_date: d.athDate ?? null,
      atl: d.atl ?? null,
      atl_change_percentage: d.atlChangePercentage ?? null,
      atl_date: d.atlDate ?? null,
      roi: null,
      last_updated: d.lastUpdated,
    }));

  return NextResponse.json(
    {
      data,
      cached: true,
      timestamp: Date.now(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}