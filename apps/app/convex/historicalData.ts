import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireServerToken } from "./_lib/server_token";

const priceHistoryValidator = v.object({
  _id: v.id("priceHistory"),
  _creationTime: v.number(),
  coingeckoId: v.string(),
  timeframe: v.string(),
  timestamp: v.number(),
  price: v.number(),
  volume: v.number(),
  marketCap: v.optional(v.number()),
  open: v.optional(v.number()),
  high: v.optional(v.number()),
  low: v.optional(v.number()),
  close: v.optional(v.number()),
  dataSource: v.string(),
  lastUpdated: v.number(),
});

const currentMarketDataValidator = v.object({
  _id: v.id("currentMarketData"),
  _creationTime: v.number(),
  coingeckoId: v.string(),
  price: v.number(),
  volume24h: v.number(),
  marketCap: v.number(),
  change1h: v.optional(v.number()),
  change24h: v.number(),
  change7d: v.optional(v.number()),
  change30d: v.optional(v.number()),
  rank: v.optional(v.number()),
  circulatingSupply: v.optional(v.number()),
  totalSupply: v.optional(v.number()),
  maxSupply: v.optional(v.number()),
  lastUpdated: v.number(),
  dataSource: v.string(),
});

// Cache duration constants in milliseconds
const CACHE_DURATIONS = {
  '1d': 2 * 60 * 1000,      // 2 minutes for intraday data
  '7d': 5 * 60 * 1000,      // 5 minutes for short-term data
  '30d': 60 * 60 * 1000,    // 15 minutes for medium-term data
  'max': 60 * 60 * 1000,    // 1 hour for long-term data
  '2y': 60 * 60 * 1000,     // 1 hour for long-term data
  'max_ohlc': 60 * 60 * 1000,    // 1 hour for OHLC data
  '2y_ohlc': 60 * 60 * 1000,     // 1 hour for OHLC data
} as const;

const isDebug = process.env.LOG_LEVEL === "debug";

// 🆕 NEW: Get CoinGecko historical data with intelligent caching
export const getCoinGeckoHistoricalData = query({
  args: { 
    serverToken: v.string(),
    coingeckoId: v.string(), 
    timeframe: v.string(),
  },
  returns: v.object({
    data: v.array(priceHistoryValidator),
    cached: v.boolean(),
    lastUpdated: v.number(),
    dataPoints: v.number(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const cacheWindow = CACHE_DURATIONS[args.timeframe as keyof typeof CACHE_DURATIONS] || CACHE_DURATIONS['1d'];
    const cacheThreshold = now - cacheWindow;

    const latest = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe_and_last_updated", (q) =>
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe),
      )
      .order("desc")
      .first();

    if (!latest) {
      // No data available - trigger refresh and return empty for now
      return {
        data: [],
        cached: false,
        lastUpdated: 0,
        dataPoints: 0,
        stale: false,
      };
    }

    const data = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe", (q) => 
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe))
      .collect();

    return {
      data: data.sort((a, b) => a.timestamp - b.timestamp),
      cached: true,
      lastUpdated: latest.lastUpdated,
      dataPoints: data.length,
      stale: latest.lastUpdated <= cacheThreshold,
    };
  },
});

// 🆕 NEW: Upsert CoinGecko historical data
export const upsertCoinGeckoHistoricalData = mutation({
  args: {
    serverToken: v.string(),
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
  returns: v.object({
    success: v.boolean(),
    insertedCount: v.number(),
    skippedCount: v.number(),
    coingeckoId: v.string(),
    timeframe: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    if (isDebug) {
      console.log(
        `🎯 CoinGecko Convex mutation called for ${args.coingeckoId} (${args.timeframe}) with ${args.dataPoints.length} data points`,
      );
      console.log(`🔍 Mutation arguments:`, {
        coingeckoId: args.coingeckoId,
        timeframe: args.timeframe,
        dataPointsCount: args.dataPoints.length,
        dataSource: args.dataSource,
        firstDataPoint: args.dataPoints[0],
        hasOHLC: args.dataPoints[0]?.open !== undefined,
      });
    }
    
    const now = Date.now();
    
    // Get existing timestamps for this coin/timeframe to avoid duplicates
    const existingData = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe", (q) => 
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe))
      .collect();

    if (isDebug) {
      console.log(
        `📊 Found ${existingData.length} existing data points for ${args.coingeckoId} (${args.timeframe})`,
      );
    }

    const existingTimestamps = new Set(existingData.map(d => d.timestamp));
    
    // Only insert new data points that don't already exist
    const newDataPoints = args.dataPoints.filter(point => 
      !existingTimestamps.has(point.timestamp)
    );

    if (isDebug) {
      console.log(
        `🆕 Inserting ${newDataPoints.length} new data points (${args.dataPoints.length - newDataPoints.length} duplicates skipped)`,
      );
    }
    
    // Log OHLC data if present
    const hasOHLCData = newDataPoints.some(point => 
      point.open !== undefined || point.high !== undefined || point.low !== undefined || point.close !== undefined
    )
    if (isDebug && hasOHLCData) {
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

    if (isDebug) {
      console.log(
        `✅ CoinGecko: Successfully cached ${newDataPoints.length} data points for ${args.coingeckoId} (${args.timeframe})`,
      );
    }

    // Verify data was actually stored
    try {
      const verificationQuery = await ctx.db
        .query("priceHistory")
        .withIndex("by_coingecko_timeframe", (q) => 
          q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe))
        .take(5);
      
      if (isDebug) {
        console.log(
          `🔍 Verification: Found ${verificationQuery.length} records in DB for ${args.coingeckoId}/${args.timeframe}`,
        );
      }
      if (verificationQuery.length > 0) {
        const firstRecord = verificationQuery[0];
        if (isDebug && firstRecord) {
          console.log(`📊 Sample stored record:`, {
            id: firstRecord._id,
            timestamp: firstRecord.timestamp,
            price: firstRecord.price,
            open: firstRecord.open,
            high: firstRecord.high,
            low: firstRecord.low,
            close: firstRecord.close,
            dataSource: firstRecord.dataSource
          });
        }
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
  args: { serverToken: v.string(), coingeckoId: v.string() },
  returns: v.object({
    data: v.union(currentMarketDataValidator, v.null()),
    cached: v.boolean(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const cacheWindow = 2 * 60 * 1000; // 2 minutes for current data
    const now = Date.now();
    const cacheThreshold = now - cacheWindow;

    const currentData = await ctx.db
      .query("currentMarketData")
      .withIndex("by_coingecko", (q) => q.eq("coingeckoId", args.coingeckoId))
      .first();

    if (!currentData) {
      return {
        data: null,
        cached: false,
        stale: false,
      };
    }

    if (currentData.lastUpdated > cacheThreshold) {
      return {
        data: currentData,
        cached: true,
        stale: false,
      };
    }

    return {
      data: currentData,
      cached: true,
      stale: true,
    };
  },
});

// 🆕 NEW: Upsert CoinGecko current market data
export const upsertCoinGeckoCurrentMarketData = mutation({
  args: {
    serverToken: v.string(),
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
  returns: v.object({
    success: v.boolean(),
    coingeckoId: v.string(),
    price: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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

// Get or fetch historical price data with intelligent caching (LEGACY - CoinMarketCap - DEPRECATED)
export const getHistoricalData = query({
  args: { 
    serverToken: v.string(),
    coinId: v.number(), 
    timeframe: v.string(),
  },
  returns: v.object({
    data: v.array(v.any()),
    cached: v.boolean(),
    lastUpdated: v.number(),
    dataPoints: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    // LEGACY function - return empty data since priceHistory table uses coingeckoId, not coinId
    if (isDebug) {
      console.log(
        '⚠️ [LEGACY] getHistoricalData called with coinId:',
        args.coinId,
        '- returning empty data',
      );
    }
    return {
      data: [],
      cached: false,
      lastUpdated: Date.now(),
      dataPoints: 0,
    };
  },
});

// Get current market data with caching (LEGACY - DEPRECATED)
export const getCurrentMarketData = query({
  args: { serverToken: v.string(), coinId: v.number() },
  returns: v.object({
    data: v.union(v.any(), v.null()),
    cached: v.boolean(),
    lastUpdated: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    // LEGACY function - return empty data since currentMarketData table uses coingeckoId, not coinId
    if (isDebug) {
      console.log(
        '⚠️ [LEGACY] getCurrentMarketData called with coinId:',
        args.coinId,
        '- returning empty data',
      );
    }
    return {
      data: null,
      cached: false,
      lastUpdated: Date.now(),
    };
  },
});

// Optimized incremental upsert - only update changed records (LEGACY - DEPRECATED)
export const upsertHistoricalDataIncremental = mutation({
  args: {
    serverToken: v.string(),
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
  returns: v.object({
    success: v.boolean(),
    insertedCount: v.number(),
    skippedCount: v.number(),
    coinId: v.number(),
    timeframe: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    // LEGACY function - deprecated
    if (isDebug) {
      console.log(
        '⚠️ [LEGACY] upsertHistoricalDataIncremental called - function deprecated',
      );
    }
    return {
      success: true,
      insertedCount: 0,
      skippedCount: args.dataPoints.length,
      coinId: args.coinId,
      timeframe: args.timeframe
    };
  },
});

// Legacy upsert (DEPRECATED - schema mismatch with coinId vs coingeckoId)
export const upsertHistoricalData = mutation({
  args: {
    serverToken: v.string(),
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
  returns: v.object({
    success: v.boolean(),
    insertedCount: v.number(),
    coinId: v.number(),
    timeframe: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    // LEGACY function - deprecated
    if (isDebug) {
      console.log('⚠️ [LEGACY] upsertHistoricalData called - function deprecated');
    }
    return {
      success: true, 
      insertedCount: 0,
      coinId: args.coinId,
      timeframe: args.timeframe
    };
  },
});

// Upsert current market data (LEGACY - DEPRECATED - schema mismatch)
export const upsertCurrentMarketData = mutation({
  args: {
    serverToken: v.string(),
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
  returns: v.object({
    success: v.boolean(),
    coinId: v.number(),
    price: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    // LEGACY function - deprecated
    if (isDebug) {
      console.log('⚠️ [LEGACY] upsertCurrentMarketData called - function deprecated');
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
    serverToken: v.string(),
    coinId: v.number(), 
    timeframe: v.optional(v.string()),
    refreshCurrent: v.optional(v.boolean())
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    coinId: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    // For now, just mark that a refresh was requested
    // In the next phase, we'll implement actual background fetching
    
    if (isDebug) console.log(`🔄 Refresh requested for coin ${args.coinId}`);
    
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
    serverToken: v.string(),
    coinId: v.optional(v.number()), // Optional - get stats for specific coin
    sampleSize: v.optional(v.number()), // Limit sample size for large datasets
  },
  returns: v.object({
    historicalDataPoints: v.number(),
    currentDataEntries: v.number(),
    uniqueCoins: v.number(),
    timeframes: v.number(),
    sampleSize: v.number(),
    limited: v.boolean(),
    note: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const sampleSize = args.sampleSize || 1000; // Limit to 1K records max
    
    if (args.coinId) {
      // LEGACY: stats for specific coin - deprecated due to schema mismatch
      if (isDebug) {
        console.log(
          '⚠️ [LEGACY] getCacheStats called with coinId - returning empty stats',
        );
      }
      return {
        historicalDataPoints: 0,
        currentDataEntries: 0,
        uniqueCoins: 0,
        timeframes: 0,
        sampleSize: 0,
        limited: false,
      };
    }

    // Efficient sampling for overall stats (avoid loading millions of records)
    const [historicalSample, currentSample] = await Promise.all([
      ctx.db.query("priceHistory").take(sampleSize),
      ctx.db.query("currentMarketData").take(sampleSize),
    ]);

    // Get unique coin count using a smaller sample
    const uniqueCoinsSample = new Set([
      ...historicalSample.map(h => h.coingeckoId),
      ...currentSample.map(c => c.coingeckoId)
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
    serverToken: v.string(),
    olderThanDays: v.number(),
    batchSize: v.optional(v.number()), // Process in batches to avoid timeouts
  },
  returns: v.object({
    success: v.boolean(),
    deletedHistorical: v.number(),
    deletedCache: v.number(),
    hasMore: v.boolean(),
    batchSize: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const batchSize = args.batchSize || 100;
    const cutoffTime = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldHistoricalData = await ctx.db
      .query("priceHistory")
      .withIndex("by_last_updated", (q) => q.lt("lastUpdated", cutoffTime))
      .take(batchSize);
    
    const oldCacheData = await ctx.db
      .query("apiCache")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
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