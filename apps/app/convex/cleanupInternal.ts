import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Expired apiCache rows only. Historical/series retention lives in
// convex/retention.ts (windowed per timeframe, batched delete chains).
export const _cleanupExpiredApiCache = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    deletedCache: v.number(),
    hasMore: v.boolean(),
    batchSize: v.number(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const oldCacheData = await ctx.db
      .query("apiCache")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(batchSize);

    await Promise.all(oldCacheData.map((item) => ctx.db.delete(item._id)));

    return {
      success: true,
      deletedCache: oldCacheData.length,
      hasMore: oldCacheData.length === batchSize,
      batchSize,
    };
  },
});

export const _compactPriceHistoryDuplicatesBatch = internalMutation({
  args: {
    coingeckoId: v.string(),
    timeframe: v.string(),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    kept: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(5000, Math.max(100, args.batchSize ?? 2000));

    const rows = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe_timestamp", (q) =>
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe),
      )
      .order("desc")
      .take(batchSize);

    if (rows.length === 0) {
      return { scanned: 0, deleted: 0, kept: 0, hasMore: false };
    }

    const seen = new Set<number>();
    const toDelete: Array<(typeof rows)[number]["_id"]> = [];
    for (const row of rows) {
      if (seen.has(row.timestamp)) {
        toDelete.push(row._id);
        continue;
      }
      seen.add(row.timestamp);
    }

    if (toDelete.length > 0) {
      await Promise.all(toDelete.map((id) => ctx.db.delete(id)));
    }

    return {
      scanned: rows.length,
      deleted: toDelete.length,
      kept: rows.length - toDelete.length,
      hasMore: toDelete.length > 0 || rows.length === batchSize,
    };
  },
});

export const _cleanupOldLastKnownPrices = internalMutation({
  args: {
    olderThanHours: v.number(),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    deletedLastKnown: v.number(),
    hasMore: v.boolean(),
    batchSize: v.number(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const cutoffTime = Date.now() - args.olderThanHours * 60 * 60 * 1000;

    const oldLastKnown = await ctx.db
      .query("lastKnownPrices")
      .withIndex("by_updated_at", (q) => q.lt("updatedAt", cutoffTime))
      .take(batchSize);

    await Promise.all(oldLastKnown.map((row) => ctx.db.delete(row._id)));

    return {
      success: true,
      deletedLastKnown: oldLastKnown.length,
      hasMore: oldLastKnown.length === batchSize,
      batchSize,
    };
  },
});

