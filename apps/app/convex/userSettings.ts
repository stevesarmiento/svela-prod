import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireServerToken } from "./_lib/server_token";
import type { Id } from "./_generated/dataModel";

const defaultUserSettings = {
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
} as const;

const userSettingsValueValidator = v.object({
  memoryEnabled: v.boolean(),
  autoCleanupEnabled: v.boolean(),
  retentionDays: v.string(),
  theme: v.string(),
  currency: v.string(),
  dateFormat: v.string(),
  emailNotifications: v.boolean(),
  pushNotifications: v.boolean(),
  priceAlerts: v.boolean(),
  analyticsEnabled: v.boolean(),
  shareUsageData: v.boolean(),
});

interface UserSettingsWrite {
  userId: Id<"users">;
  memoryEnabled: boolean;
  autoCleanupEnabled: boolean;
  retentionDays: string;
  createdAt: number;
  updatedAt: number;
  theme?: string;
  currency?: string;
  dateFormat?: string;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  priceAlerts?: boolean;
  analyticsEnabled?: boolean;
  shareUsageData?: boolean;
}

// Get user settings with defaults
export const getUserSettings = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: userSettingsValueValidator,
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
      return defaultUserSettings;
    }

    return {
      memoryEnabled: settings.memoryEnabled,
      autoCleanupEnabled: settings.autoCleanupEnabled,
      retentionDays: settings.retentionDays,
      theme: settings.theme ?? defaultUserSettings.theme,
      currency: settings.currency ?? defaultUserSettings.currency,
      dateFormat: settings.dateFormat ?? defaultUserSettings.dateFormat,
      emailNotifications:
        settings.emailNotifications ?? defaultUserSettings.emailNotifications,
      pushNotifications:
        settings.pushNotifications ?? defaultUserSettings.pushNotifications,
      priceAlerts: settings.priceAlerts ?? defaultUserSettings.priceAlerts,
      analyticsEnabled:
        settings.analyticsEnabled ?? defaultUserSettings.analyticsEnabled,
      shareUsageData: settings.shareUsageData ?? defaultUserSettings.shareUsageData,
    };
  },
});

// Create or update user settings
export const upsertUserSettings = mutation({
  args: {
    serverToken: v.string(),
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
  returns: v.id("userSettings"),
  handler: async (ctx, args) => {
    const { clerkId, serverToken, ...settingsData } = args;
    requireServerToken(serverToken);
    
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
      // Replace the document to drop any legacy/unknown fields (e.g. `serverToken`)
      // that might have been written before the schema was enforced.
      const nextSettings: UserSettingsWrite = {
        userId: existingSettings.userId,
        memoryEnabled:
          settingsData.memoryEnabled ??
          existingSettings.memoryEnabled ??
          defaultUserSettings.memoryEnabled,
        autoCleanupEnabled:
          settingsData.autoCleanupEnabled ??
          existingSettings.autoCleanupEnabled ??
          defaultUserSettings.autoCleanupEnabled,
        retentionDays:
          settingsData.retentionDays ??
          existingSettings.retentionDays ??
          defaultUserSettings.retentionDays,
        createdAt: existingSettings.createdAt ?? now,
        updatedAt: now,
      };

      const theme = settingsData.theme ?? existingSettings.theme;
      if (theme !== undefined) nextSettings.theme = theme;
      const currency = settingsData.currency ?? existingSettings.currency;
      if (currency !== undefined) nextSettings.currency = currency;
      const dateFormat = settingsData.dateFormat ?? existingSettings.dateFormat;
      if (dateFormat !== undefined) nextSettings.dateFormat = dateFormat;
      const emailNotifications =
        settingsData.emailNotifications ?? existingSettings.emailNotifications;
      if (emailNotifications !== undefined)
        nextSettings.emailNotifications = emailNotifications;
      const pushNotifications =
        settingsData.pushNotifications ?? existingSettings.pushNotifications;
      if (pushNotifications !== undefined)
        nextSettings.pushNotifications = pushNotifications;
      const priceAlerts = settingsData.priceAlerts ?? existingSettings.priceAlerts;
      if (priceAlerts !== undefined) nextSettings.priceAlerts = priceAlerts;
      const analyticsEnabled =
        settingsData.analyticsEnabled ?? existingSettings.analyticsEnabled;
      if (analyticsEnabled !== undefined)
        nextSettings.analyticsEnabled = analyticsEnabled;
      const shareUsageData =
        settingsData.shareUsageData ?? existingSettings.shareUsageData;
      if (shareUsageData !== undefined) nextSettings.shareUsageData = shareUsageData;

      await ctx.db.replace(existingSettings._id, nextSettings);
      return existingSettings._id;
    } else {
      // Create new settings with defaults
      const newSettings = {
        userId: user._id,
        memoryEnabled:
          settingsData.memoryEnabled ?? defaultUserSettings.memoryEnabled,
        autoCleanupEnabled:
          settingsData.autoCleanupEnabled ?? defaultUserSettings.autoCleanupEnabled,
        retentionDays:
          settingsData.retentionDays ?? defaultUserSettings.retentionDays,
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
    serverToken: v.string(),
    clerkId: v.string(),
    memoryEnabled: v.optional(v.boolean()),
    autoCleanupEnabled: v.optional(v.boolean()),
    retentionDays: v.optional(v.string()),
  },
  returns: v.id("userSettings"),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
        memoryEnabled:
          memorySettings.memoryEnabled ?? defaultUserSettings.memoryEnabled,
        autoCleanupEnabled:
          memorySettings.autoCleanupEnabled ?? defaultUserSettings.autoCleanupEnabled,
        retentionDays:
          memorySettings.retentionDays ?? defaultUserSettings.retentionDays,
        createdAt: now,
        updatedAt: now,
      };
      
      return await ctx.db.insert("userSettings", newSettings);
    }
  },
});

// Get memory settings specifically
export const getMemorySettings = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: v.object({
    memoryEnabled: v.boolean(),
    autoCleanupEnabled: v.boolean(),
    retentionDays: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
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
        memoryEnabled: defaultUserSettings.memoryEnabled,
        autoCleanupEnabled: defaultUserSettings.autoCleanupEnabled,
        retentionDays: defaultUserSettings.retentionDays,
      };
    }

    return {
      memoryEnabled: settings.memoryEnabled,
      autoCleanupEnabled: settings.autoCleanupEnabled,
      retentionDays: settings.retentionDays,
    };
  },
}); 