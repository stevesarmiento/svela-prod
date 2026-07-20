import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const historyPointValidator = v.object({
  timestamp: v.number(), // ms
  takerBuyVolumeUsd: v.number(),
  takerSellVolumeUsd: v.number(),
});

const openInterestPointValidator = v.object({
  timestamp: v.number(), // ms
  open: v.number(),
  high: v.number(),
  low: v.number(),
  close: v.number(),
});

const liquidationPointValidator = v.object({
  timestamp: v.number(), // ms
  longLiquidations: v.number(),
  shortLiquidations: v.number(),
  totalLiquidations: v.number(),
});

const takerExchangeSnapshotValidator = v.object({
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
        q
          .eq("exchange", args.exchange)
          .eq("symbol", args.symbol)
          .eq("interval", args.interval),
      )
      .order("desc")
      .first();

    const overlapMs = pickOverlapMs(args.interval);
    const cutoff = latestExisting
      ? latestExisting.timestamp - overlapMs
      : Number.NEGATIVE_INFINITY;

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
        q
          .eq("exchange", args.exchange)
          .eq("symbol", args.symbol)
          .eq("interval", args.interval),
      )
      .order("desc")
      .first();

    const overlapMs = pickOverlapMs(args.interval);
    const cutoff = latestExisting
      ? latestExisting.timestamp - overlapMs
      : Number.NEGATIVE_INFINITY;

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

export const _upsertOpenInterestHistory = internalMutation({
  args: {
    symbol: v.string(), // e.g. SOL
    interval: v.string(),
    unit: v.string(), // usd | coin
    dataPoints: v.array(openInterestPointValidator),
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
      .query("coinglassOpenInterestHistory")
      .withIndex("by_symbol_and_interval_and_unit_and_timestamp", (q) =>
        q
          .eq("symbol", args.symbol)
          .eq("interval", args.interval)
          .eq("unit", args.unit),
      )
      .order("desc")
      .first();

    const overlapMs = pickOverlapMs(args.interval);
    const cutoff = latestExisting
      ? latestExisting.timestamp - overlapMs
      : Number.NEGATIVE_INFINITY;

    const existingWindow = latestExisting
      ? await ctx.db
          .query("coinglassOpenInterestHistory")
          .withIndex("by_symbol_and_interval_and_unit_and_timestamp", (q) =>
            q
              .eq("symbol", args.symbol)
              .eq("interval", args.interval)
              .eq("unit", args.unit)
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
        await ctx.db.insert("coinglassOpenInterestHistory", {
          symbol: args.symbol,
          interval: args.interval,
          unit: args.unit,
          timestamp: point.timestamp,
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          dataSource: args.dataSource,
          lastUpdated: now,
        });
        insertedCount++;
        continue;
      }

      const hasDiff =
        existing.open !== point.open ||
        existing.high !== point.high ||
        existing.low !== point.low ||
        existing.close !== point.close;

      if (!hasDiff) {
        skippedCount++;
        continue;
      }

      await ctx.db.patch(existing._id, {
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
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

export const _upsertLiquidationHistory = internalMutation({
  args: {
    symbol: v.string(), // e.g. SOL
    interval: v.string(),
    exchangeList: v.string(),
    dataPoints: v.array(liquidationPointValidator),
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
      .query("coinglassLiquidationHistory")
      .withIndex(
        "by_symbol_and_interval_and_exchange_list_and_timestamp",
        (q) =>
          q
            .eq("symbol", args.symbol)
            .eq("interval", args.interval)
            .eq("exchangeList", args.exchangeList),
      )
      .order("desc")
      .first();

    const overlapMs = pickOverlapMs(args.interval);
    const cutoff = latestExisting
      ? latestExisting.timestamp - overlapMs
      : Number.NEGATIVE_INFINITY;

    const existingWindow = latestExisting
      ? await ctx.db
          .query("coinglassLiquidationHistory")
          .withIndex(
            "by_symbol_and_interval_and_exchange_list_and_timestamp",
            (q) =>
              q
                .eq("symbol", args.symbol)
                .eq("interval", args.interval)
                .eq("exchangeList", args.exchangeList)
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
        await ctx.db.insert("coinglassLiquidationHistory", {
          symbol: args.symbol,
          interval: args.interval,
          exchangeList: args.exchangeList,
          timestamp: point.timestamp,
          longLiquidations: point.longLiquidations,
          shortLiquidations: point.shortLiquidations,
          totalLiquidations: point.totalLiquidations,
          dataSource: args.dataSource,
          lastUpdated: now,
        });
        insertedCount++;
        continue;
      }

      const hasDiff =
        existing.longLiquidations !== point.longLiquidations ||
        existing.shortLiquidations !== point.shortLiquidations ||
        existing.totalLiquidations !== point.totalLiquidations;

      if (!hasDiff) {
        skippedCount++;
        continue;
      }

      await ctx.db.patch(existing._id, {
        longLiquidations: point.longLiquidations,
        shortLiquidations: point.shortLiquidations,
        totalLiquidations: point.totalLiquidations,
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

export const _upsertTakerBuySellExchangeListSnapshot = internalMutation({
  args: {
    symbol: v.string(), // e.g. SOL
    coingeckoId: v.optional(v.string()), // canonical join key when known
    range: v.string(), // e.g. 24h
    snapshot: takerExchangeSnapshotValidator,
    dataSource: v.string(),
    asOfMs: v.optional(v.number()),
  },
  returns: v.object({ wrote: v.boolean() }),
  handler: async (ctx, args) => {
    const now = args.asOfMs ?? Date.now();

    // Prefer the id-keyed row when we know the coin. Fall back to the legacy
    // (symbol, range) row and ADOPT it by stamping the id — every write
    // self-heals legacy rows, so no big-bang backfill is strictly required.
    let existing = args.coingeckoId
      ? await ctx.db
          .query("coinglassTakerBuySellExchangeListSnapshots")
          .withIndex("by_coingecko_id_and_range_and_last_updated", (q) =>
            q.eq("coingeckoId", args.coingeckoId).eq("range", args.range),
          )
          .first()
      : null;

    if (!existing) {
      const legacy = await ctx.db
        .query("coinglassTakerBuySellExchangeListSnapshots")
        .withIndex("by_symbol_and_range", (q) =>
          q.eq("symbol", args.symbol).eq("range", args.range),
        )
        .first();
      // Only adopt a row that is unowned or already owned by this coin —
      // a row owned by a ticker twin must not be stolen.
      if (
        legacy &&
        (legacy.coingeckoId === undefined ||
          legacy.coingeckoId === args.coingeckoId)
      ) {
        existing = legacy;
      }
    }

    const next = {
      overall: args.snapshot.overall,
      exchanges: args.snapshot.exchanges,
      dataSource: args.dataSource,
      lastUpdated: now,
      ...(args.coingeckoId ? { coingeckoId: args.coingeckoId } : {}),
    };

    if (existing) {
      await ctx.db.patch(existing._id, next);
      return { wrote: true };
    }

    await ctx.db.insert("coinglassTakerBuySellExchangeListSnapshots", {
      symbol: args.symbol,
      range: args.range,
      ...next,
    });

    return { wrote: true };
  },
});
