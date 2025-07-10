import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get user settings with defaults
export const getUserSettings = query({
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

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    // Return defaults if no settings exist
    if (!settings) {
      return {
        memoryEnabled: true,
        autoCleanupEnabled: false,
        retentionDays: "30",
        theme: "system",
        currency: "USD",
        dateFormat: "MM/DD/YYYY",
        emailNotifications: true,
        pushNotifications: true,
        priceAlerts: true,
        analyticsEnabled: true,
        shareUsageData: false,
      };
    }

    return settings;
  },
});

// Create or update user settings
export const upsertUserSettings = mutation({
  args: {
    clerkId: v.string(),
    memoryEnabled: v.optional(v.boolean()),
    autoCleanupEnabled: v.optional(v.boolean()),
    retentionDays: v.optional(v.string()),
    theme: v.optional(v.string()),
    currency: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
    priceAlerts: v.optional(v.boolean()),
    analyticsEnabled: v.optional(v.boolean()),
    shareUsageData: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { clerkId, ...settingsData } = args;
    
    // First get the user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }
    
    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const now = Date.now();

    if (existingSettings) {
      // Update existing settings
      await ctx.db.patch(existingSettings._id, {
        ...settingsData,
        updatedAt: now,
      });
      return existingSettings._id;
    } else {
      // Create new settings with defaults
      const newSettings = {
        userId: user._id,
        memoryEnabled: settingsData.memoryEnabled ?? true,
        autoCleanupEnabled: settingsData.autoCleanupEnabled ?? false,
        retentionDays: settingsData.retentionDays ?? "30",
        theme: settingsData.theme,
        currency: settingsData.currency,
        dateFormat: settingsData.dateFormat,
        emailNotifications: settingsData.emailNotifications,
        pushNotifications: settingsData.pushNotifications,
        priceAlerts: settingsData.priceAlerts,
        analyticsEnabled: settingsData.analyticsEnabled,
        shareUsageData: settingsData.shareUsageData,
        createdAt: now,
        updatedAt: now,
      };
      
      return await ctx.db.insert("userSettings", newSettings);
    }
  },
});

// Update specific memory settings
export const updateMemorySettings = mutation({
  args: {
    clerkId: v.string(),
    memoryEnabled: v.optional(v.boolean()),
    autoCleanupEnabled: v.optional(v.boolean()),
    retentionDays: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clerkId, ...memorySettings } = args;
    
    // First get the user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }
    
    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const now = Date.now();

    if (existingSettings) {
      // Update existing settings - only update non-undefined values
      const updateData: {
        updatedAt: number;
        memoryEnabled?: boolean;
        autoCleanupEnabled?: boolean;
        retentionDays?: string;
      } = { updatedAt: now };
      if (memorySettings.memoryEnabled !== undefined) updateData.memoryEnabled = memorySettings.memoryEnabled;
      if (memorySettings.autoCleanupEnabled !== undefined) updateData.autoCleanupEnabled = memorySettings.autoCleanupEnabled;
      if (memorySettings.retentionDays !== undefined) updateData.retentionDays = memorySettings.retentionDays;

      await ctx.db.patch(existingSettings._id, updateData);
      return existingSettings._id;
    } else {
      // Create new settings with defaults
      const newSettings = {
        userId: user._id,
        memoryEnabled: memorySettings.memoryEnabled ?? true,
        autoCleanupEnabled: memorySettings.autoCleanupEnabled ?? false,
        retentionDays: memorySettings.retentionDays ?? "30",
        createdAt: now,
        updatedAt: now,
      };
      
      return await ctx.db.insert("userSettings", newSettings);
    }
  },
});

// Get memory settings specifically
export const getMemorySettings = query({
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

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    // Return defaults if no settings exist
    if (!settings) {
      return {
        memoryEnabled: true,
        autoCleanupEnabled: false,
        retentionDays: "30",
      };
    }

    return {
      memoryEnabled: settings.memoryEnabled,
      autoCleanupEnabled: settings.autoCleanupEnabled,
      retentionDays: settings.retentionDays,
    };
  },
}); 