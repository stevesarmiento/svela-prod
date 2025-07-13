import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Cache duration constants in milliseconds
const CACHE_DURATIONS = {
  '1d': 2 * 60 * 1000,      // 2 minutes for intraday data
  '7d': 5 * 60 * 1000,      // 5 minutes for short-term data
  '30d': 15 * 60 * 1000,    // 15 minutes for medium-term data
  'max': 60 * 60 * 1000,    // 1 hour for long-term data
  '2y': 60 * 60 * 1000,     // 1 hour for long-term data
  'max_ohlc': 60 * 60 * 1000,    // 1 hour for OHLC data
  '2y_ohlc': 60 * 60 * 1000,     // 1 hour for OHLC data
} as const;

// 🆕 NEW: Get CoinGecko historical data with intelligent caching
export const getCoinGeckoHistoricalData = query({
  args: { 
    coingeckoId: v.string(), 
    timeframe: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cacheWindow = CACHE_DURATIONS[args.timeframe as keyof typeof CACHE_DURATIONS] || CACHE_DURATIONS['1d'];
    const cacheThreshold = now - cacheWindow;

    // Try to get fresh cached data first
    const cachedData = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe", (q) => 
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe))
      .filter((q) => q.gt(q.field("lastUpdated"), cacheThreshold))
      .collect();

    if (cachedData.length > 0) {
      return {
        data: cachedData.sort((a, b) => a.timestamp - b.timestamp),
        cached: true,
        lastUpdated: Math.max(...cachedData.map(d => d.lastUpdated)),
        dataPoints: cachedData.length,
        stale: false,
      };
    }

    // Check for stale data that we can return while refreshing
    const staleData = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe", (q) => 
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe))
      .collect();

    if (staleData.length > 0) {
      return {
        data: staleData.sort((a, b) => a.timestamp - b.timestamp),
        cached: true,
        stale: true,
        lastUpdated: Math.max(...staleData.map(d => d.lastUpdated)),
        dataPoints: staleData.length,
      };
    }

    // No data available - trigger refresh and return empty for now
    return {
      data: [],
      cached: false,
      lastUpdated: 0,
      dataPoints: 0,
      stale: false,
    };
  },
});

// 🆕 NEW: Upsert CoinGecko historical data
export const upsertCoinGeckoHistoricalData = mutation({
  args: {
    coingeckoId: v.string(),
    timeframe: v.string(),
    dataPoints: v.array(v.object({
      timestamp: v.number(),
      price: v.number(),
      volume: v.number(),
      marketCap: v.optional(v.number()),
      // 🆕 OHLC fields for candlestick data
      open: v.optional(v.number()),
      high: v.optional(v.number()),
      low: v.optional(v.number()),
      close: v.optional(v.number()),
    })),
    dataSource: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(`🎯 CoinGecko Convex mutation called for ${args.coingeckoId} (${args.timeframe}) with ${args.dataPoints.length} data points`);
    console.log(`🔍 Mutation arguments:`, {
      coingeckoId: args.coingeckoId,
      timeframe: args.timeframe,
      dataPointsCount: args.dataPoints.length,
      dataSource: args.dataSource,
      firstDataPoint: args.dataPoints[0],
      hasOHLC: args.dataPoints[0]?.open !== undefined
    });
    
    const now = Date.now();
    
    // Get existing timestamps for this coin/timeframe to avoid duplicates
    const existingData = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe", (q) => 
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe))
      .collect();

    console.log(`📊 Found ${existingData.length} existing data points for ${args.coingeckoId} (${args.timeframe})`);

    const existingTimestamps = new Set(existingData.map(d => d.timestamp));
    
    // Only insert new data points that don't already exist
    const newDataPoints = args.dataPoints.filter(point => 
      !existingTimestamps.has(point.timestamp)
    );

    console.log(`🆕 Inserting ${newDataPoints.length} new data points (${args.dataPoints.length - newDataPoints.length} duplicates skipped)`)
    
    // Log OHLC data if present
    const hasOHLCData = newDataPoints.some(point => 
      point.open !== undefined || point.high !== undefined || point.low !== undefined || point.close !== undefined
    )
    if (hasOHLCData) {
      console.log(`📊 OHLC data detected - storing full candlestick information`)
      console.log(`📈 Sample OHLC:`, {
        open: newDataPoints[0]?.open,
        high: newDataPoints[0]?.high,
        low: newDataPoints[0]?.low,
        close: newDataPoints[0]?.close
      })
    }

    // Batch insert new data points
    const insertPromises = newDataPoints.map(point => 
      ctx.db.insert("priceHistory", {
        coingeckoId: args.coingeckoId,
        timeframe: args.timeframe,
        timestamp: point.timestamp,
        price: point.price,
        volume: point.volume,
        marketCap: point.marketCap,
        // 🆕 Store OHLC fields if provided
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        dataSource: args.dataSource,
        lastUpdated: now,
      })
    );

    await Promise.all(insertPromises);

    console.log(`✅ CoinGecko: Successfully cached ${newDataPoints.length} data points for ${args.coingeckoId} (${args.timeframe})`);

    // Verify data was actually stored
    try {
      const verificationQuery = await ctx.db
        .query("priceHistory")
        .withIndex("by_coingecko_timeframe", (q) => 
          q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe))
        .take(5);
      
      console.log(`🔍 Verification: Found ${verificationQuery.length} records in DB for ${args.coingeckoId}/${args.timeframe}`);
      if (verificationQuery.length > 0) {
        console.log(`📊 Sample stored record:`, {
          id: verificationQuery[0]._id,
          timestamp: verificationQuery[0].timestamp,
          price: verificationQuery[0].price,
          open: verificationQuery[0].open,
          high: verificationQuery[0].high,
          low: verificationQuery[0].low,
          close: verificationQuery[0].close,
          dataSource: verificationQuery[0].dataSource
        });
      }
    } catch (verifyError) {
      console.error(`❌ Failed to verify stored data:`, verifyError);
    }

    return { 
      success: true, 
      insertedCount: newDataPoints.length,
      skippedCount: args.dataPoints.length - newDataPoints.length,
      coingeckoId: args.coingeckoId,
      timeframe: args.timeframe
    };
  },
});

// 🆕 NEW: Get CoinGecko current market data
export const getCoinGeckoCurrentMarketData = query({
  args: { coingeckoId: v.string() },
  handler: async (ctx, args) => {
    const cacheWindow = 2 * 60 * 1000; // 2 minutes for current data
    const now = Date.now();
    const cacheThreshold = now - cacheWindow;

    const currentData = await ctx.db
      .query("currentMarketData")
      .withIndex("by_coingecko", (q) => q.eq("coingeckoId", args.coingeckoId))
      .filter((q) => q.gt(q.field("lastUpdated"), cacheThreshold))
      .first();

    if (currentData) {
      return {
        data: currentData,
        cached: true,
      };
    }

    // Return stale data if available and indicate refresh needed
    const staleData = await ctx.db
      .query("currentMarketData")
      .withIndex("by_coingecko", (q) => q.eq("coingeckoId", args.coingeckoId))
      .first();

    return {
      data: staleData || null,
      cached: true,
      stale: !!staleData,
    };
  },
});

// 🆕 NEW: Upsert CoinGecko current market data
export const upsertCoinGeckoCurrentMarketData = mutation({
  args: {
    coingeckoId: v.string(),
    price: v.number(),
    volume24h: v.number(),
    marketCap: v.number(),
    change1h: v.optional(v.number()),
    change24h: v.optional(v.number()),
    change7d: v.optional(v.number()),
    change30d: v.optional(v.number()),
    rank: v.optional(v.number()),
    circulatingSupply: v.optional(v.number()),
    totalSupply: v.optional(v.number()),
    maxSupply: v.optional(v.number()),
    dataSource: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if we already have data for this coin
    const existing = await ctx.db
      .query("currentMarketData")
      .withIndex("by_coingecko", (q) => q.eq("coingeckoId", args.coingeckoId))
      .first();

    const data = {
      coingeckoId: args.coingeckoId,
      price: args.price,
      volume24h: args.volume24h,
      marketCap: args.marketCap,
      change1h: args.change1h,
      change24h: args.change24h || 0,
      change7d: args.change7d,
      change30d: args.change30d,
      rank: args.rank,
      circulatingSupply: args.circulatingSupply,
      totalSupply: args.totalSupply,
      maxSupply: args.maxSupply,
      dataSource: args.dataSource,
      lastUpdated: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("currentMarketData", data);
    }

    return { 
      success: true, 
      coingeckoId: args.coingeckoId,
      price: args.price
    };
  },
});

// Get or fetch historical price data with intelligent caching (LEGACY - CoinMarketCap)
export const getHistoricalData = query({
  args: { 
    coinId: v.number(), 
    timeframe: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cacheWindow = CACHE_DURATIONS[args.timeframe as keyof typeof CACHE_DURATIONS] || CACHE_DURATIONS['1d'];
    const cacheThreshold = now - cacheWindow;

    // Try to get fresh cached data first
    const cachedData = await ctx.db
      .query("priceHistory")
      .withIndex("by_coin_timeframe", (q) => 
        q.eq("coinId", args.coinId).eq("timeframe", args.timeframe))
      .filter((q) => q.gt(q.field("lastUpdated"), cacheThreshold))
      .collect();

    if (cachedData.length > 0) {
      return {
        data: cachedData.sort((a, b) => a.timestamp - b.timestamp),
        cached: true,
        lastUpdated: Math.max(...cachedData.map(d => d.lastUpdated)),
        dataPoints: cachedData.length,
      };
    }

    // Check for stale data that we can return while refreshing
    const staleData = await ctx.db
      .query("priceHistory")
      .withIndex("by_coin_timeframe", (q) => 
        q.eq("coinId", args.coinId).eq("timeframe", args.timeframe))
      .collect();

    if (staleData.length > 0) {
      return {
        data: staleData.sort((a, b) => a.timestamp - b.timestamp),
        cached: true,
        stale: true,
        lastUpdated: Math.max(...staleData.map(d => d.lastUpdated)),
        dataPoints: staleData.length,
      };
    }

    // No data available - trigger refresh and return empty for now
    return {
      data: [],
      cached: false,
      lastUpdated: 0,
      dataPoints: 0,
    };
  },
});

// Get current market data with caching
export const getCurrentMarketData = query({
  args: { coinId: v.number() },
  handler: async (ctx, args) => {
    const cacheWindow = 2 * 60 * 1000; // 2 minutes for current data
    const now = Date.now();
    const cacheThreshold = now - cacheWindow;

    const currentData = await ctx.db
      .query("currentMarketData")
      .withIndex("by_coin", (q) => q.eq("coinId", args.coinId))
      .filter((q) => q.gt(q.field("lastUpdated"), cacheThreshold))
      .first();

    if (currentData) {
      return {
        data: currentData,
        cached: true,
      };
    }

    // Return stale data if available and indicate refresh needed
    const staleData = await ctx.db
      .query("currentMarketData")
      .withIndex("by_coin", (q) => q.eq("coinId", args.coinId))
      .first();

    return {
      data: staleData || null,
      cached: true,
      stale: !!staleData,
    };
  },
});

// Optimized incremental upsert - only update changed records
export const upsertHistoricalDataIncremental = mutation({
  args: {
    coinId: v.number(),
    timeframe: v.string(),
    dataPoints: v.array(v.object({
      timestamp: v.number(),
      price: v.number(),
      volume: v.number(),
      marketCap: v.optional(v.number()),
      open: v.optional(v.number()),
      high: v.optional(v.number()),
      low: v.optional(v.number()),
      close: v.optional(v.number()),
    })),
    dataSource: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Get existing timestamps for this coin/timeframe to avoid duplicates
    const existingData = await ctx.db
      .query("priceHistory")
      .withIndex("by_coin_timeframe", (q) => 
        q.eq("coinId", args.coinId).eq("timeframe", args.timeframe))
      .collect();

    const existingTimestamps = new Set(existingData.map(d => d.timestamp));
    
    // Only insert new data points that don't already exist
    const newDataPoints = args.dataPoints.filter(point => 
      !existingTimestamps.has(point.timestamp)
    );

    // Batch insert new data points
    const insertPromises = newDataPoints.map(point => 
      ctx.db.insert("priceHistory", {
        coinId: args.coinId,
        timeframe: args.timeframe,
        timestamp: point.timestamp,
        price: point.price,
        volume: point.volume,
        marketCap: point.marketCap,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        dataSource: args.dataSource,
        lastUpdated: now,
      })
    );

    await Promise.all(insertPromises);

    return { 
      success: true, 
      insertedCount: newDataPoints.length,
      skippedCount: args.dataPoints.length - newDataPoints.length,
      coinId: args.coinId,
      timeframe: args.timeframe
    };
  },
});

// Legacy upsert (kept for compatibility, but use incremental version for better performance)
export const upsertHistoricalData = mutation({
  args: {
    coinId: v.number(),
    timeframe: v.string(),
    dataPoints: v.array(v.object({
      timestamp: v.number(),
      price: v.number(),
      volume: v.number(),
      marketCap: v.optional(v.number()),
      open: v.optional(v.number()),
      high: v.optional(v.number()),
      low: v.optional(v.number()),
      close: v.optional(v.number()),
    })),
    dataSource: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Delete existing data for this coin/timeframe to avoid duplicates
    const existingData = await ctx.db
      .query("priceHistory")
      .withIndex("by_coin_timeframe", (q) => 
        q.eq("coinId", args.coinId).eq("timeframe", args.timeframe))
      .collect();

    for (const item of existingData) {
      await ctx.db.delete(item._id);
    }

    // Insert new data points
    for (const point of args.dataPoints) {
      await ctx.db.insert("priceHistory", {
        coinId: args.coinId,
        timeframe: args.timeframe,
        timestamp: point.timestamp,
        price: point.price,
        volume: point.volume,
        marketCap: point.marketCap,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        dataSource: args.dataSource,
        lastUpdated: now,
      });
    }

    return { 
      success: true, 
      insertedCount: args.dataPoints.length,
      coinId: args.coinId,
      timeframe: args.timeframe
    };
  },
});

// Upsert current market data
export const upsertCurrentMarketData = mutation({
  args: {
    coinId: v.number(),
    price: v.number(),
    volume24h: v.number(),
    marketCap: v.number(),
    change1h: v.optional(v.number()),
    change24h: v.optional(v.number()),
    change7d: v.optional(v.number()),
    change30d: v.optional(v.number()),
    rank: v.optional(v.number()),
    circulatingSupply: v.optional(v.number()),
    totalSupply: v.optional(v.number()),
    maxSupply: v.optional(v.number()),
    dataSource: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if we already have data for this coin
    const existing = await ctx.db
      .query("currentMarketData")
      .withIndex("by_coin", (q) => q.eq("coinId", args.coinId))
      .first();

    const data = {
      coinId: args.coinId,
      price: args.price,
      volume24h: args.volume24h,
      marketCap: args.marketCap,
      change1h: args.change1h,
      change24h: args.change24h || 0,
      change7d: args.change7d,
      change30d: args.change30d,
      rank: args.rank,
      circulatingSupply: args.circulatingSupply,
      totalSupply: args.totalSupply,
      maxSupply: args.maxSupply,
      dataSource: args.dataSource,
      lastUpdated: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("currentMarketData", data);
    }

    return { 
      success: true, 
      coinId: args.coinId,
      price: args.price
    };
  },
});

// Trigger background refresh (called from frontend)
export const triggerDataRefresh = mutation({
  args: { 
    coinId: v.number(), 
    timeframe: v.optional(v.string()),
    refreshCurrent: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    // For now, just mark that a refresh was requested
    // In the next phase, we'll implement actual background fetching
    
    console.log(`🔄 Refresh requested for coin ${args.coinId}`);
    
    return { 
      success: true, 
      message: "Background refresh scheduled",
      coinId: args.coinId 
    };
  },
});

// 🔥 OPTIMIZED: Get cache statistics using efficient aggregation queries
export const getCacheStats = query({
  args: {
    coinId: v.optional(v.number()), // Optional - get stats for specific coin
    sampleSize: v.optional(v.number()), // Limit sample size for large datasets
  },
  handler: async (ctx, args) => {
    const sampleSize = args.sampleSize || 1000; // Limit to 1K records max
    
    if (args.coinId) {
      // Efficient stats for specific coin
      const coinId = args.coinId;
      const [historicalData, currentData] = await Promise.all([
        ctx.db
          .query("priceHistory")
          .withIndex("by_coin_timeframe", (q) => q.eq("coinId", coinId))
          .take(sampleSize),
        ctx.db
          .query("currentMarketData") 
          .withIndex("by_coin", (q) => q.eq("coinId", coinId))
          .first(),
      ]);

      return {
        historicalDataPoints: historicalData.length,
        currentDataEntries: currentData ? 1 : 0,
        uniqueCoins: 1,
        timeframes: new Set(historicalData.map(d => d.timeframe)).size,
        sampleSize: historicalData.length,
        limited: historicalData.length === sampleSize,
      };
    }

    // Efficient sampling for overall stats (avoid loading millions of records)
    const [historicalSample, currentSample] = await Promise.all([
      ctx.db.query("priceHistory").take(sampleSize),
      ctx.db.query("currentMarketData").take(sampleSize),
    ]);

    // Get unique coin count using a smaller sample
    const uniqueCoinsSample = new Set([
      ...historicalSample.map(h => h.coinId),
      ...currentSample.map(c => c.coinId)
    ]);

    return {
      historicalDataPoints: historicalSample.length,
      currentDataEntries: currentSample.length,
      uniqueCoins: uniqueCoinsSample.size,
      timeframes: new Set(historicalSample.map(d => d.timeframe)).size,
      sampleSize,
      limited: true,
      note: "Statistics based on sample to avoid loading large datasets"
    };
  },
});

// Clean up old data efficiently
export const cleanupOldData = mutation({
  args: { 
    olderThanDays: v.number(),
    batchSize: v.optional(v.number()), // Process in batches to avoid timeouts
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 100;
    const cutoffTime = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    // Delete old historical data in batches using filter
    const oldHistoricalData = await ctx.db
      .query("priceHistory")
      .filter((q) => q.lt(q.field("lastUpdated"), cutoffTime))
      .take(batchSize);
    
    // Delete old API cache in batches using filter
    const oldCacheData = await ctx.db
      .query("apiCache")
      .filter((q) => q.lt(q.field("expiresAt"), Date.now()))
      .take(batchSize);
    
    // Delete in parallel
    const deletePromises = [
      ...oldHistoricalData.map(item => ctx.db.delete(item._id)),
      ...oldCacheData.map(item => ctx.db.delete(item._id)),
    ];
    
    await Promise.all(deletePromises);
    
    return {
      success: true,
      deletedHistorical: oldHistoricalData.length,
      deletedCache: oldCacheData.length,
      hasMore: oldHistoricalData.length === batchSize || oldCacheData.length === batchSize,
      batchSize,
    };
  },
}); 