import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * One-time migration: move legacy per-row `watchlists.holdings` values into
 * the canonical `coinHoldings` table (one row per userId+coinId) and clear
 * the deprecated field on watchlist rows.
 *
 * Conflict policy when the same coin carried legacy values on multiple rows:
 * take the MAX, never the sum — the same position listed on two watchlists is
 * one position, not two. Safe to re-run; already-clean rows are no-ops.
 *
 * Kick off with:
 *   npx convex run holdingsMigration:migrateRowHoldingsToCanonical '{}'
 * It self-schedules follow-up batches until done.
 */
export const migrateRowHoldingsToCanonical = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    migrated: v.number(),
    cleared: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(args.batchSize ?? 200, 500));

    const page = await ctx.db
      .query("watchlists")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let migrated = 0;
    let cleared = 0;

    for (const row of page.page) {
      const legacy = row.holdings;
      if (legacy === undefined) continue;

      if (typeof legacy === "number" && Number.isFinite(legacy) && legacy > 0) {
        const existing = await ctx.db
          .query("coinHoldings")
          .withIndex("by_user_coin", (q) =>
            q.eq("userId", row.userId).eq("coinId", row.coinId),
          )
          .first();

        if (!existing) {
          await ctx.db.insert("coinHoldings", {
            userId: row.userId,
            coinId: row.coinId,
            holdings: legacy,
            updatedAt: Date.now(),
          });
          migrated += 1;
        } else if (legacy > existing.holdings) {
          // Any canonical row seen mid-migration for a coin that still has
          // legacy rows was itself just migrated (new writes clear all legacy
          // rows for the coin), so max-merging is safe.
          await ctx.db.patch(existing._id, { holdings: legacy, updatedAt: Date.now() });
          migrated += 1;
        }
      }

      await ctx.db.replace(row._id, {
        userId: row.userId,
        watchlistGroupId: row.watchlistGroupId,
        coinId: row.coinId,
      });
      cleared += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.holdingsMigration.migrateRowHoldingsToCanonical, {
        cursor: page.continueCursor,
        batchSize,
      });
    }

    return {
      processed: page.page.length,
      migrated,
      cleared,
      isDone: page.isDone,
    };
  },
});
