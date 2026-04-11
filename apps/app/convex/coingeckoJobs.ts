import { internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function getCoinGeckoApiKey(): string {
  const key = process.env.X_CG_PRO_API_KEY;
  if (!key) throw new Error("Missing X_CG_PRO_API_KEY in Convex environment");
  return key;
}

function chunk<T>(items: ReadonlyArray<T>, size: number): Array<Array<T>> {
  const out: Array<Array<T>> = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

type CoinGeckoMarketRow = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  market_cap_change_24h: number | null;
  market_cap_change_percentage_24h: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_change_percentage: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_change_percentage: number | null;
  atl_date: string | null;
  last_updated: string | null;
};

async function fetchJson(endpoint: string, apiKey: string): Promise<unknown> {
  const response = await fetch(endpoint, {
    headers: {
      "x-cg-pro-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CoinGecko request failed (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  return await response.json();
}

function mapMarketRows(rows: ReadonlyArray<CoinGeckoMarketRow>): Array<{
  coingeckoId: string;
  symbol: string;
  name: string;
  image: string;
  currentPrice?: number;
  marketCap?: number;
  marketCapRank?: number;
  fullyDilutedValuation?: number;
  totalVolume?: number;
  high24h?: number;
  low24h?: number;
  priceChange24h?: number;
  priceChangePercentage24h?: number;
  marketCapChange24h?: number;
  marketCapChangePercentage24h?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number;
  ath?: number;
  athChangePercentage?: number;
  athDate?: string;
  atl?: number;
  atlChangePercentage?: number;
  atlDate?: string;
  lastUpdated: string;
}> {
  const fetchedAtIso = new Date().toISOString();
  return rows.map((coin) => ({
    coingeckoId: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    image: coin.image,
    currentPrice: coin.current_price ?? undefined,
    marketCap: coin.market_cap ?? undefined,
    // CoinGecko sometimes returns 0/null for unranked assets; never store those as a "top rank".
    marketCapRank:
      coin.market_cap_rank !== null && coin.market_cap_rank > 0
        ? coin.market_cap_rank
        : undefined,
    fullyDilutedValuation: coin.fully_diluted_valuation ?? undefined,
    totalVolume: coin.total_volume ?? undefined,
    high24h: coin.high_24h ?? undefined,
    low24h: coin.low_24h ?? undefined,
    priceChange24h: coin.price_change_24h ?? undefined,
    priceChangePercentage24h: coin.price_change_percentage_24h ?? undefined,
    marketCapChange24h: coin.market_cap_change_24h ?? undefined,
    marketCapChangePercentage24h:
      coin.market_cap_change_percentage_24h ?? undefined,
    circulatingSupply: coin.circulating_supply ?? undefined,
    totalSupply: coin.total_supply ?? undefined,
    maxSupply: coin.max_supply ?? undefined,
    ath: coin.ath ?? undefined,
    athChangePercentage: coin.ath_change_percentage ?? undefined,
    athDate: coin.ath_date ?? undefined,
    atl: coin.atl ?? undefined,
    atlChangePercentage: coin.atl_change_percentage ?? undefined,
    atlDate: coin.atl_date ?? undefined,
    lastUpdated: coin.last_updated ?? fetchedAtIso,
  }));
}

type CoinGeckoCoinListRow = {
  id: string;
  symbol: string;
  name: string;
  platforms?: Record<string, string>;
};

async function fetchCoinList(apiKey: string): Promise<CoinGeckoCoinListRow[]> {
  const url = new URL("https://pro-api.coingecko.com/api/v3/coins/list");
  url.searchParams.set("include_platform", "true");

  const data = (await fetchJson(url.toString(), apiKey)) as unknown;
  if (!Array.isArray(data)) return [];
  return data as CoinGeckoCoinListRow[];
}

async function upsertMarketsByIds(
  ctx: ActionCtx,
  args: { apiKey: string; coingeckoIds: ReadonlyArray<string> },
): Promise<{ requested: number; refreshed: number }> {
  const uniqueIds = Array.from(new Set(args.coingeckoIds))
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (uniqueIds.length === 0) return { requested: 0, refreshed: 0 };

  let refreshed = 0;
  for (const idChunk of chunk(uniqueIds, 250)) {
    const url = new URL("https://pro-api.coingecko.com/api/v3/coins/markets");
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("ids", idChunk.join(","));
    url.searchParams.set("order", "market_cap_desc");
    url.searchParams.set("per_page", String(Math.min(250, idChunk.length)));
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "false");
    url.searchParams.set("price_change_percentage", "24h");

    const data = (await fetchJson(
      url.toString(),
      args.apiKey,
    )) as Array<CoinGeckoMarketRow>;
    if (data.length === 0) continue;

    const items = mapMarketRows(data);
    await ctx.runMutation(internal.coingeckoWriters._upsertMarketDataBatch, {
      items,
    });
    refreshed += items.length;
  }

  return { requested: uniqueIds.length, refreshed };
}

export const syncCoinGeckoCoinsListBatch = internalAction({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({
    processed: v.number(),
    total: v.number(),
    inserted: v.number(),
    updated: v.number(),
    normalized: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    processed: number;
    total: number;
    inserted: number;
    updated: number;
    normalized: number;
    nextCursor: string | null;
  }> => {
    const apiKey = getCoinGeckoApiKey();
    const batchSize = Math.min(2000, Math.max(50, args.batchSize ?? 500));
    const jobKey = "coingecko:coins:list";

    const state: { cursor?: string } | null = await ctx.runQuery(
      internal.coingeckoState._getJobState,
      {
        jobKey,
      },
    );
    const rawCursor = state?.cursor ?? null;

    let offset = Number.parseInt(rawCursor ?? "0", 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const list = await fetchCoinList(apiKey);
    const total = list.length;
    if (total === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: null,
      });
      return {
        processed: 0,
        total: 0,
        inserted: 0,
        updated: 0,
        normalized: 0,
        nextCursor: null,
      };
    }

    if (offset >= total) offset = 0;

    const slice = list.slice(offset, offset + batchSize);
    if (slice.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: null,
      });
      return {
        processed: 0,
        total,
        inserted: 0,
        updated: 0,
        normalized: 0,
        nextCursor: null,
      };
    }

    const mapped = slice.map((coin) => ({
      coingeckoId: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      platforms: coin.platforms ?? {},
    }));

    const result: { inserted: number; updated: number; normalized: number } =
      await ctx.runMutation(
        internal.coingeckoWriters._syncCoinGeckoCoinsListBatch,
        {
          coins: mapped,
          asOfMs: Date.now(),
        },
      );

    const nextOffset = offset + slice.length;
    const nextCursor = nextOffset >= total ? null : String(nextOffset);
    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: nextCursor,
    });

    return {
      processed: slice.length,
      total,
      inserted: result.inserted,
      updated: result.updated,
      normalized: result.normalized,
      nextCursor,
    };
  },
});

export const refreshTopMarkets = internalAction({
  args: { topN: v.optional(v.number()) },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    const topN = args.topN ?? 500;

    const perPage = 250;
    const pages = Math.ceil(topN / perPage);

    const all: Array<CoinGeckoMarketRow> = [];
    for (let page = 1; page <= pages; page++) {
      const url = new URL("https://pro-api.coingecko.com/api/v3/coins/markets");
      url.searchParams.set("vs_currency", "usd");
      url.searchParams.set("order", "market_cap_desc");
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      url.searchParams.set("sparkline", "false");
      url.searchParams.set("price_change_percentage", "24h");

      const data = (await fetchJson(
        url.toString(),
        apiKey,
      )) as Array<CoinGeckoMarketRow>;
      all.push(...data);
    }

    const items = mapMarketRows(all).slice(0, topN);
    await ctx.runMutation(internal.coingeckoWriters._upsertMarketDataBatch, {
      items,
    });

    return { count: items.length };
  },
});

export const refreshMarketsByIds = internalAction({
  args: { coingeckoIds: v.array(v.string()) },
  returns: v.object({ requested: v.number(), refreshed: v.number() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    return await upsertMarketsByIds(ctx, {
      apiKey,
      coingeckoIds: args.coingeckoIds,
    });
  },
});

export const refreshTrackedMarketsBatch = internalAction({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ processed: v.number() }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 250;
    const jobKey = "coingecko:markets";

    const state = await ctx.runQuery(internal.coingeckoState._getJobState, {
      jobKey,
    });
    const cursor = state?.cursor ?? null;

    const page = await ctx.runQuery(
      internal.coingeckoState._getTrackedCoinsPage,
      {
        paginationOpts: { numItems: batchSize, cursor },
      },
    );

    const uniqueIds: Array<string> = [];
    const seen = new Set<string>();
    for (const row of page.page) {
      if (seen.has(row.coingeckoId)) continue;
      seen.add(row.coingeckoId);
      uniqueIds.push(row.coingeckoId);
    }

    if (uniqueIds.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: null,
      });
      return { processed: 0 };
    }

    const apiKey = getCoinGeckoApiKey();
    await upsertMarketsByIds(ctx, { apiKey, coingeckoIds: uniqueIds });

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: page.continueCursor,
    });

    return { processed: uniqueIds.length };
  },
});

type MarketChartApiResponse = {
  prices: Array<[number, number]>;
  market_caps: Array<[number, number]>;
  total_volumes: Array<[number, number]>;
};

type GlobalMarketCapChartApiResponse = {
  market_cap_chart: {
    market_cap: Array<[number, number]>;
    volume: Array<[number, number]>;
  };
};

async function upsertMarketChart(
  ctx: ActionCtx,
  args: {
    coingeckoId: string;
    days: string;
    apiKey: string;
    dataSource: string;
  },
): Promise<void> {
  const url = new URL(
    `https://pro-api.coingecko.com/api/v3/coins/${encodeURIComponent(args.coingeckoId)}/market_chart`,
  );
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", args.days);

  const data = (await fetchJson(
    url.toString(),
    args.apiKey,
  )) as MarketChartApiResponse;
  const points = data.prices.map((p, idx) => {
    const tsMs = p[0];
    const price = p[1];
    const vol = data.total_volumes[idx]?.[1] ?? 0;
    const mc = data.market_caps[idx]?.[1] ?? undefined;
    return {
      timestamp: tsMs,
      price,
      volume: vol,
      marketCap: mc,
    };
  });

  await ctx.runMutation(
    internal.coingeckoWriters._upsertCoinGeckoHistoricalData,
    {
      coingeckoId: args.coingeckoId,
      timeframe: args.days,
      dataPoints: points,
      dataSource: args.dataSource,
      asOfMs: Date.now(),
    },
  );
}

async function upsertGlobalMarketHistory(
  ctx: ActionCtx,
  args: { days: "1" | "7" | "30" | "365"; apiKey: string; dataSource: string },
): Promise<{
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  latestTimestamp?: number;
}> {
  const url = new URL(
    "https://pro-api.coingecko.com/api/v3/global/market_cap_chart",
  );
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", args.days);

  const data = (await fetchJson(
    url.toString(),
    args.apiKey,
  )) as GlobalMarketCapChartApiResponse;
  const marketCap = data.market_cap_chart?.market_cap ?? [];
  const volume = data.market_cap_chart?.volume ?? [];
  const volumeByTimestamp = new Map(
    volume.map(([timestamp, value]) => [timestamp, value] as const),
  );

  return await ctx.runMutation(
    internal.coingeckoWriters._upsertGlobalMarketHistory,
    {
      timeframe: args.days,
      dataPoints: marketCap.map(([timestamp, marketCapUsd]) => ({
        timestamp,
        marketCapUsd,
        volumeUsd: volumeByTimestamp.get(timestamp) ?? 0,
      })),
      dataSource: args.dataSource,
      asOfMs: Date.now(),
    },
  );
}

export const refreshTrackedMarketChartBatch = internalAction({
  args: {
    days: v.string(), // "1" | "7" | "90" | "365" | "1825" | "max"
    batchSize: v.optional(v.number()),
  },
  returns: v.object({ processed: v.number(), days: v.string() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    const batchSize = args.batchSize ?? 6;
    const jobKey = `coingecko:market-chart:${args.days}`;

    const state = await ctx.runQuery(internal.coingeckoState._getJobState, {
      jobKey,
    });
    const cursor = state?.cursor ?? null;

    const page = await ctx.runQuery(
      internal.coingeckoState._getTrackedCoinsPage,
      {
        paginationOpts: { numItems: batchSize, cursor },
      },
    );

    const uniqueIds: Array<string> = [];
    const seen = new Set<string>();
    for (const row of page.page) {
      if (seen.has(row.coingeckoId)) continue;
      seen.add(row.coingeckoId);
      uniqueIds.push(row.coingeckoId);
    }

    if (uniqueIds.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: null,
      });
      return { processed: 0, days: args.days };
    }

    for (const coingeckoId of uniqueIds) {
      await upsertMarketChart(ctx, {
        coingeckoId,
        days: args.days,
        apiKey,
        dataSource: "coingecko-cron-market-chart",
      });
    }

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: page.continueCursor,
    });

    return { processed: uniqueIds.length, days: args.days };
  },
});

export const refreshGlobalMarketCapHistory = internalAction({
  args: {
    days: v.union(
      v.literal("1"),
      v.literal("7"),
      v.literal("30"),
      v.literal("365"),
    ),
  },
  returns: v.object({
    days: v.union(
      v.literal("1"),
      v.literal("7"),
      v.literal("30"),
      v.literal("365"),
    ),
    insertedCount: v.number(),
    updatedCount: v.number(),
    skippedCount: v.number(),
    latestTimestamp: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    const result = await upsertGlobalMarketHistory(ctx, {
      days: args.days,
      apiKey,
      dataSource: "coingecko-cron-global-market-cap",
    });

    return {
      days: args.days,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      latestTimestamp: result.latestTimestamp,
    };
  },
});

export const refreshAllGlobalMarketCapHistoryWindows = internalAction({
  args: {},
  returns: v.object({
    processed: v.number(),
    results: v.array(
      v.object({
        days: v.union(
          v.literal("1"),
          v.literal("7"),
          v.literal("30"),
          v.literal("365"),
        ),
        insertedCount: v.number(),
        updatedCount: v.number(),
        skippedCount: v.number(),
        latestTimestamp: v.optional(v.number()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const apiKey = getCoinGeckoApiKey();
    const windows: Array<"1" | "7" | "30" | "365"> = ["1", "7", "30", "365"];
    const results: Array<{
      days: "1" | "7" | "30" | "365";
      insertedCount: number;
      updatedCount: number;
      skippedCount: number;
      latestTimestamp?: number;
    }> = [];

    for (const days of windows) {
      const result = await upsertGlobalMarketHistory(ctx, {
        days,
        apiKey,
        dataSource: "coingecko-backfill-global-market-cap",
      });
      results.push({
        days,
        insertedCount: result.insertedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        latestTimestamp: result.latestTimestamp,
      });
    }

    return {
      processed: results.length,
      results,
    };
  },
});

export const refreshSingleMarketChart = internalAction({
  args: {
    coingeckoId: v.string(),
    days: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    await upsertMarketChart(ctx, {
      coingeckoId: args.coingeckoId,
      days: args.days,
      apiKey,
      dataSource: "coingecko-warmup-market-chart",
    });
    return null;
  },
});

type OhlcApiRow = [number, number, number, number, number];

async function upsertOhlc(
  ctx: ActionCtx,
  args: {
    coingeckoId: string;
    days: string;
    apiKey: string;
    dataSource: string;
  },
): Promise<void> {
  const url = new URL(
    `https://pro-api.coingecko.com/api/v3/coins/${encodeURIComponent(args.coingeckoId)}/ohlc`,
  );
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", args.days);

  const data = (await fetchJson(
    url.toString(),
    args.apiKey,
  )) as Array<OhlcApiRow>;
  const points = data.map((row) => ({
    timestamp: row[0],
    price: row[4],
    volume: 0,
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
  }));

  await ctx.runMutation(
    internal.coingeckoWriters._upsertCoinGeckoHistoricalData,
    {
      coingeckoId: args.coingeckoId,
      timeframe: `${args.days}_ohlc`,
      dataPoints: points,
      dataSource: args.dataSource,
      asOfMs: Date.now(),
    },
  );
}

export const refreshSingleOhlc = internalAction({
  args: {
    coingeckoId: v.string(),
    days: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    await upsertOhlc(ctx, {
      coingeckoId: args.coingeckoId,
      days: args.days,
      apiKey,
      dataSource: "coingecko-warmup-ohlc",
    });
    return null;
  },
});

export const refreshTrackedOhlcBatch = internalAction({
  args: {
    days: v.string(), // CoinGecko OHLC supported windows
    batchSize: v.optional(v.number()),
  },
  returns: v.object({ processed: v.number(), days: v.string() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    const batchSize = args.batchSize ?? 4;
    const jobKey = `coingecko:ohlc:${args.days}`;

    const state = await ctx.runQuery(internal.coingeckoState._getJobState, {
      jobKey,
    });
    const cursor = state?.cursor ?? null;

    const page = await ctx.runQuery(
      internal.coingeckoState._getTrackedCoinsPage,
      {
        paginationOpts: { numItems: batchSize, cursor },
      },
    );

    const uniqueIds: Array<string> = [];
    const seen = new Set<string>();
    for (const row of page.page) {
      if (seen.has(row.coingeckoId)) continue;
      seen.add(row.coingeckoId);
      uniqueIds.push(row.coingeckoId);
    }

    if (uniqueIds.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: null,
      });
      return { processed: 0, days: args.days };
    }

    for (const coingeckoId of uniqueIds) {
      await upsertOhlc(ctx, {
        coingeckoId,
        days: args.days,
        apiKey,
        dataSource: "coingecko-cron-ohlc",
      });
    }

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: page.continueCursor,
    });

    return { processed: uniqueIds.length, days: args.days };
  },
});

export const refreshCoinImagesBatch = internalAction({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ processed: v.number() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    const batchSize = args.batchSize ?? 200;

    const needing = await ctx.runQuery(
      internal.coingeckoCoinsInternal._getCoinsNeedingImageUpdates,
      {
        limit: batchSize,
      },
    );
    if (needing.length === 0) return { processed: 0 };

    const ids = needing.map((c) => c.coingeckoId);
    const existing = await ctx.runQuery(
      internal.coingeckoCoinsInternal._getCoinGeckoCoinsByIds,
      { ids },
    );
    const existingById = new Map(existing.map((c) => [c.coingeckoId, c]));

    const chunks = chunk(ids, 250);
    let processed = 0;

    for (const idChunk of chunks) {
      const url = new URL("https://pro-api.coingecko.com/api/v3/coins/markets");
      url.searchParams.set("vs_currency", "usd");
      url.searchParams.set("ids", idChunk.join(","));
      url.searchParams.set("order", "market_cap_desc");
      url.searchParams.set("per_page", String(Math.min(250, idChunk.length)));
      url.searchParams.set("page", "1");
      url.searchParams.set("sparkline", "false");

      const data = (await fetchJson(
        url.toString(),
        apiKey,
      )) as Array<CoinGeckoMarketRow>;
      if (data.length === 0) continue;

      const coins = data
        .map((row) => {
          const prev = existingById.get(row.id);
          if (!prev) return null;
          return {
            coingeckoId: row.id,
            name: row.name,
            symbol: row.symbol.toUpperCase(),
            logoUrl: row.image,
            isActive: true,
            platforms: prev.platforms ?? {},
            imageUpdated: true,
          };
        })
        .filter((c) => c !== null);

      await ctx.runMutation(
        internal.coingeckoWriters._bulkUpsertCoinGeckoCoins,
        {
          coins,
          asOfMs: Date.now(),
        },
      );

      processed += coins.length;
    }

    return { processed };
  },
});
