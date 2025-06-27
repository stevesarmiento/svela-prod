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

  watchlists: defineTable({
    userId: v.id("users"),
    coinId: v.string(),
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
});