import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get user's wallets
export const getUserWallets = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("wallets")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// Get user's primary wallet (first active wallet)
export const getPrimaryWallet = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("wallets")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
  },
});

// Store wallet association when wallet is created
export const storeWallet = mutation({
  args: {
    clerkId: v.string(),
    walletAddress: v.string(),
    chain: v.string(),
    crossmintWalletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // First find the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if wallet already exists
    const existingWallet = await ctx.db
      .query("wallets")
      .withIndex("by_address", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (existingWallet) {
      // Update existing wallet
      await ctx.db.patch(existingWallet._id, {
        lastUsed: Date.now(),
        isActive: true,
      });
      return existingWallet._id;
    }

    // Create new wallet record
    const walletId = await ctx.db.insert("wallets", {
      userId: user._id,
      clerkId: args.clerkId,
      walletAddress: args.walletAddress,
      chain: args.chain,
      walletProvider: "crossmint",
      crossmintWalletId: args.crossmintWalletId,
      isActive: true,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    });

    return walletId;
  },
});

// Update wallet last used timestamp
export const updateWalletLastUsed = mutation({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_address", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (wallet) {
      await ctx.db.patch(wallet._id, {
        lastUsed: Date.now(),
      });
    }
  },
}); 