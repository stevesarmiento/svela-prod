import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const _cleanupOldData = internalMutation({
  args: {
    olderThanDays: v.number(),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    deletedHistorical: v.number(),
    deletedCache: v.number(),
    hasMore: v.boolean(),
    batchSize: v.number(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const cutoffTime = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;

    const [oldHistoricalData, oldCacheData] = await Promise.all([
      ctx.db
        .query("priceHistory")
        .withIndex("by_last_updated", (q) => q.lt("lastUpdated", cutoffTime))
        .take(batchSize),
      ctx.db
        .query("apiCache")
        .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
        .take(batchSize),
    ]);

    await Promise.all([
      ...oldHistoricalData.map((item) => ctx.db.delete(item._id)),
      ...oldCacheData.map((item) => ctx.db.delete(item._id)),
    ]);

    return {
      success: true,
      deletedHistorical: oldHistoricalData.length,
      deletedCache: oldCacheData.length,
      hasMore:
        oldHistoricalData.length === batchSize || oldCacheData.length === batchSize,
      batchSize,
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

