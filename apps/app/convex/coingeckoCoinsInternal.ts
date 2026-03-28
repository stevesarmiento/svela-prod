import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const coinRowValidator = v.object({
  _id: v.id("coingeckoCoins"),
  _creationTime: v.number(),
  coingeckoId: v.string(),
  name: v.string(),
  symbol: v.string(),
  logoUrl: v.string(),
  isActive: v.boolean(),
  lastUpdated: v.number(),
  platforms: v.optional(v.record(v.string(), v.string())),
  imageUpdated: v.optional(v.boolean()),
});

export const _getCoinGeckoCoinsByIds = internalQuery({
  args: { ids: v.array(v.string()) },
  returns: v.array(coinRowValidator),
  handler: async (ctx, args) => {
    if (args.ids.length === 0) return [];

    const results = await Promise.all(
      args.ids.map(async (id) => {
        return await ctx.db
          .query("coingeckoCoins")
          .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", id))
          .first();
      }),
    );

    return results.filter((row) => row !== null);
  },
});

export const _getCoinsNeedingImageUpdates = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(coinRowValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    return await ctx.db
      .query("coingeckoCoins")
      .withIndex("by_image_updated", (q) => q.eq("imageUpdated", false))
      .take(limit);
  },
});

