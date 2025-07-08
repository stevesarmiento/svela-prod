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
});