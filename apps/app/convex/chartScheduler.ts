import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  type MutationCtx,
  internalAction,
  internalMutation,
} from "./_generated/server";
import {
  CORE_TIMEFRAMES,
  FAR_FUTURE_MS,
  TIMEFRAME_CLASSES,
  computeNextDueAt,
  getEffectiveIntervalMs,
} from "./_lib/chartFreshness";
import { getCoinGeckoApiKey } from "./_lib/coingeckoFetch";
import { upsertMarketChart, upsertOhlc } from "./coingeckoJobs";

/**
 * Demand-prioritized, budget-aware chart refresh scheduler.
 *
 * Replaces the blind round-robin `coingecko_refresh_market_chart_*` /
 * `coingecko_refresh_ohlc_*` crons. A per-minute `tick` drains the due-queue
 * of `chartSeries` rows (`nextDueAt <= now`, oldest first) in timeframe-class
 * shares, under a hard daily call budget. Demand (views + watchlist/portfolio
 * standing) is folded into each row's `nextDueAt` by `_markSeriesFetched` and
 * `recordSeriesView`, so prioritization is a cheap indexed range scan.
 */

// ---- Budget knobs (tunable; ceiling agreed at ~1M CoinGecko calls/month) ----
/** Hard daily cap for scheduler + warmup chart fetches (~870K/mo incl. other crons). */
const DAILY_BUDGET = 28_000;
/** Slice of the daily budget kept for on-view warmups when the scheduler saturates. */
const WARMUP_RESERVE = 3_000;
/** Max series refreshed per 1-minute tick (pace ceiling ≈ 36K/day). */
const PER_TICK_CAP = 25;
/** Spacing between upstream calls inside a tick's batch action. */
const CALL_SPACING_MS = 400;
/** Lease applied to picked rows; doubles as crash-retry (next tick re-picks). */
const PICK_LEASE_MS = 10 * 60 * 1000;

// ---- Error backoff ----
const ERROR_BACKOFF_BASE_MS = 30 * 1000;
const ERROR_BACKOFF_MAX_MS = 10 * 60 * 1000;

// ---- Reconciler ----
const RECONCILE_COINS_PER_BATCH = 25;
const RECONCILE_MAX_ROUNDS = 60;
const RECONCILE_RESCHEDULE_DELAY_MS = 2_000;

const CHART_BUDGET_JOB_KEY = "coingecko:chart-budget";

// ---------------------------------------------------------------------------
// Shared helpers (plain functions; also imported by coingeckoWarmup/State)
// ---------------------------------------------------------------------------

export async function getChartSeriesRow(
  ctx: MutationCtx,
  coingeckoId: string,
  timeframe: string,
) {
  return await ctx.db
    .query("chartSeries")
    .withIndex("by_coin_timeframe", (q) =>
      q.eq("coingeckoId", coingeckoId).eq("timeframe", timeframe),
    )
    .first();
}

/** Watchlist/portfolio membership = standing demand (never falls to T2). */
export async function hasStandingDemand(
  ctx: MutationCtx,
  coingeckoId: string,
): Promise<boolean> {
  for (const reason of ["watchlist", "portfolio"]) {
    const row = await ctx.db
      .query("trackedCoins")
      .withIndex("by_coingecko_id_and_reason", (q) =>
        q.eq("coingeckoId", coingeckoId).eq("reason", reason),
      )
      .first();
    if (row) return true;
  }
  return false;
}

function dayStamp(nowMs: number): string {
  const d = new Date(nowMs);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${month}${day}`;
}

async function readChartBudget(ctx: MutationCtx, nowMs: number) {
  const row = await ctx.db
    .query("jobState")
    .withIndex("by_job_key", (q) => q.eq("jobKey", CHART_BUDGET_JOB_KEY))
    .first();
  if (!row?.cursor) return { row, used: 0 };

  const [stamp, usedStr] = row.cursor.split(":");
  if (stamp !== dayStamp(nowMs)) return { row, used: 0 };
  const used = Number(usedStr);
  return { row, used: Number.isFinite(used) ? used : 0 };
}

/** Record spent upstream calls against today's ledger (day-stamp reset). */
export async function addChartBudgetUsage(
  ctx: MutationCtx,
  nowMs: number,
  count: number,
): Promise<void> {
  const { row, used } = await readChartBudget(ctx, nowMs);
  const cursor = `${dayStamp(nowMs)}:${used + count}`;
  if (row) {
    await ctx.db.patch(row._id, { cursor, updatedAt: nowMs });
    return;
  }
  await ctx.db.insert("jobState", {
    jobKey: CHART_BUDGET_JOB_KEY,
    cursor,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

// ---------------------------------------------------------------------------
// Series outcome reporting (called from fetch paths: warmup, scheduler)
// ---------------------------------------------------------------------------

export const _markSeriesFetched = internalMutation({
  args: {
    coingeckoId: v.string(),
    timeframe: v.string(),
    fetchedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const [row, hasStanding] = await Promise.all([
      getChartSeriesRow(ctx, args.coingeckoId, args.timeframe),
      hasStandingDemand(ctx, args.coingeckoId),
    ]);
    const nextDueAt = computeNextDueAt({
      timeframe: args.timeframe,
      fetchedAt: args.fetchedAt,
      lastRequestedAt: row?.lastRequestedAt,
      hasStanding,
    });

    if (row) {
      await ctx.db.patch(row._id, {
        lastFetchedAt: args.fetchedAt,
        consecutiveErrors: 0,
        lastError: undefined,
        leaseUntil: undefined,
        nextDueAt,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("chartSeries", {
      coingeckoId: args.coingeckoId,
      timeframe: args.timeframe,
      lastFetchedAt: args.fetchedAt,
      nextDueAt,
      consecutiveErrors: 0,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const _markSeriesError = internalMutation({
  args: {
    coingeckoId: v.string(),
    timeframe: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await getChartSeriesRow(ctx, args.coingeckoId, args.timeframe);
    const errors = (row?.consecutiveErrors ?? 0) + 1;
    const backoffMs = Math.min(
      ERROR_BACKOFF_BASE_MS * 2 ** (errors - 1),
      ERROR_BACKOFF_MAX_MS,
    );
    const nextDueAt = now + backoffMs;
    const lastError = args.message.slice(0, 300);

    if (row) {
      await ctx.db.patch(row._id, {
        consecutiveErrors: errors,
        lastError,
        leaseUntil: undefined,
        nextDueAt,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("chartSeries", {
      coingeckoId: args.coingeckoId,
      timeframe: args.timeframe,
      nextDueAt,
      consecutiveErrors: errors,
      lastError,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Scheduler tick
// ---------------------------------------------------------------------------

export const tick = internalMutation({
  args: {},
  returns: v.object({
    picked: v.number(),
    usedToday: v.number(),
    perClass: v.array(v.object({ key: v.string(), picked: v.number() })),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const { used } = await readChartBudget(ctx, now);
    const allowance = Math.min(
      PER_TICK_CAP,
      DAILY_BUDGET - WARMUP_RESERVE - used,
    );

    const perClass = TIMEFRAME_CLASSES.map((c) => ({ key: c.key, picked: 0 }));
    if (allowance <= 0) {
      // Budget saturated: warmups still run off the reserve.
      return { picked: 0, usedToday: used, perClass };
    }

    const picked: Array<{ coingeckoId: string; timeframe: string }> = [];

    const drainTimeframe = async (timeframe: string, quota: number) => {
      if (quota <= 0) return 0;
      const rows = await ctx.db
        .query("chartSeries")
        .withIndex("by_timeframe_next_due", (q) =>
          q.eq("timeframe", timeframe).lte("nextDueAt", now),
        )
        .order("asc")
        .take(quota);

      // Skip rows a warmup currently holds (its lease clears on completion).
      const eligible = rows.filter(
        (row) => !(row.leaseUntil && row.leaseUntil > now),
      );
      for (const row of eligible) {
        picked.push({ coingeckoId: row.coingeckoId, timeframe });
      }
      await Promise.all(
        eligible.map((row) =>
          ctx.db.patch(row._id, {
            leaseUntil: now + PICK_LEASE_MS,
            nextDueAt: now + PICK_LEASE_MS, // crash-retry: re-picked next tick after lease
            updatedAt: now,
          }),
        ),
      );
      return eligible.length;
    };

    // Pass 1: class shares, unused share rolls forward (long tail funded last
    // when over budget, but never permanently starved).
    let carry = 0;
    for (let i = 0; i < TIMEFRAME_CLASSES.length; i++) {
      const cls = TIMEFRAME_CLASSES[i]!;
      let quota = Math.floor(allowance * cls.share) + carry;
      for (const timeframe of cls.timeframes) {
        const taken = await drainTimeframe(timeframe, quota);
        quota -= taken;
        perClass[i]!.picked += taken;
        if (quota <= 0) break;
      }
      carry = Math.max(0, quota);
    }

    // Pass 2: spend leftover carry on any remaining due series, class order.
    if (carry > 0) {
      for (let i = 0; i < TIMEFRAME_CLASSES.length && carry > 0; i++) {
        for (const timeframe of TIMEFRAME_CLASSES[i]!.timeframes) {
          const taken = await drainTimeframe(timeframe, carry);
          carry -= taken;
          perClass[i]!.picked += taken;
          if (carry <= 0) break;
        }
      }
    }

    if (picked.length > 0) {
      await addChartBudgetUsage(ctx, now, picked.length);
      await ctx.scheduler.runAfter(
        0,
        internal.chartScheduler._refreshSeriesBatch,
        { items: picked },
      );
    }

    return { picked: picked.length, usedToday: used + picked.length, perClass };
  },
});

export const _refreshSeriesBatch = internalAction({
  args: {
    items: v.array(
      v.object({ coingeckoId: v.string(), timeframe: v.string() }),
    ),
  },
  returns: v.object({ succeeded: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    const apiKey = getCoinGeckoApiKey();
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i]!;
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, CALL_SPACING_MS));
      }

      try {
        if (item.timeframe.endsWith("_ohlc")) {
          await upsertOhlc(ctx, {
            coingeckoId: item.coingeckoId,
            days: item.timeframe.replace(/_ohlc$/, ""),
            apiKey,
            dataSource: "coingecko-scheduler",
          });
        } else {
          await upsertMarketChart(ctx, {
            coingeckoId: item.coingeckoId,
            days: item.timeframe,
            apiKey,
            dataSource: "coingecko-scheduler",
          });
        }
        // upsertMarketChart/upsertOhlc report _markSeriesFetched on success.
        succeeded += 1;
      } catch (error) {
        failed += 1;
        await ctx.runMutation(internal.chartScheduler._markSeriesError, {
          coingeckoId: item.coingeckoId,
          timeframe: item.timeframe,
          message:
            error instanceof Error ? error.message : "Unknown fetch error",
        });
      }
    }

    return { succeeded, failed };
  },
});

// ---------------------------------------------------------------------------
// Reconciler: ensure chartSeries rows exist for standing (watchlist/portfolio)
// coins, and revive T2-sentinel rows that regained standing. Hourly cron kick;
// the batch self-reschedules through the whole trackedCoins set (retention.ts
// pattern). Also serves as the one-shot initial seed.
// ---------------------------------------------------------------------------

export const reconcileChartSeries = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.chartScheduler._reconcileChartSeriesBatch,
      { cursor: null, remainingRounds: RECONCILE_MAX_ROUNDS },
    );
    return null;
  },
});

export const _reconcileChartSeriesBatch = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    remainingRounds: v.number(),
  },
  returns: v.object({ processedCoins: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db
      .query("trackedCoins")
      .withIndex("by_last_seen")
      .order("desc")
      .paginate({ numItems: RECONCILE_COINS_PER_BATCH, cursor: args.cursor });

    const seen = new Set<string>();
    for (const row of page.page) {
      if (row.reason !== "watchlist" && row.reason !== "portfolio") continue;
      if (seen.has(row.coingeckoId)) continue;
      seen.add(row.coingeckoId);

      await Promise.all(
        CORE_TIMEFRAMES.map(async (timeframe) => {
          const interval = getEffectiveIntervalMs({
            timeframe,
            now,
            lastRequestedAt: undefined,
            hasStanding: true,
          });
          if (interval === null) return; // unreachable with hasStanding

          const existing = await getChartSeriesRow(
            ctx,
            row.coingeckoId,
            timeframe,
          );
          if (existing) {
            // Standing floor maintenance: revive rows parked at the T2 sentinel.
            if (existing.nextDueAt >= FAR_FUTURE_MS) {
              await ctx.db.patch(existing._id, {
                nextDueAt: now + Math.floor(Math.random() * interval),
                updatedAt: now,
              });
            }
            return;
          }

          // Stagger initial due times so seeding doesn't thundering-herd a tick.
          await ctx.db.insert("chartSeries", {
            coingeckoId: row.coingeckoId,
            timeframe,
            nextDueAt: now + Math.floor(Math.random() * interval),
            consecutiveErrors: 0,
            createdAt: now,
            updatedAt: now,
          });
        }),
      );
    }

    if (!page.isDone && args.remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RECONCILE_RESCHEDULE_DELAY_MS,
        internal.chartScheduler._reconcileChartSeriesBatch,
        {
          cursor: page.continueCursor,
          remainingRounds: args.remainingRounds - 1,
        },
      );
    }

    return { processedCoins: seen.size, isDone: page.isDone };
  },
});

// ---------------------------------------------------------------------------
// One-shot maintenance (run manually via `npx convex run`)
// ---------------------------------------------------------------------------

const LEGACY_JOB_KEY_PREFIXES = [
  "coingecko:market-chart:",
  "coingecko:ohlc:",
  "warmup:market-chart:",
  "warmup:ohlc:",
];

/** Delete jobState rows from the replaced rotation crons + chart warmup cooldowns. */
export const _cleanupLegacyChartJobState = internalMutation({
  args: { remainingRounds: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const remainingRounds = args.remainingRounds ?? 50;
    let deleted = 0;

    for (const prefix of LEGACY_JOB_KEY_PREFIXES) {
      const rows = await ctx.db
        .query("jobState")
        .withIndex("by_job_key", (q) =>
          q.gte("jobKey", prefix).lt("jobKey", `${prefix}\uffff`),
        )
        .take(200);
      await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
      deleted += rows.length;
    }

    const hasMore = deleted > 0;
    if (hasMore && remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RECONCILE_RESCHEDULE_DELAY_MS,
        internal.chartScheduler._cleanupLegacyChartJobState,
        { remainingRounds: remainingRounds - 1 },
      );
    }
    return { deleted, hasMore };
  },
});

/**
 * One-time migration: trackedCoins rows labeled "watchlist" by the old quotes
 * warmup for coins no user actually watchlists are relabeled to "viewed"
 * (relabel, never delete — the viewed TTL prune takes it from there).
 */
export const _relabelViewedTrackedCoins = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    remainingRounds: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    relabeled: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const remainingRounds = args.remainingRounds ?? 50;
    const page = await ctx.db
      .query("trackedCoins")
      .withIndex("by_reason", (q) => q.eq("reason", "watchlist"))
      .paginate({ numItems: 100, cursor: args.cursor });

    const outcomes = await Promise.all(
      page.page.map(async (row) => {
        const watched = await ctx.db
          .query("watchlists")
          .withIndex("by_coin", (q) => q.eq("coinId", row.coingeckoId))
          .first();
        if (watched) return 0;

        const existingViewed = await ctx.db
          .query("trackedCoins")
          .withIndex("by_coingecko_id_and_reason", (q) =>
            q.eq("coingeckoId", row.coingeckoId).eq("reason", "viewed"),
          )
          .first();

        if (existingViewed) {
          await ctx.db.delete(row._id);
        } else {
          await ctx.db.patch(row._id, { reason: "viewed", updatedAt: now });
        }
        return 1;
      }),
    );
    const relabeled = outcomes.reduce<number>((sum, n) => sum + n, 0);

    if (!page.isDone && remainingRounds > 0) {
      await ctx.scheduler.runAfter(
        RECONCILE_RESCHEDULE_DELAY_MS,
        internal.chartScheduler._relabelViewedTrackedCoins,
        { cursor: page.continueCursor, remainingRounds: remainingRounds - 1 },
      );
    }

    return { scanned: page.page.length, relabeled, isDone: page.isDone };
  },
});
