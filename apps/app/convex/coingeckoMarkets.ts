import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireServerToken } from "./_lib/server_token"

const coingeckoMarketValidator = v.object({
  _id: v.id("coingeckoMarkets"),
  _creationTime: v.number(),
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
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const upsertMarketData = mutation({
  args: {
    serverToken: v.string(),
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
  returns: v.id("coingeckoMarkets"),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken)
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
    }
      // Create new record
      const id = await ctx.db.insert("coingeckoMarkets", {
        ...args,
        createdAt: now,
        updatedAt: now,
      })
      return id
  },
})

export const upsertMarketDataBatch = mutation({
  args: {
    serverToken: v.string(),
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
    requireServerToken(args.serverToken)
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
  args: { serverToken: v.string(), coingeckoId: v.string() },
  returns: v.union(coingeckoMarketValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken)
    return await ctx.db
      .query("coingeckoMarkets")
      .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", args.coingeckoId))
      .first()
  },
})

export const getTopMarketDataByRank = query({
  args: { serverToken: v.string(), limit: v.optional(v.number()) },
  returns: v.array(coingeckoMarketValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken)
    const limit = args.limit ?? 100
    return await ctx.db
      .query("coingeckoMarkets")
      .withIndex("by_market_cap_rank", (q) => q.gte("marketCapRank", 1))
      .order("asc")
      .take(limit)
  },
}) 