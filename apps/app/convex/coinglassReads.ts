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
  if (interval === "1m") return 2 * 60 * 1000;
  if (interval === "5m") return 5 * 60 * 1000;
  if (interval === "15m") return 10 * 60 * 1000;
  if (interval === "30m") return 15 * 60 * 1000;
  if (interval === "1h") return 20 * 60 * 1000;
  if (interval === "4h") return 45 * 60 * 1000;
  if (interval === "1d") return 3 * 60 * 60 * 1000;
  return 45 * 60 * 1000;
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
        q.eq("exchange", args.exchange).eq("symbol", args.symbol).eq("interval", args.interval),
      )
      .order("desc")
      .first();

    if (!latest) {
      return { data: [], lastUpdated: 0, stale: true };
    }

    const latestPoints = await ctx.db
      .query("coinglassSpotTakerBuySellVolumeHistory")
      .withIndex("by_exchange_and_symbol_and_interval_and_timestamp", (q) =>
        q.eq("exchange", args.exchange).eq("symbol", args.symbol).eq("interval", args.interval),
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
        q.eq("exchange", args.exchange).eq("symbol", args.symbol).eq("interval", args.interval),
      )
      .order("desc")
      .first();

    if (!latest) {
      return { data: [], lastUpdated: 0, stale: true };
    }

    const latestPoints = await ctx.db
      .query("coinglassFuturesTakerBuySellVolumeHistory")
      .withIndex("by_exchange_and_symbol_and_interval_and_timestamp", (q) =>
        q.eq("exchange", args.exchange).eq("symbol", args.symbol).eq("interval", args.interval),
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

