import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";
import { internal } from "./_generated/api";

const WARMUP_DEDUP_MS = 5 * 60 * 1000;
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
    const jobKey = `warmup:market-chart:${args.coingeckoId}:${args.days}`;

    const existing = await ctx.db
      .query("jobState")
      .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
      .first();

    if (existing && now - existing.updatedAt < WARMUP_DEDUP_MS) {
      return { scheduled: false, reason: "cooldown" };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        updatedAt: now,
      });
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
    const jobKey = `warmup:ohlc:${args.coingeckoId}:${args.days}`;

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

    // Ensure these IDs are part of the tracked set so ongoing refreshes keep them warm.
    await Promise.all(
      runnable.map((coingeckoId) =>
        ctx.runMutation(internal.coingeckoState._touchTrackedCoin, {
          coingeckoId,
          reason: "watchlist",
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
