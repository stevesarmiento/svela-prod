import { NextResponse, type NextRequest } from "next/server";
import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
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

function parseSparkline(args: { raw: string | null; defaultValue: boolean }): boolean {
  if (!args.raw) return args.defaultValue;
  const v = args.raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return args.defaultValue;
}

function parseLimit(args: {
  raw: string | null;
  requestedIdsCount: number;
}): number {
  // For explicit ID lookups, default to "all requested" (up to 500) so bulk quote
  // callers don't accidentally trigger partial maps + expensive fallbacks.
  if (!args.raw) {
    if (args.requestedIdsCount > 0) return Math.min(500, Math.max(1, args.requestedIdsCount));
    return 100;
  }

  const parsed = Number(args.raw);
  if (!Number.isFinite(parsed)) return args.requestedIdsCount > 0 ? Math.min(500, Math.max(1, args.requestedIdsCount)) : 100;

  // Top-coins mode uses a single `coins/markets` page (max 250). ID mode supports chunking (max 500).
  const max = args.requestedIdsCount > 0 ? 500 : 250;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

interface CoinGeckoMarketsRow {
  id: string;
  symbol: string;
  name: string;
  image: string;
  sparkline_in_7d?: {
    price?: number[];
  };
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

interface CoinGeckoCoinResponse {
  id: string;
  symbol: string;
  name: string;
  image?: {
    thumb?: string;
    small?: string;
    large?: string;
  };
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    market_cap_rank?: number;
    price_change_percentage_24h?: number;
    price_change_percentage_1h_in_currency?: { usd?: number };
    price_change_percentage_7d_in_currency?: { usd?: number };
    price_change_percentage_30d_in_currency?: { usd?: number };
    circulating_supply?: number;
    max_supply?: number | null;
    last_updated?: string;
  };
}

async function fetchCoinGeckoMarkets(args: {
  apiKey: string;
  ids?: ReadonlyArray<string>;
  perPage: number;
  sparkline: boolean;
}): Promise<CoinGeckoMarketsRow[]> {
  const url = new URL("https://pro-api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(Math.min(250, Math.max(1, args.perPage))));
  url.searchParams.set("page", "1");
  // Sparkline is expensive for large batches; allow callers to disable.
  url.searchParams.set("sparkline", args.sparkline ? "true" : "false");
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

async function fetchCoinGeckoCoin(args: {
  apiKey: string;
  id: string;
}): Promise<CoinGeckoCoinResponse | null> {
  const url = new URL(`https://pro-api.coingecko.com/api/v3/coins/${encodeURIComponent(args.id)}`);
  url.searchParams.set("localization", "false");
  url.searchParams.set("tickers", "false");
  url.searchParams.set("market_data", "true");
  url.searchParams.set("community_data", "false");
  url.searchParams.set("developer_data", "false");
  url.searchParams.set("sparkline", "false");

  const response = await fetch(url.toString(), {
    headers: {
      "x-cg-pro-api-key": args.apiKey,
      Accept: "application/json",
    },
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as unknown;
  if (typeof data !== "object" || data === null) return null;
  return data as CoinGeckoCoinResponse;
}

function chunk<T>(items: ReadonlyArray<T>, size: number): Array<Array<T>> {
  const out: Array<Array<T>> = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface CoingeckoMarketUpsertItem {
  coingeckoId: string;
  symbol: string;
  name: string;
  image: string;
  currentPrice?: number;
  marketCap?: number;
  marketCapRank?: number;
  totalVolume?: number;
  circulatingSupply?: number;
  maxSupply?: number;
  lastUpdated: string;
}

async function handleGet(request: NextRequest) {
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
    const limit = parseLimit({ raw: searchParams.get("limit"), requestedIdsCount: ids.length });

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

    const sparkline = parseSparkline({
      raw: searchParams.get("sparkline"),
      // Default: keep sparkline for small sets, disable for large bulk requests to avoid timeouts.
      defaultValue: resolvedIds.length <= 150,
    });

    const data: Record<string, unknown> = {};

    const apiKeyResult = await getUserApiKey(userId, "coingecko", "X_CG_PRO_API_KEY");
    const apiKey = apiKeyResult.key;

    if (apiKey) {
      const rows =
        resolvedIds.length > 0
          ? (
              await Promise.all(
                chunk(resolvedIds, 250).map(async (idChunk) => {
                  return await fetchCoinGeckoMarkets({
                    apiKey,
                    ids: idChunk,
                    perPage: idChunk.length,
                    sparkline,
                  });
                }),
              )
            ).flat()
          : await fetchCoinGeckoMarkets({ apiKey, perPage: limit, sparkline });

      for (const row of rows) {
        const sparkline7d =
          Array.isArray(row.sparkline_in_7d?.price) && row.sparkline_in_7d.price.length >= 2
            ? row.sparkline_in_7d.price.filter((v) => typeof v === "number" && Number.isFinite(v))
            : undefined;

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
          sparkline7d,
        };
      }

      if (resolvedIds.length > 0) {
        const missingIds = resolvedIds.filter((id) => data[id] === undefined);
        if (missingIds.length > 0) {
          // Fallback: some valid CoinGecko ids occasionally don't show up in `coins/markets`.
          // Try the per-coin endpoint to avoid blank watchlist rows.
          const MAX_FALLBACK_COINS = 25;
          if (missingIds.length > MAX_FALLBACK_COINS) {
            warning = warning
              ? `${warning} ${missingIds.length} coins missing from markets; skipping per-coin fallback.`
              : `${missingIds.length} coins missing from markets; skipping per-coin fallback.`;
          } else {
            const fallbackCoins = await Promise.all(
              missingIds.map(async (id) => {
              const coin = await fetchCoinGeckoCoin({ apiKey, id });
              if (!coin) return null;
              const md = coin.market_data;
              const image = coin.image?.large ?? coin.image?.small ?? coin.image?.thumb ?? "";

              data[id] = {
                id: coin.id ?? id,
                name: coin.name ?? id,
                symbol: coin.symbol?.toUpperCase?.() ? coin.symbol.toUpperCase() : coin.symbol ?? "N/A",
                market_cap_rank: md?.market_cap_rank ?? null,
                image,
                current_price: md?.current_price?.usd ?? null,
                market_cap: md?.market_cap?.usd ?? null,
                total_volume: md?.total_volume?.usd ?? null,
                price_change_percentage_24h: md?.price_change_percentage_24h ?? null,
                price_change_percentage_1h_in_currency:
                  md?.price_change_percentage_1h_in_currency?.usd ?? null,
                price_change_percentage_7d_in_currency:
                  md?.price_change_percentage_7d_in_currency?.usd ?? null,
                price_change_percentage_30d_in_currency:
                  md?.price_change_percentage_30d_in_currency?.usd ?? null,
                circulating_supply: md?.circulating_supply ?? null,
                max_supply: md?.max_supply ?? null,
                last_updated: md?.last_updated ?? new Date().toISOString(),
              };

              return id;
              }),
            );

            // If we successfully filled some via fallback, keep the warmup set minimal.
            void fallbackCoins;
          }

          const stillMissing = missingIds.filter((id) => data[id] === undefined);

          // Only schedule a backend refresh when something is actually missing;
          // don't make every read pay for a no-op mutation round trip.
          if (stillMissing.length > 0) {
            void convex
              .mutation(api.coingeckoWarmup.requestMarketsRefresh, {
                serverToken,
                coingeckoIds: stillMissing,
              })
              .catch((error) => {
                console.warn("[coingecko-quotes] requestMarketsRefresh failed:", error);
              });
          }
        }

        // Persist what we *did* fetch into Convex so portfolio/watchlist rendering works even
        // when clients later fall back to cached DB data.
        const marketItems: CoingeckoMarketUpsertItem[] = [];
        for (const id of resolvedIds) {
          const row = data[id] as
            | {
                id: string;
                name: string;
                symbol: string;
                image: string;
                current_price: number | null;
                market_cap: number | null;
                market_cap_rank: number | null;
                total_volume: number | null;
                circulating_supply: number | null;
                max_supply: number | null;
                last_updated: string;
              }
            | undefined;
          if (!row) continue;
          marketItems.push({
            coingeckoId: row.id,
            symbol: row.symbol,
            name: row.name,
            image: row.image,
            currentPrice: row.current_price ?? undefined,
            marketCap: row.market_cap ?? undefined,
            marketCapRank:
              row.market_cap_rank !== null && row.market_cap_rank > 0 ? row.market_cap_rank : undefined,
            totalVolume: row.total_volume ?? undefined,
            circulatingSupply: row.circulating_supply ?? undefined,
            maxSupply: row.max_supply ?? undefined,
            lastUpdated: row.last_updated,
          });
        }

        if (marketItems.length > 0) {
          // Fire-and-forget: persisting fresh quotes into Convex is a cache
          // warm, not part of the response. Don't serialize mutation chunks
          // on the hot read path.
          void Promise.all(
            chunk(marketItems, 100).map((itemChunk) =>
              convex.mutation(api.coingeckoMarkets.upsertMarketDataBatch, {
                serverToken,
                items: itemChunk,
              }),
            ),
          ).catch((error) => {
            console.warn("[coingecko-quotes] upsertMarketDataBatch failed:", error);
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
export const GET = withAuthRatelimit(handleGet, {
  name: "coingecko-quotes",
});
