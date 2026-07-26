import { v } from "convex/values";
import { getUserByClerkId } from "./_lib/user_lookup";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

function uniqStrings(values: ReadonlyArray<string>): Array<string> {
  const out: Array<string> = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export const refreshMyDataNow = mutation({
  args: {
    // If true, forces wallet sync even if recently synced.
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    scheduled: v.boolean(),
    reason: v.string(),
    coinsCount: v.number(),
    walletsCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await getUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const now = Date.now();
    const jobKey = `refresh:user:${user._id}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < REFRESH_COOLDOWN_MS) {
      return { scheduled: false, reason: "cooldown", coinsCount: 0, walletsCount: 0 };
    }

    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
    } else {
      await ctx.db.insert("jobState", {
        jobKey,
        cursor: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [watchlistRows, portfolioRows] = await Promise.all([
      ctx.db
        .query("watchlists")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("portfolioWalletCoins")
        .withIndex("by_user_wallet", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    const coinIds = uniqStrings([
      ...watchlistRows.map((row) => row.coinId),
      ...portfolioRows.map((row) => row.coingeckoId),
    ]);

    const wallets = await ctx.db
      .query("portfolioWallets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const activeWalletIds = wallets.flatMap((w) =>
      w.isActive ? [w._id as Id<"portfolioWallets">] : [],
    );

    // Refresh markets first so the UI has updated quotes even before wallet sync finishes.
    if (coinIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshMarketsByIds, {
        coingeckoIds: coinIds.slice(0, 1000),
      });
    }

    const isForce = args.force === true;
    await Promise.all(
      activeWalletIds.map((walletId) =>
        ctx.scheduler.runAfter(0, internal.portfolioJobs.syncWallet, {
          walletId,
          force: isForce,
        }),
      ),
    );

    return {
      scheduled: true,
      reason: "scheduled",
      coinsCount: coinIds.length,
      walletsCount: activeWalletIds.length,
    };
  },
});

