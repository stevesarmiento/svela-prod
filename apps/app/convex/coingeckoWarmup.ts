import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";
import { internal } from "./_generated/api";
import { FAR_FUTURE_MS, getStaleWindowMs } from "./_lib/chartFreshness";
import { addChartBudgetUsage, getChartSeriesRow } from "./chartScheduler";

const WARMUP_DEDUP_MS = 5 * 60 * 1000;
/**
 * Chart warmups are lease-based (not cooldown-based): the lease is short and
 * is cleared by the fetch outcome (_markSeriesFetched / _markSeriesError), so
 * a failed fetch is re-triggerable after its error backoff (~30s) instead of
 * silently burning a 5-minute cooldown.
 */
const WARMUP_LEASE_MS = 90 * 1000;
const OHLC_SUPPORTED_DAYS = new Set([
  "1",
  "7",
  "14",
  "30",
  "90",
  "180",
  "365",
  "max",
]);

type WarmupGate =
  | { scheduled: false; reason: string }
  | { scheduled: true; reason: "scheduled" };

/** Shared lease gate for chart-series warmups. Returns null when a refresh should be scheduled. */
async function acquireSeriesWarmupLease(
  ctx: MutationCtx,
  args: { coingeckoId: string; timeframe: string; now: number },
): Promise<WarmupGate | null> {
  const row = await getChartSeriesRow(ctx, args.coingeckoId, args.timeframe);

  if (
    row?.lastFetchedAt &&
    args.now - row.lastFetchedAt < getStaleWindowMs(args.timeframe)
  ) {
    return { scheduled: false, reason: "fresh" };
  }
  if (row?.leaseUntil && row.leaseUntil > args.now) {
    return { scheduled: false, reason: "in_flight" };
  }
  // _markSeriesError parks failing series with a short exponential backoff.
  if (row && row.consecutiveErrors > 0 && row.nextDueAt > args.now) {
    return { scheduled: false, reason: "error_backoff" };
  }

  if (row) {
    await ctx.db.patch(row._id, {
      leaseUntil: args.now + WARMUP_LEASE_MS,
      updatedAt: args.now,
    });
  } else {
    await ctx.db.insert("chartSeries", {
      coingeckoId: args.coingeckoId,
      timeframe: args.timeframe,
      nextDueAt: FAR_FUTURE_MS,
      leaseUntil: args.now + WARMUP_LEASE_MS,
      consecutiveErrors: 0,
      createdAt: args.now,
      updatedAt: args.now,
    });
  }

  // Warmups draw from the scheduler's daily budget reserve.
  await addChartBudgetUsage(ctx, args.now, 1);
  return null;
}

export const requestMarketChartRefresh = mutation({
  args: {
    serverToken: v.string(),
    coingeckoId: v.string(),
    days: v.string(),
  },
  returns: v.object({
    scheduled: v.boolean(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();

    const gate = await acquireSeriesWarmupLease(ctx, {
      coingeckoId: args.coingeckoId,
      timeframe: args.days,
      now,
    });
    if (gate) return gate;

    await ctx.scheduler.runAfter(
      0,
      internal.coingeckoJobs.refreshSingleMarketChart,
      {
        coingeckoId: args.coingeckoId,
        days: args.days,
      },
    );

    // Opportunistically compact historical duplicates (from prior writer behavior).
    for (const delaySeconds of [1, 3, 6]) {
      await ctx.scheduler.runAfter(
        delaySeconds,
        internal.cleanupInternal._compactPriceHistoryDuplicatesBatch,
        {
          coingeckoId: args.coingeckoId,
          timeframe: args.days,
          batchSize: 2000,
        },
      );
    }

    return { scheduled: true, reason: "scheduled" };
  },
});

export const requestOhlcRefresh = mutation({
  args: {
    serverToken: v.string(),
    coingeckoId: v.string(),
    days: v.string(),
  },
  returns: v.object({
    scheduled: v.boolean(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    if (!OHLC_SUPPORTED_DAYS.has(args.days)) {
      return { scheduled: false, reason: "unsupported_days" };
    }
    const now = Date.now();

    const gate = await acquireSeriesWarmupLease(ctx, {
      coingeckoId: args.coingeckoId,
      timeframe: `${args.days}_ohlc`,
      now,
    });
    if (gate) return gate;

    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshSingleOhlc, {
      coingeckoId: args.coingeckoId,
      days: args.days,
    });

    for (const delaySeconds of [1, 3, 6]) {
      await ctx.scheduler.runAfter(
        delaySeconds,
        internal.cleanupInternal._compactPriceHistoryDuplicatesBatch,
        {
          coingeckoId: args.coingeckoId,
          timeframe: `${args.days}_ohlc`,
          batchSize: 2000,
        },
      );
    }

    return { scheduled: true, reason: "scheduled" };
  },
});

export const requestMarketsRefresh = mutation({
  args: {
    serverToken: v.string(),
    coingeckoIds: v.array(v.string()),
  },
  returns: v.object({
    scheduled: v.boolean(),
    scheduledCount: v.number(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();

    const uniqueIds = Array.from(new Set(args.coingeckoIds))
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (uniqueIds.length === 0) {
      return { scheduled: false, scheduledCount: 0, reason: "empty" };
    }

    const runnable: Array<string> = [];
    for (const id of uniqueIds) {
      const jobKey = `warmup:markets:${id}`;
      const existing = await ctx.db
        .query("jobState")
        .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
        .first();

      if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) continue;

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

      runnable.push(id);
    }

    if (runnable.length === 0) {
      return { scheduled: false, scheduledCount: 0, reason: "cooldown" };
    }

    // Ensure these IDs are part of the tracked set so ongoing refreshes keep
    // them warm. Reason "viewed" (NOT "watchlist"): these are merely-viewed
    // coins; the viewed TTL prune in retention.ts reclaims them, whereas
    // watchlist rows are only removed by real watchlist membership changes.
    await Promise.all(
      runnable.map((coingeckoId) =>
        ctx.runMutation(internal.coingeckoState._touchTrackedCoin, {
          coingeckoId,
          reason: "viewed",
          lastSeen: now,
        }),
      ),
    );

    await ctx.scheduler.runAfter(
      0,
      internal.coingeckoJobs.refreshMarketsByIds,
      {
        coingeckoIds: runnable,
      },
    );

    return {
      scheduled: true,
      scheduledCount: runnable.length,
      reason: "scheduled",
    };
  },
});

export const requestGlobalMarketCapRefresh = mutation({
  args: {
    serverToken: v.string(),
    days: v.union(
      v.literal("1"),
      v.literal("7"),
      v.literal("30"),
      v.literal("365"),
    ),
  },
  returns: v.object({
    scheduled: v.boolean(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const jobKey = `warmup:global-market-cap:${args.days}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) {
      return { scheduled: false, reason: "cooldown" };
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

    await ctx.scheduler.runAfter(
      0,
      internal.coingeckoJobs.refreshGlobalMarketCapHistory,
      {
        days: args.days,
      },
    );

    return { scheduled: true, reason: "scheduled" };
  },
});

export const requestTopMarketsRefresh = mutation({
  args: {
    serverToken: v.string(),
    topN: v.number(),
  },
  returns: v.object({
    scheduled: v.boolean(),
    reason: v.string(),
    topN: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const topN = Math.min(10000, Math.max(250, Math.floor(args.topN)));
    const jobKey = `warmup:top-markets:${topN}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) {
      return { scheduled: false, reason: "cooldown", topN };
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

    await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshTopMarkets, {
      topN,
    });
    return { scheduled: true, reason: "scheduled", topN };
  },
});
