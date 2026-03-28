import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";
import { getUserApiKey } from "@/lib/user-api-keys";

export const dynamic = "force-dynamic";

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

interface CoinGeckoMarketsRow {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  circulating_supply?: number;
  max_supply?: number | null;
  last_updated?: string;
}

async function fetchCoinGeckoMarkets(args: {
  apiKey: string;
  ids?: ReadonlyArray<string>;
  perPage: number;
}): Promise<CoinGeckoMarketsRow[]> {
  const url = new URL("https://pro-api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(Math.min(250, Math.max(1, args.perPage))));
  url.searchParams.set("page", "1");
  url.searchParams.set("sparkline", "false");
  url.searchParams.set("price_change_percentage", "1h,24h,7d,30d");

  if (args.ids && args.ids.length > 0) {
    url.searchParams.set("ids", args.ids.join(","));
    url.searchParams.set("per_page", String(Math.min(250, args.ids.length)));
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-cg-pro-api-key": args.apiKey,
      Accept: "application/json",
    },
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CoinGecko request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data as CoinGeckoMarketsRow[];
}

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const ids = parseCsv(searchParams.get("ids"));
    const symbols = parseCsv(searchParams.get("symbols"));
    const names = parseCsv(searchParams.get("names"));
    const category = searchParams.get("category");
    const limit = Math.min(250, Math.max(1, Number(searchParams.get("limit") ?? "100")));

    const serverToken = getServerToken();

    let resolvedIds: string[] = [];
    let warning: string | null = null;

    if (ids.length > 0) {
      resolvedIds = ids;
    } else if (symbols.length > 0) {
      const symbolMatches = await Promise.all(
        symbols.map(async (symbol) => {
          return await convex.query(api.coins.getCoinGeckoCoinsBySymbol, {
            serverToken,
            symbol,
          });
        }),
      );
      resolvedIds = symbolMatches.flat().map((c) => c.coingeckoId);
    } else if (names.length > 0) {
      const nameMatches = await Promise.all(
        names.map(async (name) => {
          const results = await convex.query(api.coins.searchCoinGeckoCoins, {
            serverToken,
            query: name,
            limit: Math.min(25, limit),
          });
          return results;
        }),
      );
      resolvedIds = nameMatches.flat().map((c) => c.coingeckoId);
    } else if (category) {
      warning = "Category filtering is not yet available; returning top coins.";
    }

    resolvedIds = Array.from(new Set(resolvedIds)).slice(0, limit);

    const data: Record<string, unknown> = {};

    const apiKeyResult = await getUserApiKey(userId, "coingecko", "X_CG_PRO_API_KEY");
    const apiKey = apiKeyResult.key;

    if (apiKey) {
      const rows = await fetchCoinGeckoMarkets({
        apiKey,
        ids: resolvedIds.length > 0 ? resolvedIds : undefined,
        perPage: resolvedIds.length > 0 ? resolvedIds.length : limit,
      });

      for (const row of rows) {
        data[row.id] = {
          id: row.id,
          name: row.name,
          symbol: row.symbol?.toUpperCase?.() ? row.symbol.toUpperCase() : row.symbol,
          market_cap_rank: row.market_cap_rank ?? null,
          image: row.image,
          current_price: row.current_price ?? null,
          market_cap: row.market_cap ?? null,
          total_volume: row.total_volume ?? null,
          price_change_percentage_24h: row.price_change_percentage_24h ?? null,
          price_change_percentage_1h_in_currency: row.price_change_percentage_1h_in_currency ?? null,
          price_change_percentage_7d_in_currency: row.price_change_percentage_7d_in_currency ?? null,
          price_change_percentage_30d_in_currency: row.price_change_percentage_30d_in_currency ?? null,
          circulating_supply: row.circulating_supply ?? null,
          max_supply: row.max_supply ?? null,
          last_updated: row.last_updated ?? new Date().toISOString(),
        };
      }

      if (resolvedIds.length > 0) {
        const missingIds = resolvedIds.filter((id) => data[id] === undefined);
        if (missingIds.length > 0) {
          await convex.mutation(api.coingeckoWarmup.requestMarketsRefresh, {
            serverToken,
            coingeckoIds: missingIds,
          });
        }
      }
    } else {
      warning = warning
        ? `${warning} Missing CoinGecko API key; falling back to cached DB.`
        : "Missing CoinGecko API key; falling back to cached DB.";

      const marketDocs =
        resolvedIds.length > 0
          ? await Promise.all(
              resolvedIds.map(async (id) => {
                return await convex.query(api.coingeckoMarkets.getMarketDataByCoingeckoId, {
                  serverToken,
                  coingeckoId: id,
                });
              }),
            )
          : await convex.query(api.coingeckoMarkets.getTopMarketDataByRank, {
              serverToken,
              limit,
            });

      for (const doc of marketDocs) {
        if (!doc) continue;
        data[doc.coingeckoId] = {
          id: doc.coingeckoId,
          name: doc.name,
          symbol: doc.symbol,
          market_cap_rank: doc.marketCapRank ?? null,
          image: doc.image,
          current_price: doc.currentPrice ?? null,
          market_cap: doc.marketCap ?? null,
          total_volume: doc.totalVolume ?? null,
          price_change_percentage_24h: doc.priceChangePercentage24h ?? null,
          circulating_supply: doc.circulatingSupply ?? null,
          max_supply: doc.maxSupply ?? null,
          last_updated: doc.lastUpdated,
        };
      }
    }

    return NextResponse.json(
      {
        data,
        status: {
          timestamp: new Date().toISOString(),
          error_code: 0,
          error_message: warning ?? "",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load CoinGecko quotes",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}