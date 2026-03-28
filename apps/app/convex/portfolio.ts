import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";
import { internal } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const walletValidator = v.object({
  _id: v.id("portfolioWallets"),
  _creationTime: v.number(),
  userId: v.id("users"),
  address: v.string(),
  name: v.optional(v.string()),
  isActive: v.boolean(),
  lastSyncedAt: v.optional(v.number()),
  lastSyncError: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const walletCoinValidator = v.object({
  _id: v.id("portfolioWalletCoins"),
  _creationTime: v.number(),
  userId: v.id("users"),
  walletId: v.id("portfolioWallets"),
  coingeckoId: v.string(),
  mint: v.string(),
  createdAt: v.number(),
});

function normalizeWalletAddress(address: string): string {
  return address.trim();
}

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

async function getUserIdByClerkId(
  ctx: QueryCtx,
  clerkId: string,
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
  return user?._id ?? null;
}

export const listPortfolioWallets = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: v.array(walletValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    if (!userId) return [];

    return await ctx.db
      .query("portfolioWallets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const listPortfolioWalletCoins = query({
  args: { serverToken: v.string(), clerkId: v.string(), walletId: v.id("portfolioWallets") },
  returns: v.array(walletCoinValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    if (!userId) return [];

    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.userId !== userId) return [];

    return await ctx.db
      .query("portfolioWalletCoins")
      .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId))
      .order("desc")
      .collect();
  },
});

export const getPortfolioWalletCoinIds = query({
  args: { serverToken: v.string(), clerkId: v.string(), walletId: v.id("portfolioWallets") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    if (!userId) return [];

    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.userId !== userId) return [];

    const rows = await ctx.db
      .query("portfolioWalletCoins")
      .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId))
      .collect();
    return rows.map((r) => r.coingeckoId);
  },
});

export const addPortfolioWallet = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    address: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.id("portfolioWallets"),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    if (!userId) throw new Error("User not found");

    const address = normalizeWalletAddress(args.address);
    if (!isValidSolanaAddress(address)) throw new Error("Invalid wallet address");

    const now = Date.now();

    const existing = await ctx.db
      .query("portfolioWallets")
      .withIndex("by_user_address", (q) => q.eq("userId", userId).eq("address", address))
      .first();

    const walletId = existing
      ? existing._id
      : await ctx.db.insert("portfolioWallets", {
          userId,
          address,
          name: args.name?.trim() || undefined,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name?.trim() || existing.name,
        isActive: true,
        updatedAt: now,
      });
    }

    // Kick off an initial sync right away so the UI gets data quickly.
    await ctx.scheduler.runAfter(0, internal.portfolioJobs.syncWallet, { walletId });
    return walletId;
  },
});

