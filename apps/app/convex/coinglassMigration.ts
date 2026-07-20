import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * One-time migration: stamp `coingeckoId` on legacy taker exchange-list
 * snapshot rows that were keyed by ticker symbol only.
 *
 * Resolution: snapshot.symbol -> coingeckoMarkets.by_symbol (both stored
 * uppercase) -> pick the lowest marketCapRank match. This is exactly as
 * (im)precise as the old symbol join, so it cannot be MORE wrong than today —
 * and the writer self-heals any mis-stamped row on its next cron/warmup write
 * for the actually-tracked coin.
 *
 * Kick off with:
 *   npx convex run coinglassMigration:backfillTakerSnapshotCoingeckoIds '{}'
 * It self-schedules follow-up batches until done. Safe to re-run.
 */
export const backfillTakerSnapshotCoingeckoIds = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    stamped: v.number(),
    unresolved: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(args.batchSize ?? 100, 200));

    const page = await ctx.db
      .query("coinglassTakerBuySellExchangeListSnapshots")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let stamped = 0;
    let unresolved = 0;

    for (const row of page.page) {
      if (row.coingeckoId !== undefined) continue;

      const symbolUpper = row.symbol.trim().toUpperCase();
      if (!symbolUpper) {
        unresolved += 1;
        continue;
      }

      const candidates = await ctx.db
        .query("coingeckoMarkets")
        .withIndex("by_symbol", (q) => q.eq("symbol", symbolUpper))
        .take(20);

      if (candidates.length === 0) {
        unresolved += 1;
        continue;
      }

      const best = candidates.reduce((a, b) => {
        const aRank = a.marketCapRank ?? Number.POSITIVE_INFINITY;
        const bRank = b.marketCapRank ?? Number.POSITIVE_INFINITY;
        return bRank < aRank ? b : a;
      });

      await ctx.db.patch(row._id, { coingeckoId: best.coingeckoId });
      stamped += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.coinglassMigration.backfillTakerSnapshotCoingeckoIds,
        {
          cursor: page.continueCursor,
          batchSize,
        },
      );
    }

    return {
      processed: page.page.length,
      stamped,
      unresolved,
      isDone: page.isDone,
    };
  },
});
