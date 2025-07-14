import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Legacy CoinMarketCap search - deprecated, use searchCoinGeckoCoins instead
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

// CoinGecko coins search with improved relevance ranking
export const searchCoinGeckoCoins = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase();
    const limit = args.limit || 20;

    const allCoins = await ctx.db.query("coingeckoCoins").collect();

    // Categorize matches by relevance
    const exactIdMatches: typeof allCoins = [];
    const exactSymbolMatches: typeof allCoins = [];
    const exactNameMatches: typeof allCoins = [];
    const partialMatches: typeof allCoins = [];

    allCoins.forEach(coin => {
      const coinId = coin.coingeckoId.toLowerCase();
      const symbol = coin.symbol.toLowerCase();
      const name = coin.name.toLowerCase();

      // Prioritize exact ID matches (e.g., "bitcoin" -> coingeckoId "bitcoin")
      if (coinId === searchTerm) {
        exactIdMatches.push(coin);
      }
      // Then exact symbol matches (e.g., "btc" -> symbol "BTC")
      else if (symbol === searchTerm) {
        exactSymbolMatches.push(coin);
      }
      // Then exact name matches (e.g., "bitcoin" -> name "Bitcoin")
      else if (name === searchTerm) {
        exactNameMatches.push(coin);
      }
      // Finally partial matches (e.g., "bitcoin" matches "Bitcoin Dogs")
      else if (name.includes(searchTerm) || symbol.includes(searchTerm) || coinId.includes(searchTerm)) {
        partialMatches.push(coin);
      }
    });

    // Combine results in order of relevance and limit
    const orderedResults = [
      ...exactIdMatches,
      ...exactSymbolMatches, 
      ...exactNameMatches,
      ...partialMatches
    ].slice(0, limit);

    // Log the search for debugging
    console.log('🔍 CoinGecko search results for:', searchTerm, {
      exactIdMatches: exactIdMatches.length,
      exactSymbolMatches: exactSymbolMatches.length,
      exactNameMatches: exactNameMatches.length,
      partialMatches: partialMatches.length,
      totalReturned: orderedResults.length,
      firstResult: orderedResults[0] ? {
        name: orderedResults[0].name,
        symbol: orderedResults[0].symbol,
        coingeckoId: orderedResults[0].coingeckoId
      } : null
    });

    return orderedResults;
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
    lastUpdated: v.optional(v.number()),
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

// CoinGecko bulk upsert
export const bulkUpsertCoinGeckoCoins = mutation({
  args: { coins: v.array(v.object({
    coingeckoId: v.string(),
    name: v.string(),
    symbol: v.string(),
    logoUrl: v.string(),
    isActive: v.boolean(),
    platforms: v.optional(v.record(v.string(), v.string())),
    imageUpdated: v.optional(v.boolean()), // Track if image was updated
  }))},
  handler: async (ctx, args) => {
    const existingCoins = await ctx.db.query("coingeckoCoins").collect();
    const existingIds = new Set(existingCoins.map(coin => coin.coingeckoId));
    
    for (const coin of args.coins) {
      if (existingIds.has(coin.coingeckoId)) {
        const existing = existingCoins.find(c => c.coingeckoId === coin.coingeckoId);
        if (existing) {
          await ctx.db.patch(existing._id, {
            ...coin,
            lastUpdated: Date.now(),
          });
        }
      } else {
        await ctx.db.insert("coingeckoCoins", {
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

// CoinGecko queries
export const getCoinGeckoCoinById = query({
  args: { coingeckoId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("coingeckoCoins")
      .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", args.coingeckoId))
      .first();
  },
});

export const getCoinGeckoCoinsBySymbol = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("coingeckoCoins")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol.toUpperCase()))
      .collect();
  },
});

export const getAllCoinGeckoCoins = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    return await ctx.db
      .query("coingeckoCoins")
      .take(limit);
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

// Add this query to get top CoinGecko coins
export const getTopCoinGeckoCoins = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 25;

    // Just get coins from database - let API handle the market cap sorting
    // We'll get more than needed and let the API filter to top coins
    const coins = await ctx.db
      .query("coingeckoCoins")
      .order("asc")
      .take(limit * 3); // Get 3x limit to have options for API to choose from

    // Basic filtering - just remove obvious junk, but keep it simple
    const filteredCoins = coins.filter((coin) => {
      return coin.coingeckoId.length > 1 && 
             coin.name.length > 1 &&
             coin.symbol.length >= 1 &&
             coin.symbol.length <= 10;
    });

    return filteredCoins.slice(0, limit * 2); // Return 2x limit for API to choose best ones
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

// Legacy CoinMarketCap metadata functions - removed as coinMetadata table has been removed
// Use CoinGecko metadata functions instead

// CoinGlass supported coins mutations and queries
export const bulkUpsertCoinglassSupportedCoins = mutation({
  args: { symbols: v.array(v.string()) },
  handler: async (ctx, args) => {
    const existingSupportedCoins = await ctx.db.query("coinglassSupportedCoins").collect();
    const existingSymbols = new Set(existingSupportedCoins.map(coin => coin.symbol));
    
    // Mark all existing coins as inactive first
    for (const existing of existingSupportedCoins) {
      await ctx.db.patch(existing._id, {
        isActive: false,
        lastUpdated: Date.now(),
      });
    }
    
    // Process new/updated symbols
    for (const symbol of args.symbols) {
      if (existingSymbols.has(symbol)) {
        // Reactivate existing symbol
        const existing = existingSupportedCoins.find(c => c.symbol === symbol);
        if (existing) {
          await ctx.db.patch(existing._id, {
            isActive: true,
            lastUpdated: Date.now(),
          });
        }
      } else {
        // Insert new supported coin
        await ctx.db.insert("coinglassSupportedCoins", {
          symbol,
          isActive: true,
          lastUpdated: Date.now(),
        });
      }
    }
  },
});

export const getCoinglassSupportedCoins = query({
  args: { onlyActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const onlyActive = args.onlyActive ?? true;
    
    if (onlyActive) {
      return await ctx.db
        .query("coinglassSupportedCoins")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    
    return await ctx.db.query("coinglassSupportedCoins").collect();
  },
});

export const isCoinglassSupported = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    const supportedCoin = await ctx.db
      .query("coinglassSupportedCoins")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol.toUpperCase()))
      .first();
    
    return supportedCoin?.isActive ?? false;
  },
});

export const getCoinglassSupportedSymbols = query({
  args: {},
  handler: async (ctx) => {
    const supportedCoins = await ctx.db
      .query("coinglassSupportedCoins")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    return supportedCoins.map(coin => coin.symbol);
  },
});

// Enhanced CoinGlass symbol lookup with fallback strategies
export const getCoinglassSymbolByCoinId = query({
  args: { coinId: v.number() },
  handler: async (ctx, args) => {
    // First get the coin data
    const coin = await ctx.db
      .query("coins")
      .filter((q) => q.eq(q.field("coinId"), args.coinId))
      .first();
    
    if (!coin) {
      return null;
    }
    
    // Try multiple symbol variations to find a supported one
    const symbolsToTry = [
      coin.symbol.toUpperCase(),
      // Common variations
      coin.symbol.replace(/USD$/, '').toUpperCase(),
    ].filter(Boolean) as string[];
    
    // Remove duplicates
    const uniqueSymbols = [...new Set(symbolsToTry)];
    
    // Check each symbol variation for CoinGlass support
    for (const symbolToCheck of uniqueSymbols) {
      const isSupported = await ctx.db
        .query("coinglassSupportedCoins")
        .withIndex("by_symbol", (q) => q.eq("symbol", symbolToCheck))
        .first();
      
      if (isSupported?.isActive) {
        return {
          symbol: symbolToCheck,
          name: coin.name,
          coinId: args.coinId,
          isSupported: true,
          originalSymbol: coin.symbol,
        };
      }
    }
    
    return null;
  },
});

// Get coin info by symbol for reverse lookup
export const getCoinBySymbol = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    const symbolUpper = args.symbol.toUpperCase();
    
    // Try to find in coins table first
    const coin = await ctx.db
      .query("coins")
      .filter((q) => q.eq(q.field("symbol"), symbolUpper))
      .first();
    
    if (coin) {
      return coin;
    }
    
    // No coin found
    return null;
  },
});

// Get all coins that are supported by CoinGlass
export const getCoinglassSupportedCoinsList = query({
  args: {},
  handler: async (ctx) => {
    const supportedSymbols = await ctx.db
      .query("coinglassSupportedCoins")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    const symbolSet = new Set(supportedSymbols.map(s => s.symbol));
    
    // Get coins that match these symbols
    const allCoins = await ctx.db.query("coins").collect();
    const supportedCoins = allCoins.filter(coin => 
      symbolSet.has(coin.symbol.toUpperCase())
    );
    
    return supportedCoins;
  },
});

// Get coins that need image updates (incremental processing)
export const getCoinsNeedingImageUpdates = query({
  args: { 
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()) // _id for cursor-based pagination
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 1000;

    let query = ctx.db
      .query("coingeckoCoins")
      .withIndex("by_image_updated")
      .filter((q) => q.neq(q.field("imageUpdated"), true)); // Get coins where imageUpdated is not true

    // Apply cursor if provided
    if (args.cursor) {
      const cursor = args.cursor;
      query = query.filter((q) => q.gt(q.field("_id"), cursor));
    }

    const coins = await query.take(limit);
    
    return {
      coins,
      nextCursor: coins.length === limit ? coins[coins.length - 1]?._id : null,
      hasMore: coins.length === limit
    };
  },
});