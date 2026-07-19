import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { getUserByClerkId } from "./_lib/user_lookup";

/**
 * Internal admin stats dashboard queries.
 *
 * Access is gated by the ADMIN_EMAILS env var (comma-separated email
 * allowlist, set via `bunx convex env set ADMIN_EMAILS "a@b.com,c@d.com"`).
 * Fails closed: missing env var, unauthenticated caller, or a caller whose
 * email is not on the list all get `null` back instead of stats.
 */

const SCAN_CAP = 4096;
const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNUP_DAYS = 30;
const MAX_WATCHLIST_USER_ROWS = 200;

function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await getUserByClerkId(ctx.db, identity.subject);
  const email = user?.email?.trim().toLowerCase();
  if (!email) return null;
  return parseAdminEmails().has(email) ? user : null;
}

function utcDayIso(timestampMs: number): string {
  return new Date(Math.floor(timestampMs / DAY_MS) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

const watchlistUserValidator = v.object({
  fullName: v.optional(v.string()),
  email: v.optional(v.string()),
  walletAddress: v.optional(v.string()),
  signedUpAt: v.number(),
  groupCount: v.number(),
  groups: v.array(v.object({ name: v.string(), tokens: v.number() })),
  tokensWatched: v.number(),
  holdingsCount: v.number(),
  holdings: v.array(v.object({ coinId: v.string(), amount: v.number() })),
  analyzeCount: v.number(),
  analyzeLastAt: v.optional(v.number()),
  screenerCount: v.number(),
  screenerLastAt: v.optional(v.number()),
});

export const getAdminDashboardStats = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      generatedAt: v.number(),
      userGrowth: v.object({
        totalUsers: v.number(),
        capped: v.boolean(),
        signupsByDay: v.array(v.object({ day: v.string(), count: v.number() })),
        recentSignups: v.array(
          v.object({
            email: v.optional(v.string()),
            fullName: v.optional(v.string()),
            walletAddress: v.optional(v.string()),
            createdAt: v.number(),
          }),
        ),
      }),
      adoption: v.object({
        watchlistGroups: v.object({
          total: v.number(),
          users: v.number(),
          capped: v.boolean(),
        }),
        wallets: v.object({
          total: v.number(),
          active: v.number(),
          users: v.number(),
          withSyncError: v.number(),
          capped: v.boolean(),
        }),
        holdings: v.object({
          rows: v.number(),
          users: v.number(),
          capped: v.boolean(),
        }),
      }),
      watchlistUsers: v.object({
        rows: v.array(watchlistUserValidator),
        totalUsersWithWatchlists: v.number(),
        truncated: v.boolean(),
      }),
      coins: v.object({
        topWatched: v.array(
          v.object({
            coinId: v.string(),
            name: v.optional(v.string()),
            symbol: v.optional(v.string()),
            watchers: v.number(),
          }),
        ),
        watchlistRows: v.number(),
        watchlistRowsCapped: v.boolean(),
        trackedByReason: v.array(
          v.object({ reason: v.string(), count: v.number() }),
        ),
        trackedCapped: v.boolean(),
      }),
      aiHealth: v.object({
        total7d: v.number(),
        total30d: v.number(),
        bySurface: v.array(
          v.object({
            surface: v.string(),
            count7d: v.number(),
            count30d: v.number(),
          }),
        ),
        byErrorType: v.array(
          v.object({
            errorType: v.string(),
            count7d: v.number(),
            count30d: v.number(),
          }),
        ),
        byConfidenceBucket: v.array(
          v.object({ bucket: v.string(), count: v.number() }),
        ),
        capped: v.boolean(),
      }),
    }),
  ),
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    if (!admin) return null;

    const now = Date.now();

    // --- Raw scans (capped) --------------------------------------------------
    const users = await ctx.db.query("users").take(SCAN_CAP);
    const watchlistGroups = await ctx.db
      .query("watchlistGroups")
      .take(SCAN_CAP);
    const watchlistRows = await ctx.db.query("watchlists").take(SCAN_CAP);
    const wallets = await ctx.db.query("portfolioWallets").take(SCAN_CAP);
    const holdings = await ctx.db.query("coinHoldings").take(SCAN_CAP);
    const aiUsage = await ctx.db.query("aiFeatureUsage").take(SCAN_CAP);
    const trackedCoins = await ctx.db.query("trackedCoins").take(SCAN_CAP);

    // Wallet fallback: first connected wallet address per user, for users
    // who signed up via a Solana wallet and have no email/name.
    const walletByUser = new Map<Id<"users">, string>();
    for (const wallet of wallets) {
      if (!walletByUser.has(wallet.userId)) {
        walletByUser.set(wallet.userId, wallet.address);
      }
    }

    // --- User growth ---------------------------------------------------------
    const dayCounts = new Map<string, number>();
    for (let i = SIGNUP_DAYS - 1; i >= 0; i--) {
      dayCounts.set(utcDayIso(now - i * DAY_MS), 0);
    }
    const windowStart = now - SIGNUP_DAYS * DAY_MS;
    for (const user of users) {
      if (user._creationTime < windowStart) continue;
      const day = utcDayIso(user._creationTime);
      if (dayCounts.has(day)) {
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
    }
    const signupsByDay = Array.from(dayCounts.entries()).map(
      ([day, count]) => ({ day, count }),
    );

    const recentSignups = [...users]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 10)
      .map((user) => ({
        email: user.email,
        fullName: user.fullName,
        walletAddress: user.walletAddress ?? walletByUser.get(user._id),
        createdAt: user._creationTime,
      }));

    // --- Per-user watchlist detail --------------------------------------------
    const groupsByUser = new Map<Id<"users">, Doc<"watchlistGroups">[]>();
    for (const group of watchlistGroups) {
      const list = groupsByUser.get(group.userId) ?? [];
      list.push(group);
      groupsByUser.set(group.userId, list);
    }

    const tokensByUser = new Map<Id<"users">, Set<string>>();
    const tokensByGroup = new Map<Id<"watchlistGroups">, number>();
    for (const row of watchlistRows) {
      const set = tokensByUser.get(row.userId) ?? new Set<string>();
      set.add(row.coinId);
      tokensByUser.set(row.userId, set);
      tokensByGroup.set(
        row.watchlistGroupId,
        (tokensByGroup.get(row.watchlistGroupId) ?? 0) + 1,
      );
    }

    const MAX_HOLDINGS_PER_USER = 30;
    const holdingsByUser = new Map<
      Id<"users">,
      Array<{ coinId: string; amount: number }>
    >();
    for (const holding of holdings) {
      if (holding.holdings > 0) {
        const list = holdingsByUser.get(holding.userId) ?? [];
        if (list.length < MAX_HOLDINGS_PER_USER) {
          list.push({ coinId: holding.coinId, amount: holding.holdings });
        }
        holdingsByUser.set(holding.userId, list);
      }
    }

    const aiUsageByUser = new Map<
      Id<"users">,
      Map<string, { count: number; lastUsedAt: number }>
    >();
    for (const usage of aiUsage) {
      const perFeature =
        aiUsageByUser.get(usage.userId) ??
        new Map<string, { count: number; lastUsedAt: number }>();
      perFeature.set(usage.feature, {
        count: usage.count,
        lastUsedAt: usage.lastUsedAt,
      });
      aiUsageByUser.set(usage.userId, perFeature);
    }

    const usersById = new Map(users.map((user) => [user._id, user]));
    const watchlistUserRows = Array.from(groupsByUser.entries())
      .map(([userId, groups]) => {
        const user = usersById.get(userId);
        const usage = aiUsageByUser.get(userId);
        const analyze = usage?.get("analyze");
        const screener = usage?.get("screener_search");
        const userHoldings = holdingsByUser.get(userId) ?? [];
        return {
          fullName: user?.fullName,
          email: user?.email,
          walletAddress: user?.walletAddress ?? walletByUser.get(userId),
          signedUpAt: user?._creationTime ?? 0,
          groupCount: groups.length,
          groups: groups
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((g) => ({
              name: g.name,
              tokens: tokensByGroup.get(g._id) ?? 0,
            })),
          tokensWatched: tokensByUser.get(userId)?.size ?? 0,
          holdingsCount: userHoldings.length,
          holdings: [...userHoldings].sort((a, b) => b.amount - a.amount),
          analyzeCount: analyze?.count ?? 0,
          analyzeLastAt: analyze?.lastUsedAt,
          screenerCount: screener?.count ?? 0,
          screenerLastAt: screener?.lastUsedAt,
        };
      })
      .sort((a, b) => b.tokensWatched - a.tokensWatched);

    // --- Coin engagement -------------------------------------------------------
    const watchersByCoin = new Map<string, Set<string>>();
    for (const row of watchlistRows) {
      const watchers = watchersByCoin.get(row.coinId) ?? new Set<string>();
      watchers.add(row.userId);
      watchersByCoin.set(row.coinId, watchers);
    }
    const topWatchedIds = Array.from(watchersByCoin.entries())
      .map(([coinId, watchers]) => ({ coinId, watchers: watchers.size }))
      .sort((a, b) => b.watchers - a.watchers)
      .slice(0, 10);

    const topWatched: Array<{
      coinId: string;
      name?: string;
      symbol?: string;
      watchers: number;
    }> = [];
    for (const { coinId, watchers } of topWatchedIds) {
      const meta = await ctx.db
        .query("coingeckoCoins")
        .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", coinId))
        .first();
      topWatched.push({
        coinId,
        name: meta?.name,
        symbol: meta?.symbol,
        watchers,
      });
    }

    const trackedByReasonMap = new Map<string, number>();
    for (const tracked of trackedCoins) {
      trackedByReasonMap.set(
        tracked.reason,
        (trackedByReasonMap.get(tracked.reason) ?? 0) + 1,
      );
    }
    const trackedByReason = Array.from(trackedByReasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // --- AI health --------------------------------------------------------------
    const failuresWindowStart = now - 30 * DAY_MS;
    const sevenDaysAgo = now - 7 * DAY_MS;
    const failures = await ctx.db
      .query("smartScreenerPromptFailures")
      .withIndex("by_created_at_ms", (q) =>
        q.gte("createdAtMs", failuresWindowStart),
      )
      .take(SCAN_CAP);

    let total7d = 0;
    const bySurfaceMap = new Map<
      string,
      { count7d: number; count30d: number }
    >();
    const byErrorTypeMap = new Map<
      string,
      { count7d: number; count30d: number }
    >();
    const byBucketMap = new Map<string, number>();
    for (const failure of failures) {
      const isRecent = failure.createdAtMs >= sevenDaysAgo;
      if (isRecent) total7d += 1;

      const surfaceEntry = bySurfaceMap.get(failure.surface) ?? {
        count7d: 0,
        count30d: 0,
      };
      surfaceEntry.count30d += 1;
      if (isRecent) surfaceEntry.count7d += 1;
      bySurfaceMap.set(failure.surface, surfaceEntry);

      const errorType = failure.errorType ?? "unknown";
      const errorEntry = byErrorTypeMap.get(errorType) ?? {
        count7d: 0,
        count30d: 0,
      };
      errorEntry.count30d += 1;
      if (isRecent) errorEntry.count7d += 1;
      byErrorTypeMap.set(errorType, errorEntry);

      byBucketMap.set(
        failure.confidenceBucket,
        (byBucketMap.get(failure.confidenceBucket) ?? 0) + 1,
      );
    }

    return {
      generatedAt: now,
      userGrowth: {
        totalUsers: users.length,
        capped: users.length === SCAN_CAP,
        signupsByDay,
        recentSignups,
      },
      adoption: {
        watchlistGroups: {
          total: watchlistGroups.length,
          users: groupsByUser.size,
          capped: watchlistGroups.length === SCAN_CAP,
        },
        wallets: {
          total: wallets.length,
          active: wallets.filter((w) => w.isActive).length,
          users: new Set(wallets.map((w) => w.userId)).size,
          withSyncError: wallets.filter((w) => Boolean(w.lastSyncError)).length,
          capped: wallets.length === SCAN_CAP,
        },
        holdings: {
          rows: holdings.length,
          users: new Set(holdings.map((h) => h.userId)).size,
          capped: holdings.length === SCAN_CAP,
        },
      },
      watchlistUsers: {
        rows: watchlistUserRows.slice(0, MAX_WATCHLIST_USER_ROWS),
        totalUsersWithWatchlists: watchlistUserRows.length,
        truncated: watchlistUserRows.length > MAX_WATCHLIST_USER_ROWS,
      },
      coins: {
        topWatched,
        watchlistRows: watchlistRows.length,
        watchlistRowsCapped: watchlistRows.length === SCAN_CAP,
        trackedByReason,
        trackedCapped: trackedCoins.length === SCAN_CAP,
      },
      aiHealth: {
        total7d,
        total30d: failures.length,
        bySurface: Array.from(bySurfaceMap.entries())
          .map(([surface, counts]) => ({ surface, ...counts }))
          .sort((a, b) => b.count30d - a.count30d),
        byErrorType: Array.from(byErrorTypeMap.entries())
          .map(([errorType, counts]) => ({ errorType, ...counts }))
          .sort((a, b) => b.count30d - a.count30d),
        byConfidenceBucket: Array.from(byBucketMap.entries())
          .map(([bucket, count]) => ({ bucket, count }))
          .sort((a, b) => b.count - a.count),
        capped: failures.length === SCAN_CAP,
      },
    };
  },
});
