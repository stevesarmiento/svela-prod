import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { getEffectiveIntervalMs } from "./_lib/chartFreshness";
import { requireServerToken } from "./_lib/server_token";
import { getChartSeriesRow, hasStandingDemand } from "./chartScheduler";

function normalizeCoingeckoIds(
  coingeckoIds: ReadonlyArray<string>,
): Array<string> {
  const out: Array<string> = [];
  const seen = new Set<string>();
  for (const raw of coingeckoIds) {
    const id = raw.trim();
    if (id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export const _getJobState = internalQuery({
  args: { jobKey: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("jobState"),
      _creationTime: v.number(),
      jobKey: v.string(),
      cursor: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", args.jobKey))
      .first();
  },
});

export const _setJobCursor = internalMutation({
  args: { jobKey: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", args.jobKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        cursor: args.cursor ?? undefined,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("jobState", {
      jobKey: args.jobKey,
      cursor: args.cursor ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const _touchTrackedCoin = internalMutation({
  args: {
    coingeckoId: v.string(),
    reason: v.string(), // "top" | "watchlist"
    lastSeen: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const lastSeen = args.lastSeen ?? now;

    const existing = await ctx.db
      .query("trackedCoins")
      .withIndex("by_coingecko_id_and_reason", (q) =>
        q.eq("coingeckoId", args.coingeckoId).eq("reason", args.reason),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeen,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("trackedCoins", {
      coingeckoId: args.coingeckoId,
      reason: args.reason,
      lastSeen,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const _removeTrackedCoinReason = internalMutation({
  args: {
    coingeckoId: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trackedCoins")
      .withIndex("by_coingecko_id_and_reason", (q) =>
        q.eq("coingeckoId", args.coingeckoId).eq("reason", args.reason),
      )
      .first();

    if (!existing) return null;

    await ctx.db.delete(existing._id);
    return null;
  },
});

// trackedCoins freshness only needs to be coarse (the 5-min market cron
// reads membership, and pruning keys off multi-hour windows). Skip the
// patch when the row was touched recently — overview snapshot refreshes
// call this for every watchlist coin, and blind patches invalidate
// subscriptions + burn write bandwidth for no behavioral change.
const TRACKED_COIN_TOUCH_MIN_INTERVAL_MS = 30 * 60 * 1000;

export const _touchTrackedCoinsBatch = internalMutation({
  args: {
    coingeckoIds: v.array(v.string()),
    reason: v.string(),
    lastSeen: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const lastSeen = args.lastSeen ?? now;
    const coingeckoIds = normalizeCoingeckoIds(args.coingeckoIds);

    await Promise.all(
      coingeckoIds.map(async (coingeckoId) => {
        const existing = await ctx.db
          .query("trackedCoins")
          .withIndex("by_coingecko_id_and_reason", (q) =>
            q.eq("coingeckoId", coingeckoId).eq("reason", args.reason),
          )
          .first();

        if (existing) {
          if (
            lastSeen - existing.lastSeen <
            TRACKED_COIN_TOUCH_MIN_INTERVAL_MS
          ) {
            return;
          }
          await ctx.db.patch(existing._id, {
            lastSeen,
            updatedAt: now,
          });
          return;
        }

        await ctx.db.insert("trackedCoins", {
          coingeckoId,
          reason: args.reason,
          lastSeen,
          createdAt: now,
          updatedAt: now,
        });
      }),
    );

    return null;
  },
});

export const _removeTrackedCoinsReasonBatch = internalMutation({
  args: {
    coingeckoIds: v.array(v.string()),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coingeckoIds = normalizeCoingeckoIds(args.coingeckoIds);

    await Promise.all(
      coingeckoIds.map(async (coingeckoId) => {
        const existing = await ctx.db
          .query("trackedCoins")
          .withIndex("by_coingecko_id_and_reason", (q) =>
            q.eq("coingeckoId", coingeckoId).eq("reason", args.reason),
          )
          .first();
        if (!existing) return;
        await ctx.db.delete(existing._id);
      }),
    );

    return null;
  },
});

export const _deleteTrackedCoinsByReasonBatch = internalMutation({
  args: {
    reason: v.string(),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(5000, Math.max(1, args.batchSize ?? 500));

    const rows = await ctx.db
      .query("trackedCoins")
      .withIndex("by_reason", (q) => q.eq("reason", args.reason))
      .take(batchSize);

    if (rows.length === 0) return { deleted: 0, hasMore: false };

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    return { deleted: rows.length, hasMore: rows.length === batchSize };
  },
});

const trackedCoinRowValidator = v.object({
  _id: v.id("trackedCoins"),
  _creationTime: v.number(),
  coingeckoId: v.string(),
  reason: v.string(),
  lastSeen: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/**
 * Record a chart view as a demand signal. Fired fire-and-forget from the
 * market-chart/ohlc API routes on EVERY request (demand must be recorded even
 * when the data is fresh). Both writes are throttled by
 * TRACKED_COIN_TOUCH_MIN_INTERVAL_MS, so repeat views within 30 minutes are
 * pure reads — no hot-row write contention.
 */
export const recordSeriesView = mutation({
  args: {
    serverToken: v.string(),
    coingeckoId: v.string(),
    timeframe: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();

    // 1) Keep the coin in the tracked set under reason "viewed" (TTL-pruned
    //    by retention; watchlist/portfolio rows are managed by membership).
    const tracked = await ctx.db
      .query("trackedCoins")
      .withIndex("by_coingecko_id_and_reason", (q) =>
        q.eq("coingeckoId", args.coingeckoId).eq("reason", "viewed"),
      )
      .first();
    if (!tracked) {
      await ctx.db.insert("trackedCoins", {
        coingeckoId: args.coingeckoId,
        reason: "viewed",
        lastSeen: now,
        createdAt: now,
        updatedAt: now,
      });
    } else if (now - tracked.lastSeen >= TRACKED_COIN_TOUCH_MIN_INTERVAL_MS) {
      await ctx.db.patch(tracked._id, { lastSeen: now, updatedAt: now });
    }

    // 2) Refresh the series' demand signal and pull nextDueAt earlier when
    //    the tightened demand tier shortens the effective interval.
    const series = await getChartSeriesRow(
      ctx,
      args.coingeckoId,
      args.timeframe,
    );
    if (!series) {
      // No row yet — the route's warmup path creates it (with a lease) and
      // _markSeriesFetched folds demand in afterwards. Nothing to do here.
      return null;
    }
    if (
      series.lastRequestedAt &&
      now - series.lastRequestedAt < TRACKED_COIN_TOUCH_MIN_INTERVAL_MS
    ) {
      return null;
    }

    const hasStanding = await hasStandingDemand(ctx, args.coingeckoId);
    const interval = getEffectiveIntervalMs({
      timeframe: args.timeframe,
      now,
      lastRequestedAt: now,
      hasStanding,
    });
    const candidateDueAt =
      interval === null
        ? series.nextDueAt
        : Math.max(now, (series.lastFetchedAt ?? 0) + interval);

    await ctx.db.patch(series._id, {
      lastRequestedAt: now,
      nextDueAt: Math.min(series.nextDueAt, candidateDueAt),
      updatedAt: now,
    });
    return null;
  },
});

export const _getTrackedCoinsPage = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(trackedCoinRowValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("trackedCoins")
      .withIndex("by_coingecko_id")
      .order("asc")
      .paginate(args.paginationOpts);
    // `.paginate()` may include extra metadata fields; return only what our validator allows.
    const { page, isDone, continueCursor } = result;
    return { page, isDone, continueCursor };
  },
});

export const _getTrackedCoinsPageByLastSeen = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(trackedCoinRowValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("trackedCoins")
      .withIndex("by_last_seen")
      .order("desc")
      .paginate(args.paginationOpts);

    const { page, isDone, continueCursor } = result;
    return { page, isDone, continueCursor };
  },
});

export const _listTrackedCoinIdsByReason = internalQuery({
  args: {
    reason: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 2000;
    const rows = await ctx.db
      .query("trackedCoins")
      .withIndex("by_reason", (q) => q.eq("reason", args.reason))
      .take(limit);

    const unique = new Set<string>();
    for (const row of rows) unique.add(row.coingeckoId);
    return Array.from(unique);
  },
});
