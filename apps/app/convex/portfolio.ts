import { v } from "convex/values";
import { action, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";
import { internal } from "./_generated/api";
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

function formatAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-6)}`;
}

function buildOverviewSnapshotCacheKey(clerkId: string): string {
  return `overview:watchlist:snapshot:v4:${clerkId}`;
}

async function markOverviewSnapshotStale(ctx: MutationCtx, clerkId: string) {
  const keys = [
    buildOverviewSnapshotCacheKey(clerkId),
    `overview:dailyBrief:${clerkId}:watchlist:24h`,
    `overview:dailyBrief:${clerkId}:watchlist:7d`,
  ];

  for (const cacheKey of keys) {
    const existing = await ctx.db
      .query("apiCache")
      .withIndex("by_key", (q) => q.eq("cacheKey", cacheKey))
      .first();
    if (!existing) continue;
    await ctx.db.patch(existing._id, { expiresAt: 0 });
  }
}

async function markMyOverviewSnapshotStale(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return;
  await markOverviewSnapshotStale(ctx, identity.subject);
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);
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

export const previewPortfolioWalletCandidates = action({
  args: { serverToken: v.string(), walletAddress: v.string() },
  returns: v.object({
    candidates: v.array(
      v.object({
        mint: v.string(),
        coingeckoId: v.string(),
      }),
    ),
    unresolvedCount: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ candidates: Array<{ mint: string; coingeckoId: string }>; unresolvedCount: number }> => {
    requireServerToken(args.serverToken);
    const result: { candidates: Array<{ mint: string; coingeckoId: string }>; unresolvedCount: number } =
      await ctx.runAction(internal.portfolioJobs.previewWalletCandidates, {
      walletAddress: args.walletAddress,
    });
    return result;
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

    return walletId;
  },
});

export const upsertPortfolioWalletSelection = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    address: v.string(),
    name: v.optional(v.string()),
    selected: v.array(
      v.object({
        mint: v.string(),
        coingeckoId: v.string(),
      }),
    ),
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

    const diff = await ctx.runMutation(internal.portfolioJobs._reconcileWalletCoins, {
      walletId,
      userId,
      next: args.selected,
      syncedAt: now,
      syncError: null,
    });

    await ctx.runMutation(internal.portfolioJobs._touchTrackedCoinsForPortfolio, {
      coingeckoIds: diff.nextCoingeckoIds,
      removedCoingeckoIds: diff.removedCoingeckoIds,
    });

    // Mirror this wallet as a watchlist group so Watchlist + Comparison can render it.
    // This intentionally keeps wallets and watchlists aligned in the UI layer.
    const displayName = (args.name?.trim() || existing?.name || "").trim() || formatAddress(address);

    const existingGroup = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_and_portfolio_wallet", (q) =>
        q.eq("userId", userId).eq("portfolioWalletId", walletId),
      )
      .first();

    let groupId: Id<"watchlistGroups">;
    let createdBaseSlug: string | null = null;

    if (existingGroup) {
      groupId = existingGroup._id;
      // Keep the card label fresh when wallet name changes (but keep slug stable).
      await ctx.db.patch(existingGroup._id, {
        name: `Wallet: ${displayName}`,
        updatedAt: now,
      });
    } else {
      // Create a stable slug once; avoid changing it later so URL selection (`wg`) doesn't break.
      let baseSlug = generateSlug(displayName);
      if (!baseSlug) baseSlug = "wallet";
      createdBaseSlug = baseSlug;

      groupId = await ctx.db.insert("watchlistGroups", {
        userId,
        name: `Wallet: ${displayName}`,
        slug: baseSlug, // final uniqueness adjustment below
        description: `Wallet ${formatAddress(address)}`,
        icon: "bookmark",
        color: "default",
        portfolioWalletId: walletId,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    // If we created a new group above, ensure the slug is unique for this user by patching if needed.
    if (!existingGroup && createdBaseSlug) {
      const group = await ctx.db.get(groupId);
      if (group) {
        let slug = group.slug;
        let counter = 1;
        while (true) {
          const found = await ctx.db
            .query("watchlistGroups")
            .withIndex("by_user_slug", (q) => q.eq("userId", userId).eq("slug", slug))
            .first();
          if (!found || found._id === groupId) break;
          slug = `${createdBaseSlug}-${counter}`;
          counter += 1;
        }
        if (slug !== group.slug) {
          await ctx.db.patch(groupId, { slug });
        }
      }
    }

    // Reconcile watchlist items for this wallet-backed group to match the selected CoinGecko IDs.
    const nextIds = Array.from(
      new Set(args.selected.map((row) => row.coingeckoId.trim()).filter((id) => id.length > 0)),
    );
    nextIds.sort();

    const existingItems = await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", groupId))
      .collect();

    const existingByCoinId = new Map<string, Id<"watchlists">>();
    for (const item of existingItems) {
      existingByCoinId.set(item.coinId, item._id);
    }

    // Insert missing items (idempotent via index check).
    for (const coinId of nextIds) {
      if (existingByCoinId.has(coinId)) continue;
      const already = await ctx.db
        .query("watchlists")
        .withIndex("by_group_coin", (q) => q.eq("watchlistGroupId", groupId).eq("coinId", coinId))
        .first();
      if (already) continue;
      await ctx.db.insert("watchlists", {
        userId,
        watchlistGroupId: groupId,
        coinId,
      });
    }

    // Delete removed items.
    const nextSet = new Set(nextIds);
    for (const item of existingItems) {
      if (nextSet.has(item.coinId)) continue;
      await ctx.db.delete(item._id);
    }

    await markOverviewSnapshotStale(ctx, args.clerkId);
    return walletId;
  },
});

export const deletePortfolioWallet = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    walletId: v.id("portfolioWallets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    if (!userId) return null;

    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) return null;
    if (wallet.userId !== userId) return null;

    const walletCoins = await ctx.db
      .query("portfolioWalletCoins")
      .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId))
      .collect();

    const removedCoingeckoIds = Array.from(new Set(walletCoins.map((row) => row.coingeckoId)));

    await Promise.all(walletCoins.map((row) => ctx.db.delete(row._id)));

    // Delete the mirrored wallet-backed watchlist group (and its items), if present.
    const walletGroup = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_and_portfolio_wallet", (q) =>
        q.eq("userId", userId).eq("portfolioWalletId", args.walletId),
      )
      .first();

    if (walletGroup) {
      const watchlistItems = await ctx.db
        .query("watchlists")
        .withIndex("by_group", (q) => q.eq("watchlistGroupId", walletGroup._id))
        .collect();

      const watchlistCoinIds = Array.from(new Set(watchlistItems.map((row) => row.coinId)));

      await Promise.all(watchlistItems.map((row) => ctx.db.delete(row._id)));

      // Remove global watchlist tracking when the coin is no longer watched by anyone.
      await Promise.all(
        watchlistCoinIds.map(async (coinId) => {
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

      await ctx.db.delete(walletGroup._id);
    }

    await ctx.db.delete(args.walletId);

    // Remove portfolio tracking reason for coins no longer tracked by any wallet.
    await ctx.runMutation(internal.portfolioJobs._touchTrackedCoinsForPortfolio, {
      coingeckoIds: [],
      removedCoingeckoIds,
    });

    await markOverviewSnapshotStale(ctx, args.clerkId);
    return null;
  },
});

async function getAuthedUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user._id;
}

export const listMyPortfolioWallets = query({
  args: {},
  returns: v.array(walletValidator),
  handler: async (ctx) => {
    const userId = await getAuthedUserId(ctx);

    return await ctx.db
      .query("portfolioWallets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getMyPortfolioWalletCoinIds = query({
  args: { walletId: v.id("portfolioWallets") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const userId = await getAuthedUserId(ctx);

    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.userId !== userId) return [];

    const rows = await ctx.db
      .query("portfolioWalletCoins")
      .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId))
      .collect();
    return rows.map((r) => r.coingeckoId);
  },
});

export const previewMyPortfolioWalletCandidates = action({
  args: { walletAddress: v.string() },
  returns: v.object({
    candidates: v.array(
      v.object({
        mint: v.string(),
        coingeckoId: v.string(),
      }),
    ),
    unresolvedCount: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ candidates: Array<{ mint: string; coingeckoId: string }>; unresolvedCount: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const result: { candidates: Array<{ mint: string; coingeckoId: string }>; unresolvedCount: number } =
      await ctx.runAction(internal.portfolioJobs.previewWalletCandidates, {
        walletAddress: args.walletAddress,
      });
    return result;
  },
});

export const upsertMyPortfolioWalletSelection = mutation({
  args: {
    address: v.string(),
    name: v.optional(v.string()),
    selected: v.array(
      v.object({
        mint: v.string(),
        coingeckoId: v.string(),
      }),
    ),
  },
  returns: v.id("portfolioWallets"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = await getUserIdByClerkId(ctx, identity.subject);
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

    const diff = await ctx.runMutation(internal.portfolioJobs._reconcileWalletCoins, {
      walletId,
      userId,
      next: args.selected,
      syncedAt: now,
      syncError: null,
    });

    await ctx.runMutation(internal.portfolioJobs._touchTrackedCoinsForPortfolio, {
      coingeckoIds: diff.nextCoingeckoIds,
      removedCoingeckoIds: diff.removedCoingeckoIds,
    });

    const displayName = (args.name?.trim() || existing?.name || "").trim() || formatAddress(address);

    const existingGroup = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_and_portfolio_wallet", (q) =>
        q.eq("userId", userId).eq("portfolioWalletId", walletId),
      )
      .first();

    let groupId: Id<"watchlistGroups">;
    let createdBaseSlug: string | null = null;

    if (existingGroup) {
      groupId = existingGroup._id;
      await ctx.db.patch(existingGroup._id, {
        name: `Wallet: ${displayName}`,
        updatedAt: now,
      });
    } else {
      let baseSlug = generateSlug(displayName);
      if (!baseSlug) baseSlug = "wallet";
      createdBaseSlug = baseSlug;

      groupId = await ctx.db.insert("watchlistGroups", {
        userId,
        name: `Wallet: ${displayName}`,
        slug: baseSlug,
        description: `Wallet ${formatAddress(address)}`,
        icon: "bookmark",
        color: "default",
        portfolioWalletId: walletId,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (!existingGroup && createdBaseSlug) {
      const group = await ctx.db.get(groupId);
      if (group) {
        let slug = group.slug;
        let counter = 1;
        while (true) {
          const found = await ctx.db
            .query("watchlistGroups")
            .withIndex("by_user_slug", (q) => q.eq("userId", userId).eq("slug", slug))
            .first();
          if (!found || found._id === groupId) break;
          slug = `${createdBaseSlug}-${counter}`;
          counter += 1;
        }
        if (slug !== group.slug) await ctx.db.patch(groupId, { slug });
      }
    }

    const nextIds = Array.from(
      new Set(args.selected.map((row) => row.coingeckoId.trim()).filter((id) => id.length > 0)),
    );
    nextIds.sort();

    const existingItems = await ctx.db
      .query("watchlists")
      .withIndex("by_group", (q) => q.eq("watchlistGroupId", groupId))
      .collect();

    const existingByCoinId = new Map<string, Id<"watchlists">>();
    for (const item of existingItems) existingByCoinId.set(item.coinId, item._id);

    for (const coinId of nextIds) {
      if (existingByCoinId.has(coinId)) continue;
      const already = await ctx.db
        .query("watchlists")
        .withIndex("by_group_coin", (q) => q.eq("watchlistGroupId", groupId).eq("coinId", coinId))
        .first();
      if (already) continue;
      await ctx.db.insert("watchlists", {
        userId,
        watchlistGroupId: groupId,
        coinId,
      });
    }

    const nextSet = new Set(nextIds);
    for (const item of existingItems) {
      if (nextSet.has(item.coinId)) continue;
      await ctx.db.delete(item._id);
    }

    await markMyOverviewSnapshotStale(ctx);
    return walletId;
  },
});

export const deleteMyPortfolioWallet = mutation({
  args: { walletId: v.id("portfolioWallets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthedUserId(ctx);

    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) return null;
    if (wallet.userId !== userId) return null;

    const walletCoins = await ctx.db
      .query("portfolioWalletCoins")
      .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId))
      .collect();

    const removedCoingeckoIds = Array.from(new Set(walletCoins.map((row) => row.coingeckoId)));

    await Promise.all(walletCoins.map((row) => ctx.db.delete(row._id)));

    const walletGroup = await ctx.db
      .query("watchlistGroups")
      .withIndex("by_user_and_portfolio_wallet", (q) =>
        q.eq("userId", userId).eq("portfolioWalletId", args.walletId),
      )
      .first();

    if (walletGroup) {
      const watchlistItems = await ctx.db
        .query("watchlists")
        .withIndex("by_group", (q) => q.eq("watchlistGroupId", walletGroup._id))
        .collect();

      const watchlistCoinIds = Array.from(new Set(watchlistItems.map((row) => row.coinId)));
      await Promise.all(watchlistItems.map((row) => ctx.db.delete(row._id)));

      await Promise.all(
        watchlistCoinIds.map(async (coinId) => {
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

      await ctx.db.delete(walletGroup._id);
    }

    await ctx.db.delete(args.walletId);

    await ctx.runMutation(internal.portfolioJobs._touchTrackedCoinsForPortfolio, {
      coingeckoIds: [],
      removedCoingeckoIds,
    });

    await markMyOverviewSnapshotStale(ctx);
    return null;
  },
});
