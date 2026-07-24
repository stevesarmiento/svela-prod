import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Data retention.
 *
 * Several ingestion tables grow without bound: the crons append
 * fine-grained rows (5-min priceHistory points, 30-min global market
 * points, CoinGlass candles) that readers only ever window to the last
 * N days. Everything past the read window is dead storage billed
 * forever. Each policy below trims one partition with batched,
 * self-rescheduling deletes so a single mutation never exceeds Convex
 * limits.
 *
 * Readers window tf "N" to `now - N days - 1h` (coingeckoReads
 * getWindowStartMs) — keep windows generously larger than that.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 1000;
/** How many self-chained batches a single cron kick may spend per policy. */
const MAX_ROUNDS_PER_RUN = 50;
const RESCHEDULE_DELAY_MS = 2_000;

/** priceHistory: only the fast-churning short timeframes need pruning. */
const PRICE_HISTORY_POLICIES: Array<{ timeframe: string; keepDays: number }> = [
  { timeframe: "1", keepDays: 3 },
  { timeframe: "1_ohlc", keepDays: 3 },
  { timeframe: "7", keepDays: 14 },
  { timeframe: "7_ohlc", keepDays: 14 },
  { timeframe: "14", keepDays: 30 },
  // "1825" was cron-refreshed for months but is never read by any frontend
  // surface ("max" reads its own timeframe partition) — reclaim it entirely.
  { timeframe: "1825", keepDays: 0 },
];

/** trackedCoins reason "viewed": demand-driven rows decay after inactivity. */
const TRACKED_VIEWED_KEEP_DAYS = 45;
/** chartSeries rows with no standing and no recent views are dead queue state. */
const CHART_SERIES_KEEP_DAYS = 30;

const GLOBAL_MARKET_HISTORY_POLICIES: Array<{
  timeframe: string;
  keepDays: number;
}> = [
  { timeframe: "1", keepDays: 7 },
  { timeframe: "7", keepDays: 14 },
  { timeframe: "30", keepDays: 45 },
  { timeframe: "365", keepDays: 400 },
];

const COINGLASS_TABLES = [
  "coinglassSpotTakerBuySellVolumeHistory",
  "coinglassFuturesTakerBuySellVolumeHistory",
  "coinglassOpenInterestHistory",
  "coinglassLiquidationHistory",
  "coinglassTakerBuySellExchangeListSnapshots",
] as const;
const COINGLASS_KEEP_DAYS = 90;

const NEWS_ARTICLE_KEEP_DAYS = 60;

export const _prunePriceHistoryBatch = internalMutation({
  args: {
    timeframe: v.string(),
    cutoffMs: v.number(),
    remainingRounds: v.number(),
  },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("priceHistory")
      .withIndex("by_timeframe_timestamp", (q) =>
        q.eq("timeframe", args.timeframe).lt("timestamp", args.cutoffMs),
      )
      .take(DELETE_BATCH_SIZE);

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    const hasMore = rows.length === DELETE_BATCH_SIZE;
    if (hasMore && args.remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RESCHEDULE_DELAY_MS,
        internal.retention._prunePriceHistoryBatch,
        { ...args, remainingRounds: args.remainingRounds - 1 },
      );
    }
    return { deleted: rows.length, hasMore };
  },
});

export const _pruneGlobalMarketHistoryBatch = internalMutation({
  args: {
    timeframe: v.string(),
    cutoffMs: v.number(),
    remainingRounds: v.number(),
  },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("globalMarketHistory")
      .withIndex("by_timeframe_timestamp", (q) =>
        q.eq("timeframe", args.timeframe).lt("timestamp", args.cutoffMs),
      )
      .take(DELETE_BATCH_SIZE);

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    const hasMore = rows.length === DELETE_BATCH_SIZE;
    if (hasMore && args.remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RESCHEDULE_DELAY_MS,
        internal.retention._pruneGlobalMarketHistoryBatch,
        { ...args, remainingRounds: args.remainingRounds - 1 },
      );
    }
    return { deleted: rows.length, hasMore };
  },
});

export const _pruneCoinglassHistoryBatch = internalMutation({
  args: {
    table: v.union(...COINGLASS_TABLES.map((t) => v.literal(t))),
    cutoffMs: v.number(),
    remainingRounds: v.number(),
  },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    // All CoinGlass tables share a `by_last_updated` index. Old candles are
    // immutable (lastUpdated stops moving once final), so pruning by
    // lastUpdated removes both aged-out data points and rows for symbols
    // that are no longer tracked.
    const rows = await ctx.db
      .query(args.table)
      .withIndex("by_last_updated", (q) => q.lt("lastUpdated", args.cutoffMs))
      .take(DELETE_BATCH_SIZE);

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    const hasMore = rows.length === DELETE_BATCH_SIZE;
    if (hasMore && args.remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RESCHEDULE_DELAY_MS,
        internal.retention._pruneCoinglassHistoryBatch,
        { ...args, remainingRounds: args.remainingRounds - 1 },
      );
    }
    return { deleted: rows.length, hasMore };
  },
});

export const _pruneOrphanedNewsArticlesBatch = internalMutation({
  args: {
    cutoffMs: v.number(),
    remainingRounds: v.number(),
  },
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // _pruneNewsLinksForCoin caps links at 20 per coin but never deletes
    // the article rows those links pointed at — orphaned articles pile up
    // forever. Delete old articles that no coin links to anymore.
    const batchSize = 200;
    const articles = await ctx.db
      .query("coingeckoNewsArticles")
      .withIndex("by_posted_at_ms", (q) => q.lt("postedAtMs", args.cutoffMs))
      .take(batchSize);

    // Each article's link check + delete is independent — run concurrently.
    const deletions = await Promise.all(
      articles.map(async (article) => {
        const link = await ctx.db
          .query("coingeckoNewsCoinLinks")
          .withIndex("by_article_id", (q) => q.eq("articleId", article._id))
          .first();
        if (link) return false;
        await ctx.db.delete(article._id);
        return true;
      }),
    );
    const deleted = deletions.filter(Boolean).length;

    // Note: `hasMore` uses the scanned count; still-linked old articles are
    // re-scanned next run, which is fine at this batch size.
    const hasMore = articles.length === batchSize;
    if (hasMore && args.remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RESCHEDULE_DELAY_MS,
        internal.retention._pruneOrphanedNewsArticlesBatch,
        { ...args, remainingRounds: args.remainingRounds - 1 },
      );
    }
    return { scanned: articles.length, deleted, hasMore };
  },
});

export const _pruneTrackedCoinsViewedBatch = internalMutation({
  args: {
    cutoffMs: v.number(),
    remainingRounds: v.number(),
  },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    // Only "viewed" rows decay by TTL — watchlist/portfolio rows are managed
    // by real membership add/remove paths, news rows by the news jobs.
    const rows = await ctx.db
      .query("trackedCoins")
      .withIndex("by_reason", (q) => q.eq("reason", "viewed"))
      .take(DELETE_BATCH_SIZE);

    const expired = rows.filter((row) => row.lastSeen < args.cutoffMs);
    await Promise.all(expired.map((row) => ctx.db.delete(row._id)));

    const hasMore = rows.length === DELETE_BATCH_SIZE;
    if (hasMore && args.remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RESCHEDULE_DELAY_MS,
        internal.retention._pruneTrackedCoinsViewedBatch,
        { ...args, remainingRounds: args.remainingRounds - 1 },
      );
    }
    return { deleted: expired.length, hasMore };
  },
});

export const _pruneOrphanChartSeriesBatch = internalMutation({
  args: {
    cutoffMs: v.number(),
    remainingRounds: v.number(),
  },
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Rows whose lastRequestedAt is old (or unset — sorts first in the index)
    // are deletion candidates UNLESS the coin has standing demand
    // (watchlist/portfolio), whose rows the reconciler maintains.
    const batchSize = 200;
    const rows = await ctx.db
      .query("chartSeries")
      .withIndex("by_last_requested", (q) =>
        q.lt("lastRequestedAt", args.cutoffMs),
      )
      .take(batchSize);

    // Each row's standing check + delete is independent — run concurrently.
    const deletions = await Promise.all(
      rows.map(async (row) => {
        // Never-viewed rows created by the reconciler for standing coins have
        // lastRequestedAt undefined; keep anything with standing.
        const standing = await Promise.all(
          ["watchlist", "portfolio"].map((reason) =>
            ctx.db
              .query("trackedCoins")
              .withIndex("by_coingecko_id_and_reason", (q) =>
                q.eq("coingeckoId", row.coingeckoId).eq("reason", reason),
              )
              .first(),
          ),
        );
        if (standing.some((tracked) => tracked !== null)) return false;

        await ctx.db.delete(row._id);
        return true;
      }),
    );
    const deleted = deletions.filter(Boolean).length;

    // `hasMore` uses the scanned count; still-standing rows are re-scanned
    // next run, which is fine at this batch size (same caveat as the news
    // article prune above).
    const hasMore = rows.length === batchSize;
    if (hasMore && args.remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RESCHEDULE_DELAY_MS,
        internal.retention._pruneOrphanChartSeriesBatch,
        { ...args, remainingRounds: args.remainingRounds - 1 },
      );
    }
    return { scanned: rows.length, deleted, hasMore };
  },
});

/** Cron entry point: kick off one bounded delete chain per policy. */
export const _runRetention = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    await Promise.all(
      PRICE_HISTORY_POLICIES.map((policy) =>
        ctx.scheduler.runAfter(0, internal.retention._prunePriceHistoryBatch, {
          timeframe: policy.timeframe,
          cutoffMs: now - policy.keepDays * DAY_MS,
          remainingRounds: MAX_ROUNDS_PER_RUN,
        }),
      ),
    );

    await Promise.all(
      GLOBAL_MARKET_HISTORY_POLICIES.map((policy) =>
        ctx.scheduler.runAfter(
          0,
          internal.retention._pruneGlobalMarketHistoryBatch,
          {
            timeframe: policy.timeframe,
            cutoffMs: now - policy.keepDays * DAY_MS,
            remainingRounds: MAX_ROUNDS_PER_RUN,
          },
        ),
      ),
    );

    await Promise.all(
      COINGLASS_TABLES.map((table) =>
        ctx.scheduler.runAfter(
          0,
          internal.retention._pruneCoinglassHistoryBatch,
          {
            table,
            cutoffMs: now - COINGLASS_KEEP_DAYS * DAY_MS,
            remainingRounds: MAX_ROUNDS_PER_RUN,
          },
        ),
      ),
    );

    await ctx.scheduler.runAfter(
      0,
      internal.retention._pruneOrphanedNewsArticlesBatch,
      {
        cutoffMs: now - NEWS_ARTICLE_KEEP_DAYS * DAY_MS,
        remainingRounds: MAX_ROUNDS_PER_RUN,
      },
    );

    await ctx.scheduler.runAfter(
      0,
      internal.retention._pruneTrackedCoinsViewedBatch,
      {
        cutoffMs: now - TRACKED_VIEWED_KEEP_DAYS * DAY_MS,
        remainingRounds: MAX_ROUNDS_PER_RUN,
      },
    );

    await ctx.scheduler.runAfter(
      0,
      internal.retention._pruneOrphanChartSeriesBatch,
      {
        cutoffMs: now - CHART_SERIES_KEEP_DAYS * DAY_MS,
        remainingRounds: MAX_ROUNDS_PER_RUN,
      },
    );

    return null;
  },
});
