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