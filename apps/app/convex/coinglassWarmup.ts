import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";

const WARMUP_DEDUP_MS = 10 * 60 * 1000;

export const requestSpotTakerBuySellVolumeHistoryRefresh = mutation({
  args: {
    serverToken: v.string(),
    exchange: v.string(),
    symbol: v.string(), // pair symbol, e.g. BTCUSDT
    interval: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scheduled: v.boolean(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const jobKey = `warmup:coinglass:spot:taker:${args.exchange}:${args.symbol}:${args.interval}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) {
      return { scheduled: false, reason: "cooldown" };
    }

    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
    } else {
      await ctx.db.insert("jobState", {
        jobKey,
        cursor: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.coinglassJobs.refreshSingleSpotTakerBuySellVolumeHistory,
      {
        exchange: args.exchange,
        symbol: args.symbol,
        interval: args.interval,
        limit: args.limit,
      },
    );

    return { scheduled: true, reason: "scheduled" };
  },
});

export const requestFuturesTakerBuySellVolumeHistoryRefresh = mutation({
  args: {
    serverToken: v.string(),
    exchange: v.string(),
    symbol: v.string(), // pair symbol, e.g. BTCUSDT
    interval: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scheduled: v.boolean(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const jobKey = `warmup:coinglass:futures:taker:${args.exchange}:${args.symbol}:${args.interval}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) {
      return { scheduled: false, reason: "cooldown" };
    }

    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
    } else {
      await ctx.db.insert("jobState", {
        jobKey,
        cursor: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.coinglassJobs.refreshSingleFuturesTakerBuySellVolumeHistory,
      {
        exchange: args.exchange,
        symbol: args.symbol,
        interval: args.interval,
        limit: args.limit,
      },
    );

    return { scheduled: true, reason: "scheduled" };
  },
});

export const requestOpenInterestHistoryRefresh = mutation({
  args: {
    serverToken: v.string(),
    symbol: v.string(), // base symbol, e.g. SOL
    interval: v.string(),
    unit: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ scheduled: v.boolean(), reason: v.string() }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const jobKey = `warmup:coinglass:open-interest:${args.symbol}:${args.interval}:${args.unit}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) {
      return { scheduled: false, reason: "cooldown" };
    }

    if (existing) await ctx.db.patch(existing._id, { updatedAt: now });
    else {
      await ctx.db.insert("jobState", {
        jobKey,
        cursor: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.coinglassJobs.refreshSingleOpenInterestHistory,
      {
        symbol: args.symbol,
        interval: args.interval,
        unit: args.unit,
        limit: args.limit,
      },
    );

    return { scheduled: true, reason: "scheduled" };
  },
});

export const requestLiquidationHistoryRefresh = mutation({
  args: {
    serverToken: v.string(),
    symbol: v.string(), // base symbol, e.g. SOL
    interval: v.string(),
    exchangeList: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ scheduled: v.boolean(), reason: v.string() }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const jobKey = `warmup:coinglass:liquidations:${args.symbol}:${args.interval}:${args.exchangeList}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) {
      return { scheduled: false, reason: "cooldown" };
    }

    if (existing) await ctx.db.patch(existing._id, { updatedAt: now });
    else {
      await ctx.db.insert("jobState", {
        jobKey,
        cursor: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.coinglassJobs.refreshSingleLiquidationHistory,
      {
        symbol: args.symbol,
        interval: args.interval,
        exchangeList: args.exchangeList,
        limit: args.limit,
      },
    );

    return { scheduled: true, reason: "scheduled" };
  },
});

export const requestTakerBuySellExchangeListSnapshotRefresh = mutation({
  args: {
    serverToken: v.string(),
    symbol: v.string(), // base symbol, e.g. SOL
    coingeckoId: v.optional(v.string()), // canonical join key when known
    range: v.string(), // e.g. 24h
  },
  returns: v.object({ scheduled: v.boolean(), reason: v.string() }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const jobKey = `warmup:coinglass:taker-exchange-list:${args.coingeckoId ?? args.symbol}:${args.range}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) {
      return { scheduled: false, reason: "cooldown" };
    }

    if (existing) await ctx.db.patch(existing._id, { updatedAt: now });
    else {
      await ctx.db.insert("jobState", {
        jobKey,
        cursor: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.coinglassJobs.refreshSingleTakerBuySellExchangeListSnapshot,
      {
        symbol: args.symbol,
        coingeckoId: args.coingeckoId,
        range: args.range,
      },
    );

    return { scheduled: true, reason: "scheduled" };
  },
});
