import { internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function getCoinGlassApiKey(): string {
  const key = process.env.CG_API_KEY || process.env["CG-API-KEY"];
  if (!key) throw new Error("Missing CG_API_KEY (or CG-API-KEY) in Convex environment");
  return key;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

type CoinglassHistoryPoint = {
  time: number;
  taker_buy_volume_usd: string | number;
  taker_sell_volume_usd: string | number;
};

async function fetchSpotTakerBuySellVolumeHistory(args: {
  apiKey: string;
  exchange: string;
  symbol: string;
  interval: string;
  limit: number;
}): Promise<Array<{ timestamp: number; takerBuyVolumeUsd: number; takerSellVolumeUsd: number }>> {
  const url = new URL("https://open-api-v4.coinglass.com/api/spot/taker-buy-sell-volume/history");
  url.searchParams.set("exchange", args.exchange);
  url.searchParams.set("symbol", args.symbol);
  url.searchParams.set("interval", args.interval);
  url.searchParams.set("limit", String(args.limit));

  const response = await fetch(url.toString(), {
    headers: {
      "CG-API-KEY": args.apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CoinGlass request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const raw = (await response.json()) as unknown;
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  if (record.code !== "0") {
    const msg = typeof record.msg === "string" ? record.msg : "Unknown error";
    throw new Error(`CoinGlass API error: ${msg}`);
  }

  const data = record.data;
  if (!Array.isArray(data)) return [];
  const points = data as Array<CoinglassHistoryPoint>;

  const out: Array<{ timestamp: number; takerBuyVolumeUsd: number; takerSellVolumeUsd: number }> = [];
  for (const point of points) {
    if (!point || typeof point.time !== "number") continue;
    out.push({
      timestamp: point.time,
      takerBuyVolumeUsd: toNumber(point.taker_buy_volume_usd),
      takerSellVolumeUsd: toNumber(point.taker_sell_volume_usd),
    });
  }

  return out;
}

async function fetchFuturesTakerBuySellVolumeHistory(args: {
  apiKey: string;
  exchange: string;
  symbol: string;
  interval: string;
  limit: number;
}): Promise<Array<{ timestamp: number; takerBuyVolumeUsd: number; takerSellVolumeUsd: number }>> {
  const url = new URL("https://open-api-v4.coinglass.com/api/futures/v2/taker-buy-sell-volume/history");
  url.searchParams.set("exchange", args.exchange);
  url.searchParams.set("symbol", args.symbol);
  url.searchParams.set("interval", args.interval);
  url.searchParams.set("limit", String(args.limit));

  const response = await fetch(url.toString(), {
    headers: {
      "CG-API-KEY": args.apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CoinGlass request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const raw = (await response.json()) as unknown;
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  if (record.code !== "0") {
    const msg = typeof record.msg === "string" ? record.msg : "Unknown error";
    throw new Error(`CoinGlass API error: ${msg}`);
  }

  const data = record.data;
  if (!Array.isArray(data)) return [];
  const points = data as Array<CoinglassHistoryPoint>;

  const out: Array<{ timestamp: number; takerBuyVolumeUsd: number; takerSellVolumeUsd: number }> = [];
  for (const point of points) {
    if (!point || typeof point.time !== "number") continue;
    out.push({
      timestamp: point.time,
      takerBuyVolumeUsd: toNumber(point.taker_buy_volume_usd),
      takerSellVolumeUsd: toNumber(point.taker_sell_volume_usd),
    });
  }

  return out;
}

function toSpotPairSymbol(baseSymbol: string): string {
  return `${baseSymbol.trim().toUpperCase()}USDT`;
}

async function upsertOne(
  ctx: ActionCtx,
  args: { exchange: string; symbol: string; interval: string; limit: number; dataSource: string; apiKey: string },
): Promise<{ wrote: boolean; points: number }> {
  const points = await fetchSpotTakerBuySellVolumeHistory({
    apiKey: args.apiKey,
    exchange: args.exchange,
    symbol: args.symbol,
    interval: args.interval,
    limit: args.limit,
  });

  if (points.length === 0) return { wrote: false, points: 0 };

  await ctx.runMutation(internal.coinglassWriters._upsertSpotTakerBuySellVolumeHistory, {
    exchange: args.exchange,
    symbol: args.symbol,
    interval: args.interval,
    dataPoints: points,
    dataSource: args.dataSource,
    asOfMs: Date.now(),
  });

  return { wrote: true, points: points.length };
}

async function upsertOneFutures(
  ctx: ActionCtx,
  args: { exchange: string; symbol: string; interval: string; limit: number; dataSource: string; apiKey: string },
): Promise<{ wrote: boolean; points: number }> {
  const points = await fetchFuturesTakerBuySellVolumeHistory({
    apiKey: args.apiKey,
    exchange: args.exchange,
    symbol: args.symbol,
    interval: args.interval,
    limit: args.limit,
  });

  if (points.length === 0) return { wrote: false, points: 0 };

  await ctx.runMutation(internal.coinglassWriters._upsertFuturesTakerBuySellVolumeHistory, {
    exchange: args.exchange,
    symbol: args.symbol,
    interval: args.interval,
    dataPoints: points,
    dataSource: args.dataSource,
    asOfMs: Date.now(),
  });

  return { wrote: true, points: points.length };
}

export const refreshSingleSpotTakerBuySellVolumeHistory = internalAction({
  args: {
    exchange: v.string(),
    symbol: v.string(), // pair symbol, e.g. BTCUSDT
    interval: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ wrote: v.boolean(), points: v.number() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGlassApiKey();
    const limit = Math.min(1000, Math.max(2, args.limit ?? 42));
    return await upsertOne(ctx, {
      exchange: args.exchange,
      symbol: args.symbol.toUpperCase(),
      interval: args.interval,
      limit,
      dataSource: "coinglass-warmup-spot-taker",
      apiKey,
    });
  },
});

export const refreshSingleFuturesTakerBuySellVolumeHistory = internalAction({
  args: {
    exchange: v.string(),
    symbol: v.string(), // pair symbol, e.g. BTCUSDT
    interval: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ wrote: v.boolean(), points: v.number() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGlassApiKey();
    const limit = Math.min(1000, Math.max(2, args.limit ?? 42));
    return await upsertOneFutures(ctx, {
      exchange: args.exchange,
      symbol: args.symbol.toUpperCase(),
      interval: args.interval,
      limit,
      dataSource: "coinglass-warmup-futures-taker",
      apiKey,
    });
  },
});

export const refreshTrackedSpotTakerBuySellVolumeHistoryBatch = internalAction({
  args: {
    exchange: v.optional(v.string()),
    interval: v.optional(v.string()),
    limit: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    refreshed: v.number(),
    wrotePoints: v.number(),
  }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGlassApiKey();
    const exchange = (args.exchange ?? "Binance").trim();
    const interval = (args.interval ?? "4h").trim();
    const limit = Math.min(300, Math.max(2, args.limit ?? 42));
    const batchSize = Math.min(50, Math.max(5, args.batchSize ?? 10));
    const jobKey = `coinglass:spot:taker-buy-sell:${exchange}:${interval}`;

    const state = await ctx.runQuery(internal.coingeckoState._getJobState, { jobKey });
    const cursor = state?.cursor ?? null;

    const page = await ctx.runQuery(internal.coingeckoState._getTrackedCoinsPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });

    const coingeckoIds = page.page.map((row) => row.coingeckoId);
    if (coingeckoIds.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, { jobKey, cursor: null });
      return { processed: 0, refreshed: 0, wrotePoints: 0 };
    }

    const coins = await ctx.runQuery(internal.coingeckoCoinsInternal._getCoinGeckoCoinsByIds, {
      ids: coingeckoIds,
    });

    let processed = 0;
    let refreshed = 0;
    let wrotePoints = 0;

    for (const coin of coins) {
      processed++;
      const pairSymbol = toSpotPairSymbol(coin.symbol);
      try {
        const result = await upsertOne(ctx, {
          exchange,
          symbol: pairSymbol,
          interval,
          limit,
          dataSource: "coinglass-cron-spot-taker",
          apiKey,
        });
        if (result.wrote) {
          refreshed++;
          wrotePoints += result.points;
        }
      } catch {
        // Swallow per-coin failures; unsupported pairs are expected.
      }
    }

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: page.continueCursor,
    });

    return { processed, refreshed, wrotePoints };
  },
});

export const refreshTrackedFuturesTakerBuySellVolumeHistoryBatch = internalAction({
  args: {
    exchange: v.optional(v.string()),
    interval: v.optional(v.string()),
    limit: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    refreshed: v.number(),
    wrotePoints: v.number(),
  }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGlassApiKey();
    const exchange = (args.exchange ?? "Binance").trim();
    const interval = (args.interval ?? "4h").trim();
    const limit = Math.min(300, Math.max(2, args.limit ?? 42));
    const batchSize = Math.min(50, Math.max(5, args.batchSize ?? 10));
    const jobKey = `coinglass:futures:taker-buy-sell:${exchange}:${interval}`;

    const state = await ctx.runQuery(internal.coingeckoState._getJobState, { jobKey });
    const cursor = state?.cursor ?? null;

    const page = await ctx.runQuery(internal.coingeckoState._getTrackedCoinsPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });

    const coingeckoIds = page.page.map((row) => row.coingeckoId);
    if (coingeckoIds.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, { jobKey, cursor: null });
      return { processed: 0, refreshed: 0, wrotePoints: 0 };
    }

    const coins = await ctx.runQuery(internal.coingeckoCoinsInternal._getCoinGeckoCoinsByIds, {
      ids: coingeckoIds,
    });

    let processed = 0;
    let refreshed = 0;
    let wrotePoints = 0;

    for (const coin of coins) {
      processed++;
      const pairSymbol = toSpotPairSymbol(coin.symbol);
      try {
        const result = await upsertOneFutures(ctx, {
          exchange,
          symbol: pairSymbol,
          interval,
          limit,
          dataSource: "coinglass-cron-futures-taker",
          apiKey,
        });
        if (result.wrote) {
          refreshed++;
          wrotePoints += result.points;
        }
      } catch {
        // Swallow per-coin failures; unsupported pairs are expected.
      }
    }

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: page.continueCursor,
    });

    return { processed, refreshed, wrotePoints };
  },
});

