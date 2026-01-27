import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const upsertMarketData = mutation({
  args: {
    coingeckoId: v.string(),
    symbol: v.string(),
    name: v.string(),
    image: v.string(),
    currentPrice: v.optional(v.number()),
    marketCap: v.optional(v.number()),
    marketCapRank: v.optional(v.number()),
    fullyDilutedValuation: v.optional(v.number()),
    totalVolume: v.optional(v.number()),
    high24h: v.optional(v.number()),
    low24h: v.optional(v.number()),
    priceChange24h: v.optional(v.number()),
    priceChangePercentage24h: v.optional(v.number()),
    marketCapChange24h: v.optional(v.number()),
    marketCapChangePercentage24h: v.optional(v.number()),
    circulatingSupply: v.optional(v.number()),
    totalSupply: v.optional(v.number()),
    maxSupply: v.optional(v.number()),
    ath: v.optional(v.number()),
    athChangePercentage: v.optional(v.number()),
    athDate: v.optional(v.string()),
    atl: v.optional(v.number()),
    atlChangePercentage: v.optional(v.number()),
    atlDate: v.optional(v.string()),
    lastUpdated: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if record already exists
    const existing = await ctx.db
      .query("coingeckoMarkets")
      .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", args.coingeckoId))
      .first()

    const now = Date.now()

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      })
      return existing._id
    } else {
      // Create new record
      const id = await ctx.db.insert("coingeckoMarkets", {
        ...args,
        createdAt: now,
        updatedAt: now,
      })
      return id
    }
  },
})

export const upsertMarketDataBatch = mutation({
  args: {
    items: v.array(
      v.object({
        coingeckoId: v.string(),
        symbol: v.string(),
        name: v.string(),
        image: v.string(),
        currentPrice: v.optional(v.number()),
        marketCap: v.optional(v.number()),
        marketCapRank: v.optional(v.number()),
        fullyDilutedValuation: v.optional(v.number()),
        totalVolume: v.optional(v.number()),
        high24h: v.optional(v.number()),
        low24h: v.optional(v.number()),
        priceChange24h: v.optional(v.number()),
        priceChangePercentage24h: v.optional(v.number()),
        marketCapChange24h: v.optional(v.number()),
        marketCapChangePercentage24h: v.optional(v.number()),
        circulatingSupply: v.optional(v.number()),
        totalSupply: v.optional(v.number()),
        maxSupply: v.optional(v.number()),
        ath: v.optional(v.number()),
        athChangePercentage: v.optional(v.number()),
        athDate: v.optional(v.string()),
        atl: v.optional(v.number()),
        atlChangePercentage: v.optional(v.number()),
        atlDate: v.optional(v.string()),
        lastUpdated: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now()

    for (const item of args.items) {
      const existing = await ctx.db
        .query("coingeckoMarkets")
        .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", item.coingeckoId))
        .first()

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...item,
          updatedAt: now,
        })
        continue
      }

      await ctx.db.insert("coingeckoMarkets", {
        ...item,
        createdAt: now,
        updatedAt: now,
      })
    }

    return null
  },
})

export const getMarketDataByCoingeckoId = query({
  args: { coingeckoId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("coingeckoMarkets")
      .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", args.coingeckoId))
      .first()
  },
})

export const getTopMarketDataByRank = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100
    return await ctx.db
      .query("coingeckoMarkets")
      .withIndex("by_market_cap_rank")
      .order("asc")
      .take(limit)
  },
}) 