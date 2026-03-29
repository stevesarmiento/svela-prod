import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const historyPointValidator = v.object({
  timestamp: v.number(), // ms
  takerBuyVolumeUsd: v.number(),
  takerSellVolumeUsd: v.number(),
});

function pickOverlapMs(interval: string): number {
  // Keep overlap bounded while allowing minor backfills/revisions.
  if (interval === "1m") return 2 * 60 * 60 * 1000;
  if (interval === "5m") return 6 * 60 * 60 * 1000;
  if (interval === "15m") return 12 * 60 * 60 * 1000;
  if (interval === "30m") return 24 * 60 * 60 * 1000;
  if (interval === "1h") return 36 * 60 * 60 * 1000;
  if (interval === "4h") return 72 * 60 * 60 * 1000;
  if (interval === "1d") return 14 * 24 * 60 * 60 * 1000;
  return 72 * 60 * 60 * 1000;
}

export const _upsertSpotTakerBuySellVolumeHistory = internalMutation({
  args: {
    exchange: v.string(),
    symbol: v.string(), // e.g. BTCUSDT
    interval: v.string(),
    dataPoints: v.array(historyPointValidator),
    dataSource: v.string(),
    asOfMs: v.optional(v.number()),
  },
  returns: v.object({
    insertedCount: v.number(),
    updatedCount: v.number(),
    skippedCount: v.number(),
    latestTimestamp: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = args.asOfMs ?? Date.now();
    if (args.dataPoints.length === 0) {
      return {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        latestTimestamp: undefined,
      };
    }

    const latestExisting = await ctx.db
      .query("coinglassSpotTakerBuySellVolumeHistory")
      .withIndex("by_exchange_and_symbol_and_interval_and_timestamp", (q) =>
        q.eq("exchange", args.exchange).eq("symbol", args.symbol).eq("interval", args.interval),
      )
      .order("desc")
      .first();

    const overlapMs = pickOverlapMs(args.interval);
    const cutoff = latestExisting ? latestExisting.timestamp - overlapMs : -Infinity;

    const existingWindow = latestExisting
      ? await ctx.db
          .query("coinglassSpotTakerBuySellVolumeHistory")
          .withIndex("by_exchange_and_symbol_and_interval_and_timestamp", (q) =>
            q
              .eq("exchange", args.exchange)
              .eq("symbol", args.symbol)
              .eq("interval", args.interval)
              .gte("timestamp", cutoff),
          )
          .collect()
      : [];

    const byTimestamp = new Map<number, (typeof existingWindow)[number]>();
    for (const row of existingWindow) byTimestamp.set(row.timestamp, row);

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const point of args.dataPoints) {
      const existing = byTimestamp.get(point.timestamp);
      if (!existing) {
        await ctx.db.insert("coinglassSpotTakerBuySellVolumeHistory", {
          exchange: args.exchange,
          symbol: args.symbol,
          interval: args.interval,
          timestamp: point.timestamp,
          takerBuyVolumeUsd: point.takerBuyVolumeUsd,
          takerSellVolumeUsd: point.takerSellVolumeUsd,
          dataSource: args.dataSource,
          lastUpdated: now,
        });
        insertedCount++;
        continue;
      }

      const hasDiff =
        existing.takerBuyVolumeUsd !== point.takerBuyVolumeUsd ||
        existing.takerSellVolumeUsd !== point.takerSellVolumeUsd;

      if (!hasDiff) {
        skippedCount++;
        continue;
      }

      await ctx.db.patch(existing._id, {
        takerBuyVolumeUsd: point.takerBuyVolumeUsd,
        takerSellVolumeUsd: point.takerSellVolumeUsd,
        dataSource: args.dataSource,
        lastUpdated: now,
      });
      updatedCount++;
    }

    const latestTimestamp = args.dataPoints.reduce(
      (max, p) => (p.timestamp > max ? p.timestamp : max),
      args.dataPoints[0]?.timestamp ?? 0,
    );

    return { insertedCount, updatedCount, skippedCount, latestTimestamp };
  },
});

export const _upsertFuturesTakerBuySellVolumeHistory = internalMutation({
  args: {
    exchange: v.string(),
    symbol: v.string(), // e.g. BTCUSDT
    interval: v.string(),
    dataPoints: v.array(historyPointValidator),
    dataSource: v.string(),
    asOfMs: v.optional(v.number()),
  },
  returns: v.object({
    insertedCount: v.number(),
    updatedCount: v.number(),
    skippedCount: v.number(),
    latestTimestamp: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = args.asOfMs ?? Date.now();
    if (args.dataPoints.length === 0) {
      return {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        latestTimestamp: undefined,
      };
    }

    const latestExisting = await ctx.db
      .query("coinglassFuturesTakerBuySellVolumeHistory")
      .withIndex("by_exchange_and_symbol_and_interval_and_timestamp", (q) =>
        q.eq("exchange", args.exchange).eq("symbol", args.symbol).eq("interval", args.interval),
      )
      .order("desc")
      .first();

    const overlapMs = pickOverlapMs(args.interval);
    const cutoff = latestExisting ? latestExisting.timestamp - overlapMs : -Infinity;

    const existingWindow = latestExisting
      ? await ctx.db
          .query("coinglassFuturesTakerBuySellVolumeHistory")
          .withIndex("by_exchange_and_symbol_and_interval_and_timestamp", (q) =>
            q
              .eq("exchange", args.exchange)
              .eq("symbol", args.symbol)
              .eq("interval", args.interval)
              .gte("timestamp", cutoff),
          )
          .collect()
      : [];

    const byTimestamp = new Map<number, (typeof existingWindow)[number]>();
    for (const row of existingWindow) byTimestamp.set(row.timestamp, row);

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const point of args.dataPoints) {
      const existing = byTimestamp.get(point.timestamp);
      if (!existing) {
        await ctx.db.insert("coinglassFuturesTakerBuySellVolumeHistory", {
          exchange: args.exchange,
          symbol: args.symbol,
          interval: args.interval,
          timestamp: point.timestamp,
          takerBuyVolumeUsd: point.takerBuyVolumeUsd,
          takerSellVolumeUsd: point.takerSellVolumeUsd,
          dataSource: args.dataSource,
          lastUpdated: now,
        });
        insertedCount++;
        continue;
      }

      const hasDiff =
        existing.takerBuyVolumeUsd !== point.takerBuyVolumeUsd ||
        existing.takerSellVolumeUsd !== point.takerSellVolumeUsd;

      if (!hasDiff) {
        skippedCount++;
        continue;
      }

      await ctx.db.patch(existing._id, {
        takerBuyVolumeUsd: point.takerBuyVolumeUsd,
        takerSellVolumeUsd: point.takerSellVolumeUsd,
        dataSource: args.dataSource,
        lastUpdated: now,
      });
      updatedCount++;
    }

    const latestTimestamp = args.dataPoints.reduce(
      (max, p) => (p.timestamp > max ? p.timestamp : max),
      args.dataPoints[0]?.timestamp ?? 0,
    );

    return { insertedCount, updatedCount, skippedCount, latestTimestamp };
  },
});

