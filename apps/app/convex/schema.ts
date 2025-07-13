import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  posts: defineTable({
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
  })
    .index("by_user", ["userId"]),

  watchlistGroups: defineTable({
    userId: v.id("users"),
    name: v.string(),
    slug: v.string(), // URL-friendly identifier
    description: v.optional(v.string()),
    icon: v.optional(v.string()), // Emoji or icon name from symbols-react
    color: v.optional(v.string()), // Background color for the card
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_default", ["userId", "isDefault"])
    .index("by_user_slug", ["userId", "slug"]),

  watchlists: defineTable({
    userId: v.id("users"),
    watchlistGroupId: v.id("watchlistGroups"),
    coinId: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_coin", ["userId", "coinId"])
    .index("by_group", ["watchlistGroupId"])
    .index("by_group_coin", ["watchlistGroupId", "coinId"]),

  coins: defineTable({
    coinId: v.number(),
    name: v.string(),
    symbol: v.string(),
    rank: v.optional(v.number()),
    logoUrl: v.string(),
    isActive: v.boolean(),
    lastUpdated: v.number(),
  }).index("by_symbol", ["symbol"])
    .index("by_name", ["name"])
    .index("by_rank", ["rank"])
    .index("search", ["name", "symbol"]),

  // New CoinGecko coins table
  coingeckoCoins: defineTable({
    coingeckoId: v.string(), // Primary identifier for CoinGecko (e.g., "bitcoin", "ethereum")
    name: v.string(),
    symbol: v.string(),
    logoUrl: v.string(),
    isActive: v.boolean(),
    lastUpdated: v.number(),
    platforms: v.optional(v.record(v.string(), v.string())), // Platform contracts (e.g., {"ethereum": "0x..."})
    imageUpdated: v.optional(v.boolean()), // Track if image URL has been updated with real CoinGecko URL
  })
    .index("by_symbol", ["symbol"])
    .index("by_name", ["name"])
    .index("by_coingecko_id", ["coingeckoId"])
    .index("search", ["name", "symbol"])
    .index("by_image_updated", ["imageUpdated"]), // Index for finding coins that need image updates

  coinMetadata: defineTable({
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
    lastUpdated: v.number(),
  })
    .index("by_coin_id", ["coinId"])
    .index("by_slug", ["slug"])
    .index("by_symbol", ["symbol"]),

  // CoinGecko specific metadata table
  coingeckoMetadata: defineTable({
    coingeckoId: v.string(), // CoinGecko ID (e.g., "bitcoin")
    name: v.string(),
    symbol: v.string(),
    description: v.optional(v.string()),
    image: v.object({
      thumb: v.string(),
      small: v.string(),
      large: v.string(),
    }),
    homepage: v.optional(v.array(v.string())),
    blockchainSite: v.optional(v.array(v.string())),
    platforms: v.optional(v.record(v.string(), v.string())), // Platform contracts
    categories: v.optional(v.array(v.string())),
    publicNotice: v.optional(v.string()),
    additionalNotices: v.optional(v.array(v.string())),
    localization: v.optional(v.record(v.string(), v.string())),
    lastUpdated: v.number(),
  })
    .index("by_coingecko_id", ["coingeckoId"])
    .index("by_symbol", ["symbol"])
    .index("by_name", ["name"]),

  coinglassSupportedCoins: defineTable({
    symbol: v.string(),
    isActive: v.boolean(),
    lastUpdated: v.number(),
  })
    .index("by_symbol", ["symbol"])
    .index("by_active", ["isActive"]),

  userSettings: defineTable({
    userId: v.id("users"),
    // Memory & AI Settings
    memoryEnabled: v.boolean(),
    autoCleanupEnabled: v.boolean(),
    retentionDays: v.string(), // '7', '30', '90', '365', 'never'
    
    // UI/UX Settings (for future use)
    theme: v.optional(v.string()), // 'light', 'dark', 'system'
    currency: v.optional(v.string()), // 'USD', 'EUR', 'BTC', etc.
    dateFormat: v.optional(v.string()), // 'MM/DD/YYYY', 'DD/MM/YYYY', etc.
    
    // Notification Settings (for future use)
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
    priceAlerts: v.optional(v.boolean()),
    
    // Analytics & Privacy Settings (for future use)
    analyticsEnabled: v.optional(v.boolean()),
    shareUsageData: v.optional(v.boolean()),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  // Historical price data - optimized for chart rendering
  priceHistory: defineTable({
    // Support both CoinMarketCap and CoinGecko
    coinId: v.optional(v.number()), // CoinMarketCap ID
    coingeckoId: v.optional(v.string()), // CoinGecko ID
    
    timeframe: v.string(), // '7d', '30d', 'max', '2y' 
    timestamp: v.number(), // Unix timestamp
    price: v.number(),
    volume: v.number(),
    marketCap: v.optional(v.number()),
    // OHLCV data for candlestick charts
    open: v.optional(v.number()),
    high: v.optional(v.number()),
    low: v.optional(v.number()),
    close: v.optional(v.number()),
    // Metadata
    dataSource: v.string(), // 'coinmarketcap', 'coingecko', etc.
    lastUpdated: v.number(),
  })
    .index("by_coin_timeframe", ["coinId", "timeframe"])
    .index("by_coingecko_timeframe", ["coingeckoId", "timeframe"])
    .index("by_coin_timestamp", ["coinId", "timestamp"])
    .index("by_coingecko_timestamp", ["coingeckoId", "timestamp"])
    .index("by_timeframe_timestamp", ["timeframe", "timestamp"])
    .index("by_last_updated", ["lastUpdated"]),

  // Current market data - frequently updated
  currentMarketData: defineTable({
    // Support both CoinMarketCap and CoinGecko
    coinId: v.optional(v.number()), // CoinMarketCap ID
    coingeckoId: v.optional(v.string()), // CoinGecko ID
    
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
  })
    .index("by_coin", ["coinId"])
    .index("by_coingecko", ["coingeckoId"])
    .index("by_rank", ["rank"])
    .index("by_last_updated", ["lastUpdated"]),

  // CoinGecko Markets Data - real-time market information
  coingeckoMarkets: defineTable({
    coingeckoId: v.string(), // CoinGecko ID (e.g., "bitcoin")
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
    .index("by_coingecko_id", ["coingeckoId"])
    .index("by_symbol", ["symbol"])
    .index("by_market_cap_rank", ["marketCapRank"])
    .index("by_last_updated", ["lastUpdated"]),

  // API cache for complex responses and rate limiting
  apiCache: defineTable({
    cacheKey: v.string(), // Unique identifier for cached data
    data: v.any(), // JSON data from API response
    expiresAt: v.number(), // Unix timestamp when cache expires
    hitCount: v.number(), // Number of times this cache has been accessed
    lastAccessed: v.number(), // Last time cache was accessed
    dataSource: v.string(), // API source identifier
    createdAt: v.number(),
  })
    .index("by_key", ["cacheKey"])
    .index("by_expiry", ["expiresAt"])
    .index("by_source", ["dataSource"]),
});