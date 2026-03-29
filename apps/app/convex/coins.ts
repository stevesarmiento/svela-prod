import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireServerToken } from "./_lib/server_token";
import { paginationOptsValidator } from "convex/server";

const coinValidator = v.object({
  _id: v.id("coins"),
  _creationTime: v.number(),
  coinId: v.number(),
  name: v.string(),
  symbol: v.string(),
  rank: v.optional(v.number()),
  logoUrl: v.string(),
  isActive: v.boolean(),
  lastUpdated: v.number(),
});

const coingeckoCoinValidator = v.object({
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

const coinglassSupportedCoinValidator = v.object({
  _id: v.id("coinglassSupportedCoins"),
  _creationTime: v.number(),
  symbol: v.string(),
  isActive: v.boolean(),
  lastUpdated: v.number(),
});

// Legacy CoinMarketCap search - deprecated, use searchCoinGeckoCoins instead
export const searchCoins = query({
  args: { serverToken: v.string(), query: v.string(), limit: v.optional(v.number()) },
  returns: v.array(coinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
  args: { serverToken: v.string(), query: v.string(), limit: v.optional(v.number()) },
  returns: v.array(coingeckoCoinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const limit = args.limit || 20;
    const rawQuery = args.query.trim();
    if (!rawQuery) return [];

    const searchLower = rawQuery.toLowerCase();
    const symbolUpper = rawQuery.toUpperCase();
    const takeLimit = Math.min(200, limit * 10);

    const [exactId, exactSymbol, idMatches, symbolMatches, nameMatches] =
      await Promise.all([
        ctx.db
          .query("coingeckoCoins")
          .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", searchLower))
          .first(),
        ctx.db
          .query("coingeckoCoins")
          .withIndex("by_symbol", (q) => q.eq("symbol", symbolUpper))
          .take(takeLimit),
        ctx.db
          .query("coingeckoCoins")
          .withSearchIndex("search_coingecko_id", (q) =>
            q.search("coingeckoId", rawQuery),
          )
          .take(takeLimit),
        ctx.db
          .query("coingeckoCoins")
          .withSearchIndex("search_symbol", (q) => q.search("symbol", rawQuery))
          .take(takeLimit),
        ctx.db
          .query("coingeckoCoins")
          .withSearchIndex("search_name", (q) => q.search("name", rawQuery))
          .take(takeLimit),
      ]);

    const candidates = [
      ...(exactId ? [exactId] : []),
      ...exactSymbol,
      ...idMatches,
      ...symbolMatches,
      ...nameMatches,
    ];

    const seen = new Set<string>();
    const exactIdMatches: Array<(typeof candidates)[number]> = [];
    const exactSymbolMatches: Array<(typeof candidates)[number]> = [];
    const exactNameMatches: Array<(typeof candidates)[number]> = [];
    const partialMatches: Array<(typeof candidates)[number]> = [];

    for (const coin of candidates) {
      if (seen.has(coin.coingeckoId)) continue;
      seen.add(coin.coingeckoId);

      const coinId = coin.coingeckoId.toLowerCase();
      const symbol = coin.symbol.toUpperCase();
      const name = coin.name.toLowerCase();

      if (coinId === searchLower) exactIdMatches.push(coin);
      else if (symbol === symbolUpper) exactSymbolMatches.push(coin);
      else if (name === searchLower) exactNameMatches.push(coin);
      else partialMatches.push(coin);

      if (seen.size >= takeLimit) break;
    }

    return [
      ...exactIdMatches,
      ...exactSymbolMatches,
      ...exactNameMatches,
      ...partialMatches,
    ].slice(0, limit);
  },
});

// More efficient bulk upsert
export const bulkUpsertCoins = mutation({
  args: { serverToken: v.string(), coins: v.array(v.object({
    coinId: v.number(),
    name: v.string(),
    symbol: v.string(),
    rank: v.optional(v.number()),
    logoUrl: v.string(),
    isActive: v.boolean(),
    lastUpdated: v.optional(v.number()),
  }))},
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
    return null;
  },
});

// CoinGecko bulk upsert
export const bulkUpsertCoinGeckoCoins = mutation({
  args: { serverToken: v.string(), coins: v.array(v.object({
    coingeckoId: v.string(),
    name: v.string(),
    symbol: v.string(),
    logoUrl: v.string(),
    isActive: v.boolean(),
    platforms: v.optional(v.record(v.string(), v.string())),
    imageUpdated: v.optional(v.boolean()), // Track if image was updated
  }))},
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();

    // Dedupe within the request (idempotent under retries).
    const uniqueById = new Map<string, (typeof args.coins)[number]>();
    for (const coin of args.coins) uniqueById.set(coin.coingeckoId, coin);

    // Upsert using the `by_coingecko_id` index (works at any table size).
    for (const coin of uniqueById.values()) {
      const existing = await ctx.db
        .query("coingeckoCoins")
        .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", coin.coingeckoId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...coin,
          lastUpdated: now,
        });
        continue;
      }

      await ctx.db.insert("coingeckoCoins", {
        ...coin,
        lastUpdated: now,
      });
    }
    return null;
  },
});

// Add this new mutation for bulk inserts
export const bulkInsertNewCoins = mutation({
  args: { serverToken: v.string(), coins: v.array(v.object({
    coinId: v.number(),
    name: v.string(),
    symbol: v.string(),
    rank: v.optional(v.number()),
    logoUrl: v.string(),
    isActive: v.boolean(),
  }))},
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();

    // Dedupe within the request first.
    const uniqueByCoinId = new Map<number, (typeof args.coins)[number]>();
    for (const coin of args.coins) {
      if (!uniqueByCoinId.has(coin.coinId)) uniqueByCoinId.set(coin.coinId, coin);
    }

    // Idempotent insert using the `by_coin_id` index (safe under retries).
    for (const coin of uniqueByCoinId.values()) {
      const existing = await ctx.db
        .query("coins")
        .withIndex("by_coin_id", (q) => q.eq("coinId", coin.coinId))
        .first();

      if (existing) continue;

      await ctx.db.insert("coins", {
        ...coin,
        lastUpdated: now,
      });
    }
    return null;
  },
});

// CoinGecko queries
export const getCoinGeckoCoinById = query({
  args: { serverToken: v.string(), coingeckoId: v.string() },
  returns: v.union(coingeckoCoinValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    return await ctx.db
      .query("coingeckoCoins")
      .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", args.coingeckoId))
      .first();
  },
});

export const getCoinGeckoCoinsBySymbol = query({
  args: { serverToken: v.string(), symbol: v.string() },
  returns: v.array(coingeckoCoinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    return await ctx.db
      .query("coingeckoCoins")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol.toUpperCase()))
      .collect();
  },
});

export const getAllCoinGeckoCoins = query({
  args: { serverToken: v.string(), limit: v.optional(v.number()) },
  returns: v.array(coingeckoCoinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const limit = args.limit || 100;
    return await ctx.db
      .query("coingeckoCoins")
      .take(limit);
  },
});

// Add this query to get top coins by rank
export const getTopCoins = query({
  args: { serverToken: v.string(), limit: v.optional(v.number()) },
  returns: v.array(coinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
  args: { serverToken: v.string(), limit: v.optional(v.number()) },
  returns: v.array(coingeckoCoinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
  args: { serverToken: v.string(), coinIds: v.array(v.number()) },
  returns: v.array(coinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    if (!args.coinIds.length) return [];

    const results = await Promise.all(
      args.coinIds.map(async (coinId) => {
        const coin = await ctx.db
          .query("coins")
          .withIndex("by_coin_id", (q) => q.eq("coinId", coinId))
          .first();
        return coin ?? null;
      }),
    );

    return results.filter((coin) => coin !== null);
  },
});

export const getCoinById = query({
  args: { serverToken: v.string(), coinId: v.number() },
  returns: v.union(coinValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    return (
      (await ctx.db
        .query("coins")
        .withIndex("by_coin_id", (q) => q.eq("coinId", args.coinId))
        .first()) ?? null
    );
  },
});

export const getCoinByIdString = query({
  args: { serverToken: v.string(), coinId: v.string() },
  returns: v.union(coinValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const id = Number.parseInt(args.coinId);
    if (Number.isNaN(id)) return null;

    return (
      (await ctx.db
        .query("coins")
        .withIndex("by_coin_id", (q) => q.eq("coinId", id))
        .first()) ?? null
    );
  },
});

// Legacy CoinMarketCap metadata functions - removed as coinMetadata table has been removed
// Use CoinGecko metadata functions instead

// CoinGlass supported coins mutations and queries
export const bulkUpsertCoinglassSupportedCoins = mutation({
  args: { serverToken: v.string(), symbols: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
    return null;
  },
});

export const getCoinglassSupportedCoins = query({
  args: { serverToken: v.string(), onlyActive: v.optional(v.boolean()) },
  returns: v.array(coinglassSupportedCoinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
  args: { serverToken: v.string(), symbol: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const supportedCoin = await ctx.db
      .query("coinglassSupportedCoins")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol.toUpperCase()))
      .first();
    
    return supportedCoin?.isActive ?? false;
  },
});

export const getCoinglassSupportedSymbols = query({
  args: { serverToken: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const supportedCoins = await ctx.db
      .query("coinglassSupportedCoins")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    return supportedCoins.map(coin => coin.symbol);
  },
});

// Enhanced CoinGlass symbol lookup with fallback strategies
export const getCoinglassSymbolByCoinId = query({
  args: { serverToken: v.string(), coinId: v.number() },
  returns: v.union(
    v.object({
      symbol: v.string(),
      name: v.string(),
      coinId: v.number(),
      isSupported: v.boolean(),
      originalSymbol: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    // First get the coin data
    const coin = await ctx.db
      .query("coins")
      .withIndex("by_coin_id", (q) => q.eq("coinId", args.coinId))
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
  args: { serverToken: v.string(), symbol: v.string() },
  returns: v.union(coinValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const symbolUpper = args.symbol.toUpperCase();
    
    // Try to find in coins table first
    const coin = await ctx.db
      .query("coins")
      .withIndex("by_symbol", (q) => q.eq("symbol", symbolUpper))
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
  args: { serverToken: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const supportedSymbols = await ctx.db
      .query("coinglassSupportedCoins")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    return supportedSymbols.map((s) => s.symbol);
  },
});

// Get coins that need image updates (incremental processing)
export const getCoinsNeedingImageUpdates = query({
  args: { 
    serverToken: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(coingeckoCoinValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    return await ctx.db
      .query("coingeckoCoins")
      .withIndex("by_image_updated", (q) => q.eq("imageUpdated", false))
      .order("asc")
      .paginate(args.paginationOpts);
  },
});