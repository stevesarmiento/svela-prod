import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";
import { internal } from "./_generated/api";

const watchlistGroupValidator = v.object({
  _id: v.id("watchlistGroups"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  icon: v.optional(v.string()),
  color: v.optional(v.string()),
  portfolioWalletId: v.optional(v.id("portfolioWallets")),
  isDefault: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const watchlistItemValidator = v.object({
  _id: v.id("watchlists"),
  _creationTime: v.number(),
  userId: v.id("users"),
  watchlistGroupId: v.id("watchlistGroups"),
  coinId: v.string(),
});

async function getCurrentUser(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  return user ?? null;
}

// Watchlist Group functions
export const getWatchlistGroups = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: v.array(watchlistGroupValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) return [];

    return await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

// Helper function to generate URL-friendly slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .substring(0, 50); // Limit length
}

export const createWatchlistGroup = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.id("watchlistGroups"),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    // Generate base slug
    let baseSlug = generateSlug(args.name);
    if (!baseSlug) baseSlug = 'watchlist'; // Fallback if name has no valid chars
    
    // Ensure slug is unique for this user
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
      const existing = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
        .first();
      
      if (!existing) break;
      
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const now = Date.now();
    
    return await ctx.db.insert("watchlistGroups", {
      userId: user._id,
      name: args.name,
      slug: slug,
      description: args.description,
      icon: args.icon,
      color: args.color,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateWatchlistGroup = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    groupId: v.id("watchlistGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    const group = await ctx.db.get(args.groupId);
    if (!group || group.userId !== user._id) {
      throw new Error("Watchlist group not found");
    }

    const now = Date.now();
    const updates: { 
      updatedAt: number;
      name?: string;
      slug?: string;
      description?: string;
      icon?: string;
      color?: string;
    } = { updatedAt: now };
    
    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      updates.name = trimmed;
      
      // Generate new slug if name is changing
      if (trimmed !== group.name) {
        let baseSlug = generateSlug(trimmed);
        if (!baseSlug) baseSlug = 'watchlist';
        
        // Ensure slug is unique for this user (excluding current group)
        let slug = baseSlug;
        let counter = 1;
        
        while (true) {
          const existing = await ctx.db
            .query("watchlistGroups")
            .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
            .first();
          
          if (!existing || existing._id === args.groupId) break;
          
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        
        updates.slug = slug;
      }
    }
    
    if (args.description !== undefined) updates.description = args.description;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.color !== undefined) updates.color = args.color;

    await ctx.db.patch(args.groupId, updates);

    // If this is a wallet-backed group, keep the portfolio wallet name in sync
    // so Portfolio (read-only for now) doesn’t drift from Watchlist edits.
    if (group.portfolioWalletId && typeof updates.name === "string" && updates.name.length > 0) {
      const wallet = await ctx.db.get(group.portfolioWalletId);
      if (wallet && wallet.userId === user._id) {
        await ctx.db.patch(group.portfolioWalletId, {
          name: updates.name,
          updatedAt: now,
        });
      }
    }

    return null;
  },
});

export const deleteWatchlistGroup = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    groupId: v.id("watchlistGroups"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    const group = await ctx.db.get(args.groupId);
    if (!group || group.userId !== user._id) {
      throw new Error("Watchlist group not found");
    }

    if (group.isDefault) {
      throw new Error("Cannot delete default watchlist");
    }

    // Delete all watchlist items in this group
    const watchlistItems = await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", args.groupId))
      .collect();

    const coinIds = Array.from(new Set(watchlistItems.map((item) => item.coinId)));

    await Promise.all(
      watchlistItems.map(item => ctx.db.delete(item._id))
    );

    // Remove global watchlist tracking when the coin is no longer watched by anyone.
    await Promise.all(
      coinIds.map(async (coinId) => {
        const remaining = await ctx.db
          .query("watchlists")
          .withIndex("by_coin", (q) => q.eq("coinId", coinId))
          .first();
        if (remaining) return;
        await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
          coingeckoId: coinId,
          reason: "watchlist",
        });
      }),
    );

    // Delete the group
    await ctx.db.delete(args.groupId);
    return null;
  },
});

// Legacy function - get default watchlist (backward compatibility)
export const getWatchlist = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: v.array(watchlistItemValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) return [];

    // Get or create default watchlist group
    const defaultGroup = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
      .first();

    if (!defaultGroup) {
      // For backward compatibility, we'll return empty array if no default group exists
      // Default groups should be created via migration or on first interaction
      return [];
    }

    return await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", defaultGroup._id))
      .collect();
  },
});

// Get watchlist for specific group by ID
export const getWatchlistByGroup = query({
  args: { 
    serverToken: v.string(),
    clerkId: v.string(),
    groupId: v.id("watchlistGroups"),
  },
  returns: v.array(watchlistItemValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) return [];

    const group = await ctx.db.get(args.groupId);
    if (!group || group.userId !== user._id) {
      throw new Error("Watchlist group not found");
    }

    return await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", args.groupId))
      .collect();
  },
});

// Get watchlist for specific group by slug
export const getWatchlistBySlug = query({
  args: { 
    serverToken: v.string(),
    clerkId: v.string(),
    slug: v.string(),
  },
  returns: v.union(
    v.object({
      group: watchlistGroupValidator,
      items: v.array(watchlistItemValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) return null;

    const group = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", args.slug))
      .first();
    
    if (!group) return null;

    const watchlistItems = await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", group._id))
      .collect();

    return {
      group,
      items: watchlistItems
    };
  },
});

// Get watchlist group by slug
export const getWatchlistGroupBySlug = query({
  args: { 
    serverToken: v.string(),
    clerkId: v.string(),
    slug: v.string(),
  },
  returns: v.union(watchlistGroupValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) return null;

    return await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", args.slug))
      .first();
  },
});

// MIGRATED TO COINGECKO: Now accepts CoinGecko string IDs (e.g., "bitcoin", "ethereum")
// instead of numeric CoinMarketCap IDs
export const addToWatchlist = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    coinId: v.string(), // Now accepts CoinGecko string IDs (e.g., "bitcoin", "ethereum")
    groupId: v.optional(v.id("watchlistGroups")),
  },
  returns: v.id("watchlists"),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    let targetGroupId = args.groupId;
    
    // If no group specified, use default
    if (!targetGroupId) {
      const defaultGroup = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
        .first();

      if (!defaultGroup) {
        // Create default watchlist group
        const now = Date.now();
        targetGroupId = await ctx.db.insert("watchlistGroups", {
          userId: user._id,
          name: "My Watchlist",
          slug: "my-watchlist",
          description: "Default watchlist",
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        targetGroupId = defaultGroup._id;
      }
    }

    // Verify group belongs to user
    const group = await ctx.db.get(targetGroupId);
    if (!group || group.userId !== user._id) {
      throw new Error("Watchlist group not found");
    }

    // Check if already in this group's watchlist
    const existing = await ctx.db
      .query("watchlists")
      .withIndex("by_group_coin", (q) => 
        q.eq("watchlistGroupId", targetGroupId).eq("coinId", args.coinId)
      )
      .first();

    if (existing) throw new Error("Already in watchlist");

    // Store CoinGecko string ID directly (e.g., "bitcoin", "ethereum")
    const id = await ctx.db.insert("watchlists", {
      userId: user._id,
      watchlistGroupId: targetGroupId,
      coinId: args.coinId, // CoinGecko string ID
    });

    // Track this coin globally so crons can keep it warm.
    await ctx.runMutation(internal.coingeckoState._touchTrackedCoin, {
      coingeckoId: args.coinId,
      reason: "watchlist",
      lastSeen: Date.now(),
    });

    // Warm market quotes quickly so the watchlist row doesn't show N/A on first render.
    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshMarketsByIds, {
      coingeckoIds: [args.coinId],
    });

    // Warm chart series quickly so brand-new watchlist coins don't show blank/old price action.
    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshSingleMarketChart, {
      coingeckoId: args.coinId,
      days: "7",
    });
    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshSingleMarketChart, {
      coingeckoId: args.coinId,
      days: "1",
    });

    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshSingleOhlc, {
      coingeckoId: args.coinId,
      days: "1",
    });

    return id;
  },
});

// MIGRATED TO COINGECKO: Now accepts CoinGecko string IDs
export const removeFromWatchlist = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    coinId: v.string(), // Now accepts CoinGecko string IDs
    groupId: v.optional(v.id("watchlistGroups")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    let targetGroupId = args.groupId;

    // If no group specified, use default
    if (!targetGroupId) {
      const defaultGroup = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
        .first();
      
      if (!defaultGroup) throw new Error("Default watchlist not found");
      targetGroupId = defaultGroup._id;
    }

    const watchlistItem = await ctx.db
      .query("watchlists")
      .withIndex("by_group_coin", (q) => 
        q.eq("watchlistGroupId", targetGroupId).eq("coinId", args.coinId)
      )
      .first();

    if (!watchlistItem) throw new Error("Not in watchlist");

    await ctx.db.delete(watchlistItem._id);

    // If nobody is watching this coin anymore, remove it from the tracked set.
    const remaining = await ctx.db
      .query("watchlists")
      .withIndex("by_coin", (q) => q.eq("coinId", args.coinId))
      .first();

    if (!remaining) {
      await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
        coingeckoId: args.coinId,
        reason: "watchlist",
      });
    }
    return null;
  },
});

// MIGRATED TO COINGECKO: Now accepts array of CoinGecko string IDs
export const removeBulkFromWatchlist = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    coinIds: v.array(v.string()), // Now accepts array of CoinGecko string IDs
    groupId: v.optional(v.id("watchlistGroups")),
  },
  returns: v.object({ removedCount: v.number() }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    let targetGroupId = args.groupId;

    // If no group specified, use default
    if (!targetGroupId) {
      const defaultGroup = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
        .first();
      
      if (!defaultGroup) throw new Error("Default watchlist not found");
      targetGroupId = defaultGroup._id;
    }

    // Find all watchlist items for the given CoinGecko IDs in this group
    const watchlistItems = await Promise.all(
      args.coinIds.map(coinId =>
        ctx.db
          .query("watchlists")
          .withIndex("by_group_coin", (q) => 
            q.eq("watchlistGroupId", targetGroupId).eq("coinId", coinId)
          )
          .first()
      )
    );

    // Filter out null values and delete all found items
    const validItems = watchlistItems.filter(item => item !== null);
    
    await Promise.all(
      validItems.map(item => ctx.db.delete(item!._id))
    );

    const uniqueCoinIds = Array.from(new Set(args.coinIds));
    await Promise.all(
      uniqueCoinIds.map(async (coinId) => {
        const remaining = await ctx.db
          .query("watchlists")
          .withIndex("by_coin", (q) => q.eq("coinId", coinId))
          .first();
        if (remaining) return;
        await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
          coingeckoId: coinId,
          reason: "watchlist",
        });
      }),
    );

    return { removedCount: validItems.length };
  },
});

// NEW: Check if a CoinGecko coin is in a specific watchlist group
export const isInWatchlist = query({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    coinId: v.string(), // CoinGecko string ID
    groupId: v.optional(v.id("watchlistGroups")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) return false;

    let targetGroupId = args.groupId;

    // If no group specified, use default
    if (!targetGroupId) {
      const defaultGroup = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
        .first();
      
      if (!defaultGroup) return false;
      targetGroupId = defaultGroup._id;
    }

    const watchlistItem = await ctx.db
      .query("watchlists")
      .withIndex("by_group_coin", (q) => 
        q.eq("watchlistGroupId", targetGroupId).eq("coinId", args.coinId)
      )
      .first();

    return !!watchlistItem;
  },
});

// NEW: Get all CoinGecko IDs from a watchlist group for batch processing
export const getWatchlistCoinIds = query({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    groupId: v.optional(v.id("watchlistGroups")),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) return [];

    let targetGroupId = args.groupId;

    // If no group specified, use default
    if (!targetGroupId) {
      const defaultGroup = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
        .first();
      
      if (!defaultGroup) return [];
      targetGroupId = defaultGroup._id;
    }

    const watchlistItems = await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", targetGroupId))
      .collect();

    return watchlistItems.map(item => item.coinId); // Returns CoinGecko string IDs
  },
});

// Screener helpers - union across all watchlist groups for the user.
export const getAllWatchlistCoinIds = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) return [];

    const items = await ctx.db
      .query("watchlists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const unique = Array.from(new Set(items.map((item) => item.coinId))).filter((id) => id.length > 0);
    unique.sort();
    return unique;
  },
});

export const removeFromAllWatchlists = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    coinId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    const rows = await ctx.db
      .query("watchlists")
      .withIndex("by_user_coin", (q) => q.eq("userId", user._id).eq("coinId", args.coinId))
      .collect();

    if (rows.length === 0) return null;

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    // If nobody is watching this coin anymore, remove it from the tracked set.
    const remaining = await ctx.db
      .query("watchlists")
      .withIndex("by_coin", (q) => q.eq("coinId", args.coinId))
      .first();

    if (!remaining) {
      await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
        coingeckoId: args.coinId,
        reason: "watchlist",
      });
    }

    return null;
  },
});

export const removeBulkFromAllWatchlists = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    coinIds: v.array(v.string()),
  },
  returns: v.object({ removedCount: v.number() }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    const uniqueCoinIds = Array.from(new Set(args.coinIds)).filter((id) => id.length > 0);
    if (uniqueCoinIds.length === 0) return { removedCount: 0 };

    const removedByCoin = await Promise.all(
      uniqueCoinIds.map(async (coinId) => {
        const rows = await ctx.db
          .query("watchlists")
          .withIndex("by_user_coin", (q) => q.eq("userId", user._id).eq("coinId", coinId))
          .collect();

        if (rows.length === 0) return { coinId, removed: 0 };

        await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
        return { coinId, removed: rows.length };
      }),
    );

    const removedCount = removedByCoin.reduce((sum, row) => sum + row.removed, 0);

    // Remove global watchlist tracking when the coin is no longer watched by anyone.
    await Promise.all(
      removedByCoin
        .filter((row) => row.removed > 0)
        .map(async ({ coinId }) => {
          const remaining = await ctx.db
            .query("watchlists")
            .withIndex("by_coin", (q) => q.eq("coinId", coinId))
            .first();
          if (remaining) return;
          await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
            coingeckoId: coinId,
            reason: "watchlist",
          });
        }),
    );

    return { removedCount };
  },
});

// ================================
// Authenticated (browser → Convex)
// ================================

export const listMyWatchlistGroups = query({
  args: {},
  returns: v.array(watchlistGroupValidator),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const createMyWatchlistGroup = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.id("watchlistGroups"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    let baseSlug = generateSlug(args.name);
    if (!baseSlug) baseSlug = "watchlist";

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
        .first();
      if (!existing) break;
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    const now = Date.now();
    return await ctx.db.insert("watchlistGroups", {
      userId: user._id,
      name: args.name,
      slug,
      description: args.description,
      icon: args.icon,
      color: args.color,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMyWatchlistGroup = mutation({
  args: {
    groupId: v.id("watchlistGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const group = await ctx.db.get(args.groupId);
    if (!group || group.userId !== user._id) throw new Error("Watchlist group not found");

    const now = Date.now();
    const updates: {
      updatedAt: number;
      name?: string;
      slug?: string;
      description?: string;
      icon?: string;
      color?: string;
    } = { updatedAt: now };

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      updates.name = trimmed;

      if (trimmed !== group.name) {
        let baseSlug = generateSlug(trimmed);
        if (!baseSlug) baseSlug = "watchlist";

        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const existing = await ctx.db
            .query("watchlistGroups")
            .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
            .first();
          if (!existing || existing._id === args.groupId) break;
          slug = `${baseSlug}-${counter}`;
          counter += 1;
        }
        updates.slug = slug;
      }
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.color !== undefined) updates.color = args.color;

    await ctx.db.patch(args.groupId, updates);

    if (group.portfolioWalletId && typeof updates.name === "string" && updates.name.length > 0) {
      const wallet = await ctx.db.get(group.portfolioWalletId);
      if (wallet && wallet.userId === user._id) {
        await ctx.db.patch(group.portfolioWalletId, { name: updates.name, updatedAt: now });
      }
    }

    return null;
  },
});

export const deleteMyWatchlistGroup = mutation({
  args: { groupId: v.id("watchlistGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const group = await ctx.db.get(args.groupId);
    if (!group || group.userId !== user._id) throw new Error("Watchlist group not found");
    if (group.isDefault) throw new Error("Cannot delete default watchlist");

    const watchlistItems = await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", args.groupId))
      .collect();

    const coinIds = Array.from(new Set(watchlistItems.map((item) => item.coinId)));
    await Promise.all(watchlistItems.map((item) => ctx.db.delete(item._id)));

    await Promise.all(
      coinIds.map(async (coinId) => {
        const remaining = await ctx.db
          .query("watchlists")
          .withIndex("by_coin", (q) => q.eq("coinId", coinId))
          .first();
        if (remaining) return;
        await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
          coingeckoId: coinId,
          reason: "watchlist",
        });
      }),
    );

    await ctx.db.delete(args.groupId);
    return null;
  },
});

export const getMyDefaultWatchlist = query({
  args: {},
  returns: v.array(watchlistItemValidator),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const defaultGroup = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
      .first();
    if (!defaultGroup) return [];

    return await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", defaultGroup._id))
      .collect();
  },
});

export const getMyWatchlistByGroup = query({
  args: { groupId: v.id("watchlistGroups") },
  returns: v.array(watchlistItemValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const group = await ctx.db.get(args.groupId);
    if (!group || group.userId !== user._id) return [];

    return await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", args.groupId))
      .collect();
  },
});

export const getMyWatchlistBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      group: watchlistGroupValidator,
      items: v.array(watchlistItemValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const group = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", args.slug))
      .first();
    if (!group) return null;

    const items = await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", group._id))
      .collect();

    return { group, items };
  },
});

export const getMyAllWatchlistCoinIds = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const items = await ctx.db
      .query("watchlists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const unique = Array.from(new Set(items.map((item) => item.coinId))).filter((id) => id.length > 0);
    unique.sort();
    return unique;
  },
});

export const addToMyWatchlist = mutation({
  args: { coinId: v.string(), groupId: v.optional(v.id("watchlistGroups")) },
  returns: v.id("watchlists"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    let targetGroupId = args.groupId;
    if (!targetGroupId) {
      const defaultGroup = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
        .first();

      if (!defaultGroup) {
        const now = Date.now();
        targetGroupId = await ctx.db.insert("watchlistGroups", {
          userId: user._id,
          name: "My Watchlist",
          slug: "my-watchlist",
          description: "Default watchlist",
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        targetGroupId = defaultGroup._id;
      }
    }

    const group = await ctx.db.get(targetGroupId);
    if (!group || group.userId !== user._id) throw new Error("Watchlist group not found");

    const existing = await ctx.db
      .query("watchlists")
      .withIndex("by_group_coin", (q) => q.eq("watchlistGroupId", targetGroupId).eq("coinId", args.coinId))
      .first();
    if (existing) return existing._id;

    const id = await ctx.db.insert("watchlists", {
      userId: user._id,
      watchlistGroupId: targetGroupId,
      coinId: args.coinId,
    });

    await ctx.runMutation(internal.coingeckoState._touchTrackedCoin, {
      coingeckoId: args.coinId,
      reason: "watchlist",
      lastSeen: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshMarketsByIds, {
      coingeckoIds: [args.coinId],
    });
    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshSingleMarketChart, {
      coingeckoId: args.coinId,
      days: "7",
    });
    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshSingleMarketChart, {
      coingeckoId: args.coinId,
      days: "1",
    });
    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshSingleOhlc, {
      coingeckoId: args.coinId,
      days: "1",
    });

    return id;
  },
});

export const removeFromMyWatchlist = mutation({
  args: { coinId: v.string(), groupId: v.optional(v.id("watchlistGroups")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    let targetGroupId = args.groupId;
    if (!targetGroupId) {
      const defaultGroup = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
        .first();
      if (!defaultGroup) return null;
      targetGroupId = defaultGroup._id;
    }

    const row = await ctx.db
      .query("watchlists")
      .withIndex("by_group_coin", (q) => q.eq("watchlistGroupId", targetGroupId).eq("coinId", args.coinId))
      .first();
    if (!row) return null;

    await ctx.db.delete(row._id);

    const remaining = await ctx.db
      .query("watchlists")
      .withIndex("by_coin", (q) => q.eq("coinId", args.coinId))
      .first();
    if (!remaining) {
      await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
        coingeckoId: args.coinId,
        reason: "watchlist",
      });
    }

    return null;
  },
});

export const removeBulkFromMyWatchlist = mutation({
  args: { coinIds: v.array(v.string()), groupId: v.optional(v.id("watchlistGroups")) },
  returns: v.object({ removedCount: v.number() }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { removedCount: 0 };

    let targetGroupId = args.groupId;
    if (!targetGroupId) {
      const defaultGroup = await ctx.db
        .query("watchlistGroups")
        .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
        .first();
      if (!defaultGroup) return { removedCount: 0 };
      targetGroupId = defaultGroup._id;
    }

    const uniqueCoinIds = Array.from(new Set(args.coinIds)).filter((id) => id.length > 0);
    if (uniqueCoinIds.length === 0) return { removedCount: 0 };

    const rows = await Promise.all(
      uniqueCoinIds.map((coinId) =>
        ctx.db
          .query("watchlists")
          .withIndex("by_group_coin", (q) => q.eq("watchlistGroupId", targetGroupId!).eq("coinId", coinId))
          .first(),
      ),
    );

    const toDelete = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    await Promise.all(toDelete.map((r) => ctx.db.delete(r._id)));

    await Promise.all(
      uniqueCoinIds.map(async (coinId) => {
        const remaining = await ctx.db
          .query("watchlists")
          .withIndex("by_coin", (q) => q.eq("coinId", coinId))
          .first();
        if (remaining) return;
        await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
          coingeckoId: coinId,
          reason: "watchlist",
        });
      }),
    );

    return { removedCount: toDelete.length };
  },
});

export const removeFromAllMyWatchlists = mutation({
  args: { coinId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const rows = await ctx.db
      .query("watchlists")
      .withIndex("by_user_coin", (q) => q.eq("userId", user._id).eq("coinId", args.coinId))
      .collect();
    if (rows.length === 0) return null;

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    const remaining = await ctx.db
      .query("watchlists")
      .withIndex("by_coin", (q) => q.eq("coinId", args.coinId))
      .first();
    if (!remaining) {
      await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
        coingeckoId: args.coinId,
        reason: "watchlist",
      });
    }

    return null;
  },
});

export const removeBulkFromAllMyWatchlists = mutation({
  args: { coinIds: v.array(v.string()) },
  returns: v.object({ removedCount: v.number() }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { removedCount: 0 };

    const uniqueCoinIds = Array.from(new Set(args.coinIds)).filter((id) => id.length > 0);
    if (uniqueCoinIds.length === 0) return { removedCount: 0 };

    const removedByCoin = await Promise.all(
      uniqueCoinIds.map(async (coinId) => {
        const rows = await ctx.db
          .query("watchlists")
          .withIndex("by_user_coin", (q) => q.eq("userId", user._id).eq("coinId", coinId))
          .collect();
        if (rows.length === 0) return { coinId, removed: 0 };
        await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
        return { coinId, removed: rows.length };
      }),
    );

    const removedCount = removedByCoin.reduce((sum, row) => sum + row.removed, 0);

    await Promise.all(
      removedByCoin
        .filter((row) => row.removed > 0)
        .map(async ({ coinId }) => {
          const remaining = await ctx.db
            .query("watchlists")
            .withIndex("by_coin", (q) => q.eq("coinId", coinId))
            .first();
          if (remaining) return;
          await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
            coingeckoId: coinId,
            reason: "watchlist",
          });
        }),
    );

    return { removedCount };
  },
});

export const getMyWatchlistBootstrap = query({
  args: {},
  returns: v.object({
    groups: v.array(watchlistGroupValidator),
    defaultGroup: v.union(watchlistGroupValidator, v.null()),
    defaultItems: v.array(watchlistItemValidator),
    allCoinIds: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const groups = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const defaultGroup = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
      .first();

    const defaultItems = defaultGroup
      ? await ctx.db
          .query("watchlists")
          .withIndex("by_group", (q) => q.eq("watchlistGroupId", defaultGroup._id))
          .collect()
      : [];

    const items = await ctx.db
      .query("watchlists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const allCoinIds = Array.from(new Set(items.map((item) => item.coinId))).filter((id) => id.length > 0);
    allCoinIds.sort();

    return {
      groups,
      defaultGroup: defaultGroup ?? null,
      defaultItems,
      allCoinIds,
    };
  },
});