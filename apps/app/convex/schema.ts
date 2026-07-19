import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    // Linked Clerk ID from the development Clerk instance, so the same user
    // row resolves for both production and local-dev sessions (shared DB).
    devClerkId: v.optional(v.string()),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    // Sign-in Solana wallet from Clerk (web3 wallet). Display fallback for
    // wallet-only accounts that have no email/name.
    walletAddress: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_dev_clerk_id", ["devClerkId"])
    .index("by_email", ["email"]),

  watchlistGroups: defineTable({
    userId: v.id("users"),
    name: v.string(),
    slug: v.string(), // URL-friendly identifier
    description: v.optional(v.string()),
    icon: v.optional(v.string()), // Emoji or icon name from symbols-react
    color: v.optional(v.string()), // Background color for the card
    portfolioWalletId: v.optional(v.id("portfolioWallets")),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_default", ["userId", "isDefault"])
    .index("by_user_slug", ["userId", "slug"])
    .index("by_user_and_portfolio_wallet", ["userId", "portfolioWalletId"]),

  watchlists: defineTable({
    userId: v.id("users"),
    watchlistGroupId: v.id("watchlistGroups"),
    coinId: v.string(),
    /**
     * DEPRECATED: legacy per-row token quantity. Canonical holdings now live in
     * `coinHoldings` keyed by (userId, coinId). Kept optional so pre-migration
     * documents still validate; cleared by the holdings migration.
     */
    holdings: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_coin", ["userId", "coinId"])
    .index("by_group", ["watchlistGroupId"])
    .index("by_group_coin", ["watchlistGroupId", "coinId"])
    .index("by_coin", ["coinId"]),

  /**
   * Canonical token quantity per (user, coin). A coin has ONE holdings value
   * regardless of how many watchlist groups it appears in; watchlist rows
   * only record membership. Rows are pruned when the coin leaves the user's
   * last watchlist.
   */
  coinHoldings: defineTable({
    userId: v.id("users"),
    coinId: v.string(),
    holdings: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_coin", ["userId", "coinId"]),

  coins: defineTable({
    coinId: v.number(),
    name: v.string(),
    symbol: v.string(),
    rank: v.optional(v.number()),
    logoUrl: v.string(),
    isActive: v.boolean(),
    lastUpdated: v.number(),
  })
    .index("by_coin_id", ["coinId"])
    .index("by_symbol", ["symbol"])
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
    .index("by_image_updated", ["imageUpdated"])
    .searchIndex("search_name", { searchField: "name" })
    .searchIndex("search_symbol", { searchField: "symbol" })
    .searchIndex("search_coingecko_id", { searchField: "coingeckoId" }),

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

  coinglassSpotTakerBuySellVolumeHistory: defineTable({
    exchange: v.string(), // e.g. "Binance"
    symbol: v.string(), // e.g. "BTCUSDT"
    interval: v.string(), // e.g. "4h"
    timestamp: v.number(), // ms
    takerBuyVolumeUsd: v.number(),
    takerSellVolumeUsd: v.number(),
    dataSource: v.string(), // e.g. "coinglass-cron-spot-taker"
    lastUpdated: v.number(),
  })
    .index("by_exchange_and_symbol_and_interval", [
      "exchange",
      "symbol",
      "interval",
    ])
    .index("by_exchange_and_symbol_and_interval_and_timestamp", [
      "exchange",
      "symbol",
      "interval",
      "timestamp",
    ])
    .index("by_exchange_and_symbol_and_interval_and_last_updated", [
      "exchange",
      "symbol",
      "interval",
      "lastUpdated",
    ])
    .index("by_last_updated", ["lastUpdated"]),

  coinglassFuturesTakerBuySellVolumeHistory: defineTable({
    exchange: v.string(), // e.g. "Binance"
    symbol: v.string(), // e.g. "BTCUSDT"
    interval: v.string(), // e.g. "4h"
    timestamp: v.number(), // ms
    takerBuyVolumeUsd: v.number(),
    takerSellVolumeUsd: v.number(),
    dataSource: v.string(), // e.g. "coinglass-cron-futures-taker"
    lastUpdated: v.number(),
  })
    .index("by_exchange_and_symbol_and_interval", [
      "exchange",
      "symbol",
      "interval",
    ])
    .index("by_exchange_and_symbol_and_interval_and_timestamp", [
      "exchange",
      "symbol",
      "interval",
      "timestamp",
    ])
    .index("by_exchange_and_symbol_and_interval_and_last_updated", [
      "exchange",
      "symbol",
      "interval",
      "lastUpdated",
    ])
    .index("by_last_updated", ["lastUpdated"]),

  coinglassOpenInterestHistory: defineTable({
    symbol: v.string(), // e.g. "SOL"
    interval: v.string(), // e.g. "4h"
    unit: v.string(), // "usd" | "coin"
    timestamp: v.number(), // ms
    open: v.number(),
    high: v.number(),
    low: v.number(),
    close: v.number(),
    dataSource: v.string(), // e.g. "coinglass-cron-open-interest"
    lastUpdated: v.number(),
  })
    .index("by_symbol_and_interval_and_unit", ["symbol", "interval", "unit"])
    .index("by_symbol_and_interval_and_unit_and_timestamp", [
      "symbol",
      "interval",
      "unit",
      "timestamp",
    ])
    .index("by_symbol_and_interval_and_unit_and_last_updated", [
      "symbol",
      "interval",
      "unit",
      "lastUpdated",
    ])
    .index("by_last_updated", ["lastUpdated"]),

  coinglassLiquidationHistory: defineTable({
    symbol: v.string(), // e.g. "SOL"
    interval: v.string(), // e.g. "1d"
    exchangeList: v.string(), // e.g. "Binance, Bybit, OKX"
    timestamp: v.number(), // ms
    longLiquidations: v.number(),
    shortLiquidations: v.number(),
    totalLiquidations: v.number(),
    dataSource: v.string(), // e.g. "coinglass-cron-liquidations"
    lastUpdated: v.number(),
  })
    .index("by_symbol_and_interval_and_exchange_list", [
      "symbol",
      "interval",
      "exchangeList",
    ])
    .index("by_symbol_and_interval_and_exchange_list_and_timestamp", [
      "symbol",
      "interval",
      "exchangeList",
      "timestamp",
    ])
    .index("by_symbol_and_interval_and_exchange_list_and_last_updated", [
      "symbol",
      "interval",
      "exchangeList",
      "lastUpdated",
    ])
    .index("by_last_updated", ["lastUpdated"]),

  coinglassTakerBuySellExchangeListSnapshots: defineTable({
    symbol: v.string(), // e.g. "SOL"
    range: v.string(), // e.g. "24h"
    overall: v.object({
      buyRatio: v.number(),
      sellRatio: v.number(),
      buyVolumeUsd: v.number(),
      sellVolumeUsd: v.number(),
      totalVolumeUsd: v.number(),
    }),
    exchanges: v.array(
      v.object({
        exchange: v.string(),
        buyRatio: v.number(),
        sellRatio: v.number(),
        buyVolumeUsd: v.number(),
        sellVolumeUsd: v.number(),
        totalVolumeUsd: v.number(),
      }),
    ),
    dataSource: v.string(), // e.g. "coinglass-cron-taker-exchange-list"
    lastUpdated: v.number(),
  })
    .index("by_symbol_and_range", ["symbol", "range"])
    .index("by_symbol_and_range_and_last_updated", [
      "symbol",
      "range",
      "lastUpdated",
    ])
    .index("by_last_updated", ["lastUpdated"]),

  trackedCoins: defineTable({
    coingeckoId: v.string(),
    reason: v.string(), // "watchlist" | "portfolio" | "news" | "viewed" (string to keep migrations simple)
    lastSeen: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_coingecko_id", ["coingeckoId"])
    .index("by_reason", ["reason"])
    .index("by_last_seen", ["lastSeen"])
    .index("by_coingecko_id_and_reason", ["coingeckoId", "reason"]),

  /**
   * Per-(coin, timeframe) chart-series refresh state. `lastFetchedAt` records
   * the last SUCCESSFUL upstream fetch (series freshness + coverage proof —
   * every CoinGecko market_chart response contains the full window).
   * `nextDueAt` is the demand-prioritized scheduler queue key (see
   * convex/chartScheduler.ts); FAR_FUTURE sentinel = on-view warmup only.
   */
  chartSeries: defineTable({
    coingeckoId: v.string(),
    timeframe: v.string(), // "1","7","14","30","90","365","730","max","1_ohlc","7_ohlc"
    lastFetchedAt: v.optional(v.number()),
    lastRequestedAt: v.optional(v.number()),
    nextDueAt: v.number(),
    leaseUntil: v.optional(v.number()),
    consecutiveErrors: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_coin_timeframe", ["coingeckoId", "timeframe"])
    .index("by_timeframe_next_due", ["timeframe", "nextDueAt"])
    .index("by_last_requested", ["lastRequestedAt"]),

  coingeckoNewsArticles: defineTable({
    url: v.string(),
    title: v.string(),
    type: v.literal("news"),
    sourceName: v.optional(v.string()),
    author: v.optional(v.string()),
    postedAtIso: v.optional(v.string()),
    postedAtMs: v.number(),
    image: v.optional(v.string()),
    fetchedAt: v.number(),
    sentiment: v.optional(
      v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral")),
    ),
    sentimentConfidence: v.optional(v.number()),
    sentimentUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_url", ["url"])
    .index("by_posted_at_ms", ["postedAtMs"]),

  coingeckoNewsCoinLinks: defineTable({
    coingeckoId: v.string(),
    articleId: v.id("coingeckoNewsArticles"),
    postedAtMs: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_coingecko_id", ["coingeckoId"])
    .index("by_article_id", ["articleId"])
    .index("by_coingecko_id_and_article_id", ["coingeckoId", "articleId"])
    .index("by_coingecko_id_and_posted_at_ms", ["coingeckoId", "postedAtMs"]),

  portfolioWallets: defineTable({
    userId: v.id("users"),
    address: v.string(),
    name: v.optional(v.string()),
    isActive: v.boolean(),
    lastSyncedAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_address", ["userId", "address"])
    .index("by_active", ["isActive", "updatedAt"]),

  portfolioWalletCoins: defineTable({
    userId: v.id("users"),
    walletId: v.id("portfolioWallets"),
    coingeckoId: v.string(),
    mint: v.string(),
    createdAt: v.number(),
  })
    .index("by_wallet", ["walletId"])
    .index("by_wallet_coingecko", ["walletId", "coingeckoId"])
    .index("by_coingecko", ["coingeckoId"])
    .index("by_user_wallet", ["userId", "walletId"]),

  portfolioMintMappings: defineTable({
    mint: v.string(),
    coingeckoId: v.string(),
    source: v.string(), // "birdeye"
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_mint", ["mint"]),

  jobState: defineTable({
    jobKey: v.string(),
    cursor: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_job_key", ["jobKey"]),

  userSettings: defineTable({
    userId: v.id("users"),
    // Memory & AI Settings
    memoryEnabled: v.boolean(),
    autoCleanupEnabled: v.boolean(),
    retentionDays: v.string(), // '7', '30', '90', '365', 'never'

    // UI/UX Settings (for future use)
    theme: v.optional(v.string()), // 'light', 'dark', 'system', 'sunrise', 'cherry', 'blueberry'
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
  }).index("by_user", ["userId"]),

  userApiKeys: defineTable({
    userId: v.id("users"),
    provider: v.string(), // 'coingecko', 'coinglass', 'openai', 'gemini'
    keyName: v.string(), // Display name for the key (e.g., "My CoinGecko Pro Key")
    encryptedKey: v.string(), // Encrypted API key using AES-256-GCM
    displayKey: v.optional(v.string()), // Truncated key for display (e.g., "CG-7c6G...HmU8")
    isActive: v.boolean(), // Whether this key should be used
    lastValidated: v.optional(v.number()), // Timestamp of last successful validation
    validationError: v.optional(v.string()), // Last validation error message
    usageCount: v.optional(v.number()), // Track API usage for user insights
    rateLimitRemaining: v.optional(v.number()), // Track rate limits if available
    rateLimitReset: v.optional(v.number()), // When rate limit resets
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"])
    .index("by_user_active", ["userId", "isActive"]),

  // Historical price data - optimized for chart rendering (CoinGecko only)
  priceHistory: defineTable({
    coingeckoId: v.string(), // CoinGecko ID
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
    dataSource: v.string(), // 'coingecko', etc.
    lastUpdated: v.number(),
  })
    .index("by_coingecko_timeframe", ["coingeckoId", "timeframe"])
    .index("by_coingecko_timeframe_timestamp", [
      "coingeckoId",
      "timeframe",
      "timestamp",
    ])
    .index("by_coingecko_timeframe_and_last_updated", [
      "coingeckoId",
      "timeframe",
      "lastUpdated",
    ])
    .index("by_coingecko_timestamp", ["coingeckoId", "timestamp"])
    .index("by_timeframe_timestamp", ["timeframe", "timestamp"])
    .index("by_last_updated", ["lastUpdated"]),

  // Historical global crypto market benchmark data (CoinGecko `/global/market_cap_chart`).
  globalMarketHistory: defineTable({
    timeframe: v.string(), // "1" | "7" | "30" | "365"
    timestamp: v.number(), // Unix timestamp in ms
    marketCapUsd: v.number(),
    volumeUsd: v.number(),
    dataSource: v.string(),
    lastUpdated: v.number(),
  })
    .index("by_timeframe_timestamp", ["timeframe", "timestamp"])
    .index("by_timeframe_last_updated", ["timeframe", "lastUpdated"])
    .index("by_timestamp", ["timestamp"]),

  // Current market data - frequently updated (CoinGecko only)
  currentMarketData: defineTable({
    coingeckoId: v.string(), // CoinGecko ID
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
    .index("by_coingecko", ["coingeckoId"])
    .index("by_rank", ["rank"])
    .index("by_last_updated", ["lastUpdated"]),

  // Last-known spot price snapshots (Pyth/MagicBlock warm start + fallback).
  // NOTE: Stored per (coingeckoId, source, sessionId) to avoid write conflicts
  // when many clients are online at once. Readers take the most recently updated.
  lastKnownPrices: defineTable({
    coingeckoId: v.string(),
    source: v.string(), // e.g. "pyth"
    sessionId: v.string(),
    writerClerkId: v.string(),
    priceUsd: v.number(),
    publishTime: v.optional(v.number()), // ms
    confidence: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_coingecko_id", ["coingeckoId"])
    .index("by_coingecko_id_and_source", ["coingeckoId", "source"])
    .index("by_coingecko_id_and_source_and_session_id", [
      "coingeckoId",
      "source",
      "sessionId",
    ])
    .index("by_coingecko_id_and_source_and_updated_at", [
      "coingeckoId",
      "source",
      "updatedAt",
    ])
    .index("by_updated_at", ["updatedAt"]),

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

  smartScreenerPromptFailures: defineTable({
    createdAtMs: v.number(),
    surface: v.union(v.literal("watchlist"), v.literal("screener")),
    prompt: v.string(),
    confidence: v.number(),
    confidenceBucket: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
    ),
    actionKinds: v.array(v.string()),
    fallbackSearchText: v.optional(v.string()),
    // Optional feedback from the user (future UX).
    whatIMeant: v.optional(v.string()),
    // Non-sensitive error hint (e.g. "invalid_output", "rate_limited", "exception").
    errorType: v.optional(v.string()),
  })
    .index("by_surface", ["surface"])
    .index("by_surface_and_created_at_ms", ["surface", "createdAtMs"])
    .index("by_created_at_ms", ["createdAtMs"]),

  /**
   * Per-user AI feature usage counters (e.g. "analyze", "screener_search").
   * One row per (user, feature); upserted by API routes via server token.
   * Powers the internal admin dashboard's per-user usage view.
   */
  aiFeatureUsage: defineTable({
    userId: v.id("users"),
    feature: v.string(), // "analyze" | "screener_search"
    count: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_user_feature", ["userId", "feature"])
    .index("by_feature", ["feature"]),
});
