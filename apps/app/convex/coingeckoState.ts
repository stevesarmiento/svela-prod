import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

function normalizeCoingeckoIds(coingeckoIds: ReadonlyArray<string>): Array<string> {
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

    for (const coingeckoId of coingeckoIds) {
      const existing = await ctx.db
        .query("trackedCoins")
        .withIndex("by_coingecko_id_and_reason", (q) =>
          q.eq("coingeckoId", coingeckoId).eq("reason", args.reason),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          lastSeen,
          updatedAt: now,
        });
        continue;
      }

      await ctx.db.insert("trackedCoins", {
        coingeckoId,
        reason: args.reason,
        lastSeen,
        createdAt: now,
        updatedAt: now,
      });
    }

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

    for (const coingeckoId of coingeckoIds) {
      const existing = await ctx.db
        .query("trackedCoins")
        .withIndex("by_coingecko_id_and_reason", (q) =>
          q.eq("coingeckoId", coingeckoId).eq("reason", args.reason),
        )
        .first();
      if (!existing) continue;
      await ctx.db.delete(existing._id);
    }

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

