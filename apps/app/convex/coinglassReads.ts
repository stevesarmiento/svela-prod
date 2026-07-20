import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";

const historyPointValidator = v.object({
  _id: v.id("coinglassSpotTakerBuySellVolumeHistory"),
  _creationTime: v.number(),
  exchange: v.string(),
  symbol: v.string(),
  interval: v.string(),
  timestamp: v.number(),
  takerBuyVolumeUsd: v.number(),
  takerSellVolumeUsd: v.number(),
  dataSource: v.string(),
  lastUpdated: v.number(),
});

const MAX_RETURN_POINTS = 512;

function getStaleWindowMs(interval: string): number {
  // Stale windows are tuned to our cron cadence (generally 4h) and the natural data interval.
  if (interval === "1m") return 10 * 60 * 1000;
  if (interval === "5m") return 30 * 60 * 1000;
  if (interval === "15m") return 60 * 60 * 1000;
  if (interval === "30m") return 2 * 60 * 60 * 1000;
  if (interval === "1h") return 2 * 60 * 60 * 1000;
  if (interval === "4h") return 4 * 60 * 60 * 1000;
  if (interval === "1d") return 24 * 60 * 60 * 1000;
  return 4 * 60 * 60 * 1000;
}

export const getSpotTakerBuySellVolumeHistorySeries = query({
  args: {
    serverToken: v.string(),
    exchange: v.string(),
    symbol: v.string(),
    interval: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    data: v.array(historyPointValidator),
    lastUpdated: v.number(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const limit = Math.min(MAX_RETURN_POINTS, Math.max(2, args.limit ?? 42));

    const latest = await ctx.db
      .query("coinglassSpotTakerBuySellVolumeHistory")
      .withIndex("by_exchange_and_symbol_and_interval_and_last_updated", (q) =>
        q
          .eq("exchange", args.exchange)
          .eq("symbol", args.symbol)
          .eq("interval", args.interval),
      )
      .order("desc")
      .first();

    if (!latest) {
      return { data: [], lastUpdated: 0, stale: true };
    }

    const latestPoints = await ctx.db
      .query("coinglassSpotTakerBuySellVolumeHistory")
      .withIndex("by_exchange_and_symbol_and_interval_and_timestamp", (q) =>
        q
          .eq("exchange", args.exchange)
          .eq("symbol", args.symbol)
          .eq("interval", args.interval),
      )
      .order("desc")
      .take(limit);

    const data = latestPoints.slice().reverse();
    const staleWindowMs = getStaleWindowMs(args.interval);

    return {
      data,
      lastUpdated: latest.lastUpdated,
      stale: latest.lastUpdated <= now - staleWindowMs,
    };
  },
});

const futuresHistoryPointValidator = v.object({
  _id: v.id("coinglassFuturesTakerBuySellVolumeHistory"),
  _creationTime: v.number(),
  exchange: v.string(),
  symbol: v.string(),
  interval: v.string(),
  timestamp: v.number(),
  takerBuyVolumeUsd: v.number(),
  takerSellVolumeUsd: v.number(),
  dataSource: v.string(),
  lastUpdated: v.number(),
});

export const getFuturesTakerBuySellVolumeHistorySeries = query({
  args: {
    serverToken: v.string(),
    exchange: v.string(),
    symbol: v.string(),
    interval: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    data: v.array(futuresHistoryPointValidator),
    lastUpdated: v.number(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const limit = Math.min(MAX_RETURN_POINTS, Math.max(2, args.limit ?? 42));

    const latest = await ctx.db
      .query("coinglassFuturesTakerBuySellVolumeHistory")
      .withIndex("by_exchange_and_symbol_and_interval_and_last_updated", (q) =>
        q
          .eq("exchange", args.exchange)
          .eq("symbol", args.symbol)
          .eq("interval", args.interval),
      )
      .order("desc")
      .first();

    if (!latest) {
      return { data: [], lastUpdated: 0, stale: true };
    }

    const latestPoints = await ctx.db
      .query("coinglassFuturesTakerBuySellVolumeHistory")
      .withIndex("by_exchange_and_symbol_and_interval_and_timestamp", (q) =>
        q
          .eq("exchange", args.exchange)
          .eq("symbol", args.symbol)
          .eq("interval", args.interval),
      )
      .order("desc")
      .take(limit);

    const data = latestPoints.slice().reverse();
    const staleWindowMs = getStaleWindowMs(args.interval);

    return {
      data,
      lastUpdated: latest.lastUpdated,
      stale: latest.lastUpdated <= now - staleWindowMs,
    };
  },
});

const openInterestPointValidator = v.object({
  _id: v.id("coinglassOpenInterestHistory"),
  _creationTime: v.number(),
  symbol: v.string(),
  interval: v.string(),
  unit: v.string(),
  timestamp: v.number(),
  open: v.number(),
  high: v.number(),
  low: v.number(),
  close: v.number(),
  dataSource: v.string(),
  lastUpdated: v.number(),
});

export const getOpenInterestHistorySeries = query({
  args: {
    serverToken: v.string(),
    symbol: v.string(),
    interval: v.string(),
    unit: v.string(),
    limit: v.optional(v.number()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  returns: v.object({
    data: v.array(openInterestPointValidator),
    lastUpdated: v.number(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const limit = Math.min(MAX_RETURN_POINTS, Math.max(2, args.limit ?? 50));

    const latest = await ctx.db
      .query("coinglassOpenInterestHistory")
      .withIndex("by_symbol_and_interval_and_unit_and_last_updated", (q) =>
        q
          .eq("symbol", args.symbol)
          .eq("interval", args.interval)
          .eq("unit", args.unit),
      )
      .order("desc")
      .first();

    if (!latest) return { data: [], lastUpdated: 0, stale: true };

    const latestPoints = await ctx.db
      .query("coinglassOpenInterestHistory")
      .withIndex("by_symbol_and_interval_and_unit_and_timestamp", (q) => {
        const base = q
          .eq("symbol", args.symbol)
          .eq("interval", args.interval)
          .eq("unit", args.unit);
        if (args.startTime !== undefined && args.endTime !== undefined) {
          return base
            .gte("timestamp", args.startTime)
            .lte("timestamp", args.endTime);
        }
        if (args.startTime !== undefined)
          return base.gte("timestamp", args.startTime);
        if (args.endTime !== undefined)
          return base.lte("timestamp", args.endTime);
        return base;
      })
      .order("desc")
      .take(limit);

    const data = latestPoints.slice().reverse();
    const staleWindowMs = getStaleWindowMs(args.interval);
    return {
      data,
      lastUpdated: latest.lastUpdated,
      stale: latest.lastUpdated <= now - staleWindowMs,
    };
  },
});

const liquidationPointValidator = v.object({
  _id: v.id("coinglassLiquidationHistory"),
  _creationTime: v.number(),
  symbol: v.string(),
  interval: v.string(),
  exchangeList: v.string(),
  timestamp: v.number(),
  longLiquidations: v.number(),
  shortLiquidations: v.number(),
  totalLiquidations: v.number(),
  dataSource: v.string(),
  lastUpdated: v.number(),
});

export const getLiquidationHistorySeries = query({
  args: {
    serverToken: v.string(),
    symbol: v.string(),
    interval: v.string(),
    exchangeList: v.string(),
    limit: v.optional(v.number()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  returns: v.object({
    data: v.array(liquidationPointValidator),
    lastUpdated: v.number(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const limit = Math.min(MAX_RETURN_POINTS, Math.max(2, args.limit ?? 30));

    const latest = await ctx.db
      .query("coinglassLiquidationHistory")
      .withIndex(
        "by_symbol_and_interval_and_exchange_list_and_last_updated",
        (q) =>
          q
            .eq("symbol", args.symbol)
            .eq("interval", args.interval)
            .eq("exchangeList", args.exchangeList),
      )
      .order("desc")
      .first();

    if (!latest) return { data: [], lastUpdated: 0, stale: true };

    const latestPoints = await ctx.db
      .query("coinglassLiquidationHistory")
      .withIndex(
        "by_symbol_and_interval_and_exchange_list_and_timestamp",
        (q) => {
          const base = q
            .eq("symbol", args.symbol)
            .eq("interval", args.interval)
            .eq("exchangeList", args.exchangeList);
          if (args.startTime !== undefined && args.endTime !== undefined) {
            return base
              .gte("timestamp", args.startTime)
              .lte("timestamp", args.endTime);
          }
          if (args.startTime !== undefined)
            return base.gte("timestamp", args.startTime);
          if (args.endTime !== undefined)
            return base.lte("timestamp", args.endTime);
          return base;
        },
      )
      .order("desc")
      .take(limit);

    const data = latestPoints.slice().reverse();
    const staleWindowMs = getStaleWindowMs(args.interval);
    return {
      data,
      lastUpdated: latest.lastUpdated,
      stale: latest.lastUpdated <= now - staleWindowMs,
    };
  },
});

/**
 * Taker snapshots are refreshed by a 4h cron cursoring through tracked coins
 * (plus on-demand warmups). A tight window would flag everything stale by
 * construction; 6h means "eligible for warmup", not "unusable".
 */
const TAKER_SNAPSHOT_STALE_WINDOW_MS = 6 * 60 * 60 * 1000;

const takerBuySellSnapshotValidator = v.object({
  _id: v.id("coinglassTakerBuySellExchangeListSnapshots"),
  _creationTime: v.number(),
  symbol: v.string(),
  coingeckoId: v.optional(v.string()),
  range: v.string(),
  overall: v.object({
    buyRatio: v.number(),
    sellRatio: v.number(),
    buyVolumeUsd: v.number(),
    sellVolumeUsd: v.number(),
    totalVolumeUsd: v.number(),
  }),
  exchanges: v.array(
    v.object({
      exchange: v.string(),
      buyRatio: v.number(),
      sellRatio: v.number(),
      buyVolumeUsd: v.number(),
      sellVolumeUsd: v.number(),
      totalVolumeUsd: v.number(),
    }),
  ),
  dataSource: v.string(),
  lastUpdated: v.number(),
});

export const getTakerBuySellExchangeListSnapshot = query({
  args: {
    serverToken: v.string(),
    symbol: v.string(),
    range: v.string(),
  },
  returns: v.object({
    data: v.union(takerBuySellSnapshotValidator, v.null()),
    lastUpdated: v.number(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const staleWindowMs = TAKER_SNAPSHOT_STALE_WINDOW_MS;

    const latest = await ctx.db
      .query("coinglassTakerBuySellExchangeListSnapshots")
      .withIndex("by_symbol_and_range_and_last_updated", (q) =>
        q.eq("symbol", args.symbol).eq("range", args.range),
      )
      .order("desc")
      .first();

    if (!latest) return { data: null, lastUpdated: 0, stale: true };

    return {
      data: latest,
      lastUpdated: latest.lastUpdated,
      stale: latest.lastUpdated <= now - staleWindowMs,
    };
  },
});

export const getTakerBuySellExchangeListSnapshotsBatch = query({
  args: {
    serverToken: v.string(),
    symbols: v.array(v.string()),
    range: v.string(),
  },
  returns: v.array(
    v.object({
      symbol: v.string(),
      data: v.union(takerBuySellSnapshotValidator, v.null()),
      lastUpdated: v.number(),
      stale: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const staleWindowMs = TAKER_SNAPSHOT_STALE_WINDOW_MS;

    const symbols = Array.from(
      new Set(
        args.symbols
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s.length > 0),
      ),
    ).slice(0, 300);

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const latest = await ctx.db
          .query("coinglassTakerBuySellExchangeListSnapshots")
          .withIndex("by_symbol_and_range_and_last_updated", (q) =>
            q.eq("symbol", symbol).eq("range", args.range),
          )
          .order("desc")
          .first();

        if (!latest) {
          return { symbol, data: null, lastUpdated: 0, stale: true };
        }

        return {
          symbol,
          data: latest,
          lastUpdated: latest.lastUpdated,
          stale: latest.lastUpdated <= now - staleWindowMs,
        };
      }),
    );

    return results;
  },
});

/**
 * ID-keyed batch read for the screener. Joins by coingeckoId (canonical) with
 * a legacy fallback to the symbol index — but only for rows that no coin has
 * claimed yet (an owned row must not leak to a ticker twin).
 */
export const getTakerBuySellSnapshotsByCoinsBatch = query({
  args: {
    serverToken: v.string(),
    coins: v.array(
      v.object({
        coingeckoId: v.string(),
        symbol: v.string(),
      }),
    ),
    range: v.string(),
  },
  returns: v.array(
    v.object({
      coingeckoId: v.string(),
      symbol: v.string(),
      data: v.union(takerBuySellSnapshotValidator, v.null()),
      lastUpdated: v.number(),
      stale: v.boolean(),
      joinedBy: v.union(v.literal("id"), v.literal("symbol"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();

    const seen = new Set<string>();
    const coins: Array<{ coingeckoId: string; symbol: string }> = [];
    for (const coin of args.coins) {
      const id = coin.coingeckoId.trim();
      const symbol = coin.symbol.trim().toUpperCase();
      if (!id || !symbol || seen.has(id)) continue;
      seen.add(id);
      coins.push({ coingeckoId: id, symbol });
      if (coins.length >= 500) break;
    }

    const results = await Promise.all(
      coins.map(async (coin) => {
        const byId = await ctx.db
          .query("coinglassTakerBuySellExchangeListSnapshots")
          .withIndex("by_coingecko_id_and_range_and_last_updated", (q) =>
            q.eq("coingeckoId", coin.coingeckoId).eq("range", args.range),
          )
          .order("desc")
          .first();

        let latest = byId;
        let joinedBy: "id" | "symbol" | null = byId ? "id" : null;

        if (!latest) {
          const bySymbol = await ctx.db
            .query("coinglassTakerBuySellExchangeListSnapshots")
            .withIndex("by_symbol_and_range_and_last_updated", (q) =>
              q.eq("symbol", coin.symbol).eq("range", args.range),
            )
            .order("desc")
            .first();
          // Unowned legacy rows only — an id-stamped row belongs to that coin.
          if (bySymbol && bySymbol.coingeckoId === undefined) {
            latest = bySymbol;
            joinedBy = "symbol";
          }
        }

        if (!latest) {
          return {
            coingeckoId: coin.coingeckoId,
            symbol: coin.symbol,
            data: null,
            lastUpdated: 0,
            stale: true,
            joinedBy: null,
          };
        }

        return {
          coingeckoId: coin.coingeckoId,
          symbol: coin.symbol,
          data: latest,
          lastUpdated: latest.lastUpdated,
          stale: latest.lastUpdated <= now - TAKER_SNAPSHOT_STALE_WINDOW_MS,
          joinedBy,
        };
      }),
    );

    return results;
  },
});
