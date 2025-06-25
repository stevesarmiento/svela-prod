import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getWatchlist = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) return [];

    return await ctx.db
      .query("watchlists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const addToWatchlist = mutation({
  args: {
    clerkId: v.string(),
    coinId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    // Check if already in watchlist
    const existing = await ctx.db
      .query("watchlists")
      .withIndex("by_user_coin", (q) => 
        q.eq("userId", user._id).eq("coinId", args.coinId)
      )
      .first();

    if (existing) throw new Error("Already in watchlist");

    return await ctx.db.insert("watchlists", {
      userId: user._id,
      coinId: args.coinId,
    });
  },
});

export const removeFromWatchlist = mutation({
  args: {
    clerkId: v.string(),
    coinId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    const watchlistItem = await ctx.db
      .query("watchlists")
      .withIndex("by_user_coin", (q) => 
        q.eq("userId", user._id).eq("coinId", args.coinId)
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
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) throw new Error("User not found");

    // Find all watchlist items for the given coins
    const watchlistItems = await Promise.all(
      args.coinIds.map(coinId =>
        ctx.db
          .query("watchlists")
          .withIndex("by_user_coin", (q) => 
            q.eq("userId", user._id).eq("coinId", coinId)
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