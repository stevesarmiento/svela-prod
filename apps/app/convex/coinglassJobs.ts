import { v } from "convex/values";
import { internal } from "./_generated/api";
import { type ActionCtx, internalAction } from "./_generated/server";

function getCoinGlassApiKey(): string {
  const key = process.env.CG_API_KEY || process.env["CG-API-KEY"];
  if (!key)
    throw new Error("Missing CG_API_KEY (or CG-API-KEY) in Convex environment");
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

// Unlike toNumber, a parse failure is null — not a legitimate-looking zero.
// Used to detect all-garbage snapshot payloads (absence = no data; a stored
// snapshot must mean real data).
function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type CoinglassHistoryPoint = {
  time: number;
  taker_buy_volume_usd: string | number;
  taker_sell_volume_usd: string | number;
};

type CoinglassOpenInterestPoint = {
  time: number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
};

type CoinglassLiquidationPoint = {
  time: number;
  aggregated_long_liquidation_usd: string | number;
  aggregated_short_liquidation_usd: string | number;
};

type CoinglassTakerBuySellExchange = {
  exchange: string;
  buy_ratio: string | number;
  sell_ratio: string | number;
  buy_vol_usd: string | number;
  sell_vol_usd: string | number;
};

async function fetchSpotTakerBuySellVolumeHistory(args: {
  apiKey: string;
  exchange: string;
  symbol: string;
  interval: string;
  limit: number;
}): Promise<
  Array<{
    timestamp: number;
    takerBuyVolumeUsd: number;
    takerSellVolumeUsd: number;
  }>
> {
  const url = new URL(
    "https://open-api-v4.coinglass.com/api/spot/taker-buy-sell-volume/history",
  );
  url.searchParams.set("exchange", args.exchange);
  url.searchParams.set("symbol", args.symbol);
  url.searchParams.set("interval", args.interval);
  url.searchParams.set("limit", String(args.limit));

  const response = await fetch(url.toString(), {
    headers: {
      "CG-API-KEY": args.apiKey,
      Accept: "application/json",
    },
    // A hung CoinGlass request must not stall a cron action; per-coin
    // failures are swallowed by the callers, so fail fast and move on.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CoinGlass request failed (${response.status}): ${body.slice(0, 200)}`,
    );
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

  const out: Array<{
    timestamp: number;
    takerBuyVolumeUsd: number;
    takerSellVolumeUsd: number;
  }> = [];
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
}): Promise<
  Array<{
    timestamp: number;
    takerBuyVolumeUsd: number;
    takerSellVolumeUsd: number;
  }>
> {
  const url = new URL(
    "https://open-api-v4.coinglass.com/api/futures/v2/taker-buy-sell-volume/history",
  );
  url.searchParams.set("exchange", args.exchange);
  url.searchParams.set("symbol", args.symbol);
  url.searchParams.set("interval", args.interval);
  url.searchParams.set("limit", String(args.limit));

  const response = await fetch(url.toString(), {
    headers: {
      "CG-API-KEY": args.apiKey,
      Accept: "application/json",
    },
    // A hung CoinGlass request must not stall a cron action; per-coin
    // failures are swallowed by the callers, so fail fast and move on.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CoinGlass request failed (${response.status}): ${body.slice(0, 200)}`,
    );
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

  const out: Array<{
    timestamp: number;
    takerBuyVolumeUsd: number;
    takerSellVolumeUsd: number;
  }> = [];
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

async function fetchOpenInterestHistory(args: {
  apiKey: string;
  symbol: string;
  interval: string;
  unit: string;
  limit: number;
}): Promise<
  Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>
> {
  const url = new URL(
    "https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history",
  );
  url.searchParams.set("symbol", args.symbol);
  url.searchParams.set("interval", args.interval);
  url.searchParams.set("unit", args.unit);
  url.searchParams.set("limit", String(args.limit));

  const response = await fetch(url.toString(), {
    headers: {
      "CG-API-KEY": args.apiKey,
      Accept: "application/json",
    },
    // A hung CoinGlass request must not stall a cron action; per-coin
    // failures are swallowed by the callers, so fail fast and move on.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CoinGlass request failed (${response.status}): ${body.slice(0, 200)}`,
    );
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
  const points = data as Array<CoinglassOpenInterestPoint>;

  const out: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }> = [];
  for (const point of points) {
    if (!point || typeof point.time !== "number") continue;
    out.push({
      timestamp: point.time,
      open: toNumber(point.open),
      high: toNumber(point.high),
      low: toNumber(point.low),
      close: toNumber(point.close),
    });
  }
  return out;
}

async function fetchLiquidationHistory(args: {
  apiKey: string;
  symbol: string;
  interval: string;
  exchangeList: string;
  limit: number;
}): Promise<
  Array<{
    timestamp: number;
    longLiquidations: number;
    shortLiquidations: number;
    totalLiquidations: number;
  }>
> {
  const url = new URL(
    "https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history",
  );
  url.searchParams.set("symbol", args.symbol);
  url.searchParams.set("interval", args.interval);
  url.searchParams.set("exchange_list", args.exchangeList);
  url.searchParams.set("limit", String(args.limit));

  const response = await fetch(url.toString(), {
    headers: {
      "CG-API-KEY": args.apiKey,
      Accept: "application/json",
    },
    // A hung CoinGlass request must not stall a cron action; per-coin
    // failures are swallowed by the callers, so fail fast and move on.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CoinGlass request failed (${response.status}): ${body.slice(0, 200)}`,
    );
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
  const points = data as Array<CoinglassLiquidationPoint>;

  const out: Array<{
    timestamp: number;
    longLiquidations: number;
    shortLiquidations: number;
    totalLiquidations: number;
  }> = [];
  for (const point of points) {
    if (!point || typeof point.time !== "number") continue;
    const longLiquidations = toNumber(point.aggregated_long_liquidation_usd);
    const shortLiquidations = toNumber(point.aggregated_short_liquidation_usd);
    out.push({
      timestamp: point.time,
      longLiquidations,
      shortLiquidations,
      totalLiquidations: longLiquidations + shortLiquidations,
    });
  }
  return out;
}

async function fetchTakerBuySellExchangeList(args: {
  apiKey: string;
  symbol: string;
  range: string;
}): Promise<{
  overall: {
    buyRatio: number;
    sellRatio: number;
    buyVolumeUsd: number;
    sellVolumeUsd: number;
    totalVolumeUsd: number;
  };
  exchanges: Array<{
    exchange: string;
    buyRatio: number;
    sellRatio: number;
    buyVolumeUsd: number;
    sellVolumeUsd: number;
    totalVolumeUsd: number;
  }>;
} | null> {
  const url = new URL(
    "https://open-api-v4.coinglass.com/api/futures/taker-buy-sell-volume/exchange-list",
  );
  url.searchParams.set("symbol", args.symbol);
  url.searchParams.set("range", args.range);

  const response = await fetch(url.toString(), {
    headers: {
      "CG-API-KEY": args.apiKey,
      Accept: "application/json",
    },
    // A hung CoinGlass request must not stall a cron action; per-coin
    // failures are swallowed by the callers, so fail fast and move on.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CoinGlass request failed (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  const raw = (await response.json()) as unknown;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.code !== "0") {
    const msg = typeof record.msg === "string" ? record.msg : "Unknown error";
    throw new Error(`CoinGlass API error: ${msg}`);
  }

  const data = record.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // Skip the write when every core field is unparsable: persisting zeros
  // would make "no data" indistinguishable from a real all-zero snapshot.
  const coreFields = [d.buy_ratio, d.sell_ratio, d.buy_vol_usd, d.sell_vol_usd];
  if (coreFields.every((f) => toFiniteNumberOrNull(f) === null)) {
    return null;
  }

  const buyRatio = toNumber(d.buy_ratio);
  const sellRatio = toNumber(d.sell_ratio);
  const buyVolumeUsd = toNumber(d.buy_vol_usd);
  const sellVolumeUsd = toNumber(d.sell_vol_usd);
  const exchangesRaw = Array.isArray(d.exchange_list)
    ? (d.exchange_list as Array<CoinglassTakerBuySellExchange>)
    : [];

  return {
    overall: {
      buyRatio,
      sellRatio,
      buyVolumeUsd,
      sellVolumeUsd,
      totalVolumeUsd: buyVolumeUsd + sellVolumeUsd,
    },
    exchanges: exchangesRaw.map((ex) => {
      const exBuyVol = toNumber(ex.buy_vol_usd);
      const exSellVol = toNumber(ex.sell_vol_usd);
      return {
        exchange: ex.exchange,
        buyRatio: toNumber(ex.buy_ratio),
        sellRatio: toNumber(ex.sell_ratio),
        buyVolumeUsd: exBuyVol,
        sellVolumeUsd: exSellVol,
        totalVolumeUsd: exBuyVol + exSellVol,
      };
    }),
  };
}

function toSpotPairSymbol(baseSymbol: string): string {
  return `${baseSymbol.trim().toUpperCase()}USDT`;
}

async function upsertOne(
  ctx: ActionCtx,
  args: {
    exchange: string;
    symbol: string;
    interval: string;
    limit: number;
    dataSource: string;
    apiKey: string;
  },
): Promise<{ wrote: boolean; points: number }> {
  const points = await fetchSpotTakerBuySellVolumeHistory({
    apiKey: args.apiKey,
    exchange: args.exchange,
    symbol: args.symbol,
    interval: args.interval,
    limit: args.limit,
  });

  if (points.length === 0) return { wrote: false, points: 0 };

  await ctx.runMutation(
    internal.coinglassWriters._upsertSpotTakerBuySellVolumeHistory,
    {
      exchange: args.exchange,
      symbol: args.symbol,
      interval: args.interval,
      dataPoints: points,
      dataSource: args.dataSource,
      asOfMs: Date.now(),
    },
  );

  return { wrote: true, points: points.length };
}

async function upsertOneFutures(
  ctx: ActionCtx,
  args: {
    exchange: string;
    symbol: string;
    interval: string;
    limit: number;
    dataSource: string;
    apiKey: string;
  },
): Promise<{ wrote: boolean; points: number }> {
  const points = await fetchFuturesTakerBuySellVolumeHistory({
    apiKey: args.apiKey,
    exchange: args.exchange,
    symbol: args.symbol,
    interval: args.interval,
    limit: args.limit,
  });

  if (points.length === 0) return { wrote: false, points: 0 };

  await ctx.runMutation(
    internal.coinglassWriters._upsertFuturesTakerBuySellVolumeHistory,
    {
      exchange: args.exchange,
      symbol: args.symbol,
      interval: args.interval,
      dataPoints: points,
      dataSource: args.dataSource,
      asOfMs: Date.now(),
    },
  );

  return { wrote: true, points: points.length };
}

async function upsertOneOpenInterest(
  ctx: ActionCtx,
  args: {
    symbol: string;
    interval: string;
    unit: string;
    limit: number;
    dataSource: string;
    apiKey: string;
  },
): Promise<{ wrote: boolean; points: number }> {
  const points = await fetchOpenInterestHistory({
    apiKey: args.apiKey,
    symbol: args.symbol,
    interval: args.interval,
    unit: args.unit,
    limit: args.limit,
  });

  if (points.length === 0) return { wrote: false, points: 0 };

  await ctx.runMutation(internal.coinglassWriters._upsertOpenInterestHistory, {
    symbol: args.symbol,
    interval: args.interval,
    unit: args.unit,
    dataPoints: points,
    dataSource: args.dataSource,
    asOfMs: Date.now(),
  });

  return { wrote: true, points: points.length };
}

async function upsertOneLiquidations(
  ctx: ActionCtx,
  args: {
    symbol: string;
    interval: string;
    exchangeList: string;
    limit: number;
    dataSource: string;
    apiKey: string;
  },
): Promise<{ wrote: boolean; points: number }> {
  const points = await fetchLiquidationHistory({
    apiKey: args.apiKey,
    symbol: args.symbol,
    interval: args.interval,
    exchangeList: args.exchangeList,
    limit: args.limit,
  });

  if (points.length === 0) return { wrote: false, points: 0 };

  await ctx.runMutation(internal.coinglassWriters._upsertLiquidationHistory, {
    symbol: args.symbol,
    interval: args.interval,
    exchangeList: args.exchangeList,
    dataPoints: points,
    dataSource: args.dataSource,
    asOfMs: Date.now(),
  });

  return { wrote: true, points: points.length };
}

async function upsertOneTakerExchangeList(
  ctx: ActionCtx,
  args: {
    symbol: string;
    coingeckoId?: string;
    range: string;
    dataSource: string;
    apiKey: string;
  },
): Promise<{ wrote: boolean }> {
  const snapshot = await fetchTakerBuySellExchangeList({
    apiKey: args.apiKey,
    symbol: args.symbol,
    range: args.range,
  });
  if (!snapshot) return { wrote: false };

  await ctx.runMutation(
    internal.coinglassWriters._upsertTakerBuySellExchangeListSnapshot,
    {
      symbol: args.symbol,
      coingeckoId: args.coingeckoId,
      range: args.range,
      snapshot,
      dataSource: args.dataSource,
      asOfMs: Date.now(),
    },
  );

  return { wrote: true };
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

    const coingeckoIds = page.page.map(
      (row: { coingeckoId: string }) => row.coingeckoId,
    );
    if (coingeckoIds.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: null,
      });
      return { processed: 0, refreshed: 0, wrotePoints: 0 };
    }

    const coins = await ctx.runQuery(
      internal.coingeckoCoinsInternal._getCoinGeckoCoinsByIds,
      {
        ids: coingeckoIds,
      },
    );

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

export const refreshTrackedFuturesTakerBuySellVolumeHistoryBatch =
  internalAction({
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

      const coingeckoIds = page.page.map(
        (row: { coingeckoId: string }) => row.coingeckoId,
      );
      if (coingeckoIds.length === 0) {
        await ctx.runMutation(internal.coingeckoState._setJobCursor, {
          jobKey,
          cursor: null,
        });
        return { processed: 0, refreshed: 0, wrotePoints: 0 };
      }

      const coins = await ctx.runQuery(
        internal.coingeckoCoinsInternal._getCoinGeckoCoinsByIds,
        {
          ids: coingeckoIds,
        },
      );

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

export const refreshSingleOpenInterestHistory = internalAction({
  args: {
    symbol: v.string(), // base symbol, e.g. SOL
    interval: v.string(),
    unit: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ wrote: v.boolean(), points: v.number() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGlassApiKey();
    const limit = Math.min(500, Math.max(2, args.limit ?? 50));
    return await upsertOneOpenInterest(ctx, {
      symbol: args.symbol.trim().toUpperCase(),
      interval: args.interval,
      unit: args.unit,
      limit,
      dataSource: "coinglass-warmup-open-interest",
      apiKey,
    });
  },
});

export const refreshTrackedOpenInterestHistoryBatch = internalAction({
  args: {
    interval: v.optional(v.string()),
    unit: v.optional(v.string()),
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
    const interval = (args.interval ?? "4h").trim();
    const unit = (args.unit ?? "usd").trim();
    const limit = Math.min(500, Math.max(2, args.limit ?? 50));
    const batchSize = Math.min(50, Math.max(5, args.batchSize ?? 10));

    const jobKey = `coinglass:open-interest:${interval}:${unit}`;
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
    const coingeckoIds = page.page.map(
      (row: { coingeckoId: string }) => row.coingeckoId,
    );
    if (coingeckoIds.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: null,
      });
      return { processed: 0, refreshed: 0, wrotePoints: 0 };
    }

    const coins = await ctx.runQuery(
      internal.coingeckoCoinsInternal._getCoinGeckoCoinsByIds,
      {
        ids: coingeckoIds,
      },
    );

    let processed = 0;
    let refreshed = 0;
    let wrotePoints = 0;

    for (const coin of coins) {
      processed++;
      try {
        const result = await upsertOneOpenInterest(ctx, {
          symbol: coin.symbol.trim().toUpperCase(),
          interval,
          unit,
          limit,
          dataSource: "coinglass-cron-open-interest",
          apiKey,
        });
        if (result.wrote) {
          refreshed++;
          wrotePoints += result.points;
        }
      } catch {
        // Unsupported symbols expected.
      }
    }

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: page.continueCursor,
    });
    return { processed, refreshed, wrotePoints };
  },
});

export const refreshSingleLiquidationHistory = internalAction({
  args: {
    symbol: v.string(), // base symbol
    interval: v.string(),
    exchangeList: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ wrote: v.boolean(), points: v.number() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGlassApiKey();
    const limit = Math.min(500, Math.max(2, args.limit ?? 30));
    return await upsertOneLiquidations(ctx, {
      symbol: args.symbol.trim().toUpperCase(),
      interval: args.interval,
      exchangeList: args.exchangeList,
      limit,
      dataSource: "coinglass-warmup-liquidations",
      apiKey,
    });
  },
});

export const refreshTrackedLiquidationHistoryBatch = internalAction({
  args: {
    interval: v.optional(v.string()),
    exchangeList: v.optional(v.string()),
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
    const interval = (args.interval ?? "1d").trim();
    const exchangeList = (args.exchangeList ?? "Binance").trim();
    const limit = Math.min(500, Math.max(2, args.limit ?? 30));
    const batchSize = Math.min(50, Math.max(5, args.batchSize ?? 10));

    const jobKey = `coinglass:liquidations:${interval}:${exchangeList}`;
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
    const coingeckoIds = page.page.map(
      (row: { coingeckoId: string }) => row.coingeckoId,
    );
    if (coingeckoIds.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: null,
      });
      return { processed: 0, refreshed: 0, wrotePoints: 0 };
    }

    const coins = await ctx.runQuery(
      internal.coingeckoCoinsInternal._getCoinGeckoCoinsByIds,
      {
        ids: coingeckoIds,
      },
    );

    let processed = 0;
    let refreshed = 0;
    let wrotePoints = 0;

    for (const coin of coins) {
      processed++;
      try {
        const result = await upsertOneLiquidations(ctx, {
          symbol: coin.symbol.trim().toUpperCase(),
          interval,
          exchangeList,
          limit,
          dataSource: "coinglass-cron-liquidations",
          apiKey,
        });
        if (result.wrote) {
          refreshed++;
          wrotePoints += result.points;
        }
      } catch {
        // Unsupported symbols expected.
      }
    }

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: page.continueCursor,
    });
    return { processed, refreshed, wrotePoints };
  },
});

export const refreshSingleTakerBuySellExchangeListSnapshot = internalAction({
  args: {
    symbol: v.string(),
    coingeckoId: v.optional(v.string()),
    range: v.string(),
  },
  returns: v.object({ wrote: v.boolean() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGlassApiKey();
    const result = await upsertOneTakerExchangeList(ctx, {
      symbol: args.symbol.trim().toUpperCase(),
      coingeckoId: args.coingeckoId,
      range: args.range.trim(),
      dataSource: "coinglass-warmup-taker-exchange-list",
      apiKey,
    });
    return { wrote: result.wrote };
  },
});

export const refreshTrackedTakerBuySellExchangeListSnapshotBatch =
  internalAction({
    args: {
      range: v.optional(v.string()),
      batchSize: v.optional(v.number()),
    },
    returns: v.object({ processed: v.number(), refreshed: v.number() }),
    handler: async (ctx, args) => {
      const apiKey = getCoinGlassApiKey();
      const range = (args.range ?? "24h").trim();
      const batchSize = Math.min(50, Math.max(5, args.batchSize ?? 10));

      const jobKey = `coinglass:taker-exchange-list:${range}`;
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
      const coingeckoIds = page.page.map(
        (row: { coingeckoId: string }) => row.coingeckoId,
      );
      if (coingeckoIds.length === 0) {
        await ctx.runMutation(internal.coingeckoState._setJobCursor, {
          jobKey,
          cursor: null,
        });
        return { processed: 0, refreshed: 0 };
      }

      const coins = await ctx.runQuery(
        internal.coingeckoCoinsInternal._getCoinGeckoCoinsByIds,
        {
          ids: coingeckoIds,
        },
      );

      let processed = 0;
      let refreshed = 0;

      for (const coin of coins) {
        processed++;
        try {
          const result = await upsertOneTakerExchangeList(ctx, {
            symbol: coin.symbol.trim().toUpperCase(),
            coingeckoId: coin.coingeckoId,
            range,
            dataSource: "coinglass-cron-taker-exchange-list",
            apiKey,
          });
          if (result.wrote) refreshed++;
        } catch {
          // Unsupported symbols expected.
        }
      }

      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey,
        cursor: page.continueCursor,
      });
      return { processed, refreshed };
    },
  });
