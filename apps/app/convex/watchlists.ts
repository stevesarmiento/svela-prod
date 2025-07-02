import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Watchlist Group functions
export const getWatchlistGroups = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
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
    clerkId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateWatchlistGroup = mutation({
  args: {
    clerkId: v.string(),
    groupId: v.id("watchlistGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    const group = await ctx.db.get(args.groupId);
    if (!group || group.userId !== user._id) {
      throw new Error("Watchlist group not found");
    }

    const updates: { 
      updatedAt: number;
      name?: string;
      slug?: string;
      description?: string;
    } = { updatedAt: Date.now() };
    
    if (args.name !== undefined) {
      updates.name = args.name;
      
      // Generate new slug if name is changing
      if (args.name !== group.name) {
        let baseSlug = generateSlug(args.name);
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

    await ctx.db.patch(args.groupId, updates);
  },
});

export const deleteWatchlistGroup = mutation({
  args: {
    clerkId: v.string(),
    groupId: v.id("watchlistGroups"),
  },
  handler: async (ctx, args) => {
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

    await Promise.all(
      watchlistItems.map(item => ctx.db.delete(item._id))
    );

    // Delete the group
    await ctx.db.delete(args.groupId);
  },
});

// Legacy function - get default watchlist (backward compatibility)
export const getWatchlist = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
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

    if (!defaultGroup) return [];

    return await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", defaultGroup._id))
      .collect();
  },
});

// Get watchlist for specific group by ID
export const getWatchlistByGroup = query({
  args: { 
    clerkId: v.string(),
    groupId: v.id("watchlistGroups"),
  },
  handler: async (ctx, args) => {
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
    clerkId: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
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
    clerkId: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
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

export const addToWatchlist = mutation({
  args: {
    clerkId: v.string(),
    coinId: v.string(),
    groupId: v.optional(v.id("watchlistGroups")),
  },
  handler: async (ctx, args) => {
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

    return await ctx.db.insert("watchlists", {
      userId: user._id,
      watchlistGroupId: targetGroupId,
      coinId: args.coinId,
    });
  },
});

export const removeFromWatchlist = mutation({
  args: {
    clerkId: v.string(),
    coinId: v.string(),
    groupId: v.optional(v.id("watchlistGroups")),
  },
  handler: async (ctx, args) => {
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
  },
});

export const removeBulkFromWatchlist = mutation({
  args: {
    clerkId: v.string(),
    coinIds: v.array(v.string()),
    groupId: v.optional(v.id("watchlistGroups")),
  },
  handler: async (ctx, args) => {
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

    // Find all watchlist items for the given coins in this group
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

    return { removedCount: validItems.length };
  },
});