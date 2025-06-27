import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const searchCoins = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase();
    const limit = args.limit || 20;

    // Get ALL coins for comprehensive search
    const allCoins = await ctx.db.query("coins").collect();

    // Filter in memory for substring matching
    const filtered = allCoins
      .filter(coin => 
        coin.name.toLowerCase().includes(searchTerm) ||
        coin.symbol.toLowerCase().includes(searchTerm)
      )
      .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999))
      .slice(0, limit);

    return filtered;
  },
});

// More efficient bulk upsert
export const bulkUpsertCoins = mutation({
  args: { coins: v.array(v.object({
    coinId: v.number(),
    name: v.string(),
    symbol: v.string(),
    rank: v.optional(v.number()),
    logoUrl: v.string(),
    isActive: v.boolean(),
  }))},
  handler: async (ctx, args) => {
    // Get all existing coin IDs in one query
    const existingCoins = await ctx.db
      .query("coins")
      .collect();
    
    const existingCoinIds = new Set(existingCoins.map(coin => coin.coinId));
    
    // Process each coin
    for (const coin of args.coins) {
      if (existingCoinIds.has(coin.coinId)) {
        // Find and update existing coin
        const existing = existingCoins.find(c => c.coinId === coin.coinId);
        if (existing) {
          await ctx.db.patch(existing._id, {
            ...coin,
            lastUpdated: Date.now(),
          });
        }
      } else {
        // Insert new coin
        await ctx.db.insert("coins", {
          ...coin,
          lastUpdated: Date.now(),
        });
      }
    }
  },
});

// Add this new mutation for bulk inserts
export const bulkInsertNewCoins = mutation({
  args: { coins: v.array(v.object({
    coinId: v.number(),
    name: v.string(),
    symbol: v.string(),
    rank: v.optional(v.number()),
    logoUrl: v.string(),
    isActive: v.boolean(),
  }))},
  handler: async (ctx, args) => {
    // Just insert - don't check for existing (much faster)
    for (const coin of args.coins) {
      try {
        await ctx.db.insert("coins", {
          ...coin,
          lastUpdated: Date.now(),
        });
      } catch {
        // Skip if already exists (duplicate coinId)
        console.log(`Skipping coin ${coin.coinId} - already exists`);
      }
    }
  },
});

// Add this query to get top coins by rank
export const getTopCoins = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 25;

    // Just return first coins ordered by coinId (lower ID = earlier/more popular)
    const coins = await ctx.db
      .query("coins")
      .order("asc")
      .take(limit);

    return coins;
  },
});

export const getCoinsByIds = query({
  args: { coinIds: v.array(v.number()) },
  handler: async (ctx, args) => {
    if (!args.coinIds.length) return [];

    const coins = await ctx.db.query("coins").collect();
    
    // Filter coins by the requested IDs and maintain order
    const coinMap = new Map(coins.map(coin => [coin.coinId, coin]));
    const orderedCoins = args.coinIds
      .map(id => coinMap.get(id))
      .filter(coin => coin !== undefined);

    return orderedCoins;
  },
});

export const getCoinById = query({
  args: { coinId: v.number() },
  handler: async (ctx, args) => {
    const coins = await ctx.db.query("coins").collect();
    return coins.find(coin => coin.coinId === args.coinId) || null;
  },
});

export const getCoinByIdString = query({
  args: { coinId: v.string() },
  handler: async (ctx, args) => {
    const id = parseInt(args.coinId);
    if (isNaN(id)) return null;
    
    const coins = await ctx.db.query("coins").collect();
    return coins.find(coin => coin.coinId === id) || null;
  },
});

export const bulkUpsertMetadata = mutation({
  args: { 
    metadata: v.array(v.object({
      coinId: v.number(),
      slug: v.string(),
      name: v.string(),
      symbol: v.string(),
      description: v.optional(v.string()),
      logo: v.string(),
      dateAdded: v.optional(v.string()),
      dateLaunched: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      category: v.optional(v.string()),
      platform: v.optional(v.object({
        id: v.number(),
        name: v.string(),
        symbol: v.string(),
        slug: v.string(),
        token_address: v.string(),
      })),
      urls: v.optional(v.object({
        website: v.optional(v.array(v.string())),
        technical_doc: v.optional(v.array(v.string())),
        twitter: v.optional(v.array(v.string())),
        reddit: v.optional(v.array(v.string())),
        message_board: v.optional(v.array(v.string())),
        announcement: v.optional(v.array(v.string())),
        chat: v.optional(v.array(v.string())),
        explorer: v.optional(v.array(v.string())),
        source_code: v.optional(v.array(v.string())),
      })),
    }))
  },
  handler: async (ctx, args) => {
    const existingMetadata = await ctx.db.query("coinMetadata").collect();
    const existingIds = new Set(existingMetadata.map(m => m.coinId));
    
    for (const meta of args.metadata) {
      if (existingIds.has(meta.coinId)) {
        const existing = existingMetadata.find(m => m.coinId === meta.coinId);
        if (existing) {
          await ctx.db.patch(existing._id, {
            ...meta,
            lastUpdated: Date.now(),
          });
        }
      } else {
        await ctx.db.insert("coinMetadata", {
          ...meta,
          lastUpdated: Date.now(),
        });
      }
    }
  },
});

export const getMetadataByCoinId = query({
  args: { coinId: v.number() },
  handler: async (ctx, args) => {
    const metadata = await ctx.db
      .query("coinMetadata")
      .withIndex("by_coin_id", (q) => q.eq("coinId", args.coinId))
      .first();
    return metadata;
  },
});

export const getMetadataBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const metadata = await ctx.db
      .query("coinMetadata")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    return metadata;
  },
});