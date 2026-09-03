import { v } from "convex/values";
import { getUserByClerkId } from "./_lib/user_lookup";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";

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
  args: {},
  returns: v.object({
    scheduled: v.boolean(),
    reason: v.string(),
    coinsCount: v.number(),
  }),
  handler: async (ctx) => {
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
      return { scheduled: false, reason: "cooldown", coinsCount: 0 };
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

    const watchlistRows = await ctx.db
      .query("watchlists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const coinIds = uniqStrings(watchlistRows.map((row) => row.coinId));

    if (coinIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.coingeckoJobs.refreshMarketsByIds, {
        coingeckoIds: coinIds.slice(0, 1000),
      });
    }

    return {
      scheduled: true,
      reason: "scheduled",
      coinsCount: coinIds.length,
    };
  },
});

