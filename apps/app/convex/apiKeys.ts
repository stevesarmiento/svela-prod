import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { API_PROVIDERS } from "../src/constants/api-providers";

// Re-export for use in convex functions
export { API_PROVIDERS };
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
      displayKey: key.displayKey,
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
    displayKey: v.optional(v.string()),
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

    const providerConfig = API_PROVIDERS[args.provider as keyof typeof API_PROVIDERS]
    if (!providerConfig) {
      throw new Error(`Invalid API provider: ${args.provider}`)
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
        displayKey: args.displayKey,
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
        displayKey: args.displayKey,
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
    
    // Verify the key exists
    const apiKey = await ctx.db.get(keyId);
    if (!apiKey) {
      throw new Error("API key not found");
    }
    
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
      const providerConfig = API_PROVIDERS[provider as keyof typeof API_PROVIDERS]
      if (!providerConfig) {
        return
      }
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
