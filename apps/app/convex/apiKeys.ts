import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// API Provider types and configurations
export const API_PROVIDERS = {
  coingecko: {
    name: "CoinGecko Pro",
    description: "Premium cryptocurrency market data and pricing",
    keyPattern: /^CG-[A-Za-z0-9\-]{20,}$/, // CoinGecko Pro API key format (flexible length)
    testEndpoint: "https://pro-api.coingecko.com/api/v3/ping",
    rateLimit: { requests: 500, window: 60000 }, // 500 requests per minute
  },
  coinglass: {
    name: "CoinGlass",
    description: "Derivatives and futures market data",
    keyPattern: /^[A-Za-z0-9]{32,}$/, // Generic API key pattern
    testEndpoint: "https://fapi.coinglass.com/api/futures/supported-coins",
    rateLimit: { requests: 1000, window: 60000 }, // 1000 requests per minute
  },
  openai: {
    name: "OpenAI",
    description: "AI-powered analysis and chat features",
    keyPattern: /^sk-[A-Za-z0-9]{48,}$/, // OpenAI API key format
    testEndpoint: "https://api.openai.com/v1/models",
    rateLimit: { requests: 3500, window: 60000 }, // Varies by tier
  },
  gemini: {
    name: "Google Gemini",
    description: "Google's AI model for analysis and chat",
    keyPattern: /^[A-Za-z0-9]{39}$/, // Gemini API key format
    testEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    rateLimit: { requests: 60, window: 60000 }, // 60 requests per minute
  },
  coinmarketcap: {
    name: "CoinMarketCap",
    description: "Comprehensive cryptocurrency market data",
    keyPattern: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, // UUID format
    testEndpoint: "https://pro-api.coinmarketcap.com/v1/key/info",
    rateLimit: { requests: 333, window: 60000 }, // 10,000 per month basic
  },
} as const;

export type ApiProvider = keyof typeof API_PROVIDERS;

// Get all API keys for a user
export const getUserApiKeys = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First get the user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const apiKeys = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Return keys without the encrypted values for security
    return apiKeys.map(key => ({
      _id: key._id,
      provider: key.provider,
      keyName: key.keyName,
      isActive: key.isActive,
      lastValidated: key.lastValidated,
      validationError: key.validationError,
      usageCount: key.usageCount ?? 0,
      rateLimitRemaining: key.rateLimitRemaining,
      rateLimitReset: key.rateLimitReset,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));
  },
});

// Get active API key for a specific provider
export const getActiveApiKey = query({
  args: { 
    clerkId: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    // First get the user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null; // Don't throw error, just return null for fallback
    }

    const apiKey = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", (q) => 
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!apiKey) {
      return null;
    }

    // Return the encrypted key (will be decrypted in the API handler)
    return {
      _id: apiKey._id,
      encryptedKey: apiKey.encryptedKey,
      usageCount: apiKey.usageCount ?? 0,
      rateLimitRemaining: apiKey.rateLimitRemaining,
      rateLimitReset: apiKey.rateLimitReset,
    };
  },
});

// Create or update an API key
export const upsertApiKey = mutation({
  args: {
    clerkId: v.string(),
    provider: v.string(),
    keyName: v.string(),
    encryptedKey: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    // First get the user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Validate provider
    if (!(args.provider in API_PROVIDERS)) {
      throw new Error(`Invalid API provider: ${args.provider}`);
    }

    const now = Date.now();

    // Check if user already has a key for this provider
    const existingKey = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", (q) => 
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .first();

    if (existingKey) {
      // Update existing key
      await ctx.db.patch(existingKey._id, {
        keyName: args.keyName,
        encryptedKey: args.encryptedKey,
        isActive: args.isActive,
        updatedAt: now,
        // Reset validation status when key is updated
        lastValidated: undefined,
        validationError: undefined,
      });
      return existingKey._id;
    } else {
      // Create new key
      return await ctx.db.insert("userApiKeys", {
        userId: user._id,
        provider: args.provider,
        keyName: args.keyName,
        encryptedKey: args.encryptedKey,
        isActive: args.isActive,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Update API key status (active/inactive)
export const updateApiKeyStatus = mutation({
  args: {
    clerkId: v.string(),
    keyId: v.id("userApiKeys"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    // First get the user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the API key and verify ownership
    const apiKey = await ctx.db.get(args.keyId);
    if (!apiKey || apiKey.userId !== user._id) {
      throw new Error("API key not found or access denied");
    }

    await ctx.db.patch(args.keyId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

// Delete an API key
export const deleteApiKey = mutation({
  args: {
    clerkId: v.string(),
    keyId: v.id("userApiKeys"),
  },
  handler: async (ctx, args) => {
    // First get the user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the API key and verify ownership
    const apiKey = await ctx.db.get(args.keyId);
    if (!apiKey || apiKey.userId !== user._id) {
      throw new Error("API key not found or access denied");
    }

    await ctx.db.delete(args.keyId);
  },
});

// Update API key validation status and usage stats
export const updateApiKeyStats = mutation({
  args: {
    keyId: v.id("userApiKeys"),
    lastValidated: v.optional(v.number()),
    validationError: v.optional(v.string()),
    usageCount: v.optional(v.number()),
    rateLimitRemaining: v.optional(v.number()),
    rateLimitReset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { keyId, ...updateData } = args;
    
    await ctx.db.patch(keyId, {
      ...updateData,
      updatedAt: Date.now(),
    });
  },
});

export const getApiKeyStats = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First get the user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const apiKeys = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Calculate total usage and stats
    const stats = {
      totalKeys: apiKeys.length,
      activeKeys: apiKeys.filter(key => key.isActive).length,
      totalUsage: apiKeys.reduce((sum, key) => sum + (key.usageCount ?? 0), 0),
      providerStats: {} as Record<string, {
        hasKey: boolean;
        isActive: boolean;
        usage: number;
        lastValidated?: number;
        validationError?: string;
      }>,
    };

    // Build provider-specific stats
    Object.keys(API_PROVIDERS).forEach(provider => {
      const providerKey = apiKeys.find(key => key.provider === provider);
      stats.providerStats[provider] = {
        hasKey: !!providerKey,
        isActive: providerKey?.isActive ?? false,
        usage: providerKey?.usageCount ?? 0,
        lastValidated: providerKey?.lastValidated,
        validationError: providerKey?.validationError,
      };
    });

    return stats;
  },
});
