import { v } from "convex/values";
import { action, query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

const sentimentValidator = v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral"));

export const listNewsByCoinId = query({
  args: {
    coingeckoId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      articleId: v.id("coingeckoNewsArticles"),
      title: v.string(),
      url: v.string(),
      sourceName: v.union(v.string(), v.null()),
      postedAtIso: v.union(v.string(), v.null()),
      postedAtMs: v.number(),
      sentiment: v.union(sentimentValidator, v.null()),
      sentimentConfidence: v.union(v.number(), v.null()),
      sentimentUpdatedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    // Cap matches the floating feed's largest "Pull" size.
    const limit = Math.min(50, Math.max(1, args.limit ?? 5));

    const links = await ctx.db
      .query("coingeckoNewsCoinLinks")
      .withIndex("by_coingecko_id_and_posted_at_ms", (q) => q.eq("coingeckoId", args.coingeckoId))
      .order("desc")
      .take(limit);

    const docs = await Promise.all(links.map((l) => ctx.db.get(l.articleId)));
    const out: Array<{
      articleId: typeof links[number]["articleId"];
      title: string;
      url: string;
      sourceName: string | null;
      postedAtIso: string | null;
      postedAtMs: number;
      sentiment: "bullish" | "bearish" | "neutral" | null;
      sentimentConfidence: number | null;
      sentimentUpdatedAt: number | null;
    }> = [];

    for (let i = 0; i < links.length; i++) {
      const link = links[i]!;
      const doc = docs[i];
      if (!doc) continue;
      out.push({
        articleId: doc._id,
        title: doc.title,
        url: doc.url,
        sourceName: doc.sourceName ?? null,
        postedAtIso: doc.postedAtIso ?? null,
        postedAtMs: doc.postedAtMs ?? link.postedAtMs,
        sentiment: doc.sentiment ?? null,
        sentimentConfidence: doc.sentimentConfidence ?? null,
        sentimentUpdatedAt: doc.sentimentUpdatedAt ?? null,
      });
    }

    return out;
  },
});

export const refreshNewsForCoin = mutation({
  args: {
    coingeckoId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    await ctx.runMutation(internal.coingeckoState._touchTrackedCoin, {
      coingeckoId: args.coingeckoId,
      reason: "news",
      lastSeen: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.coingeckoNewsJobs.refreshCoinNews, {
      coingeckoId: args.coingeckoId,
      perPage: 5,
    });

    return null;
  },
});

export const refreshNewsForCoinNow = action({
  args: {
    coingeckoId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Ensure this coin joins the rotation so future cron refreshes keep it warm.
    await ctx.runMutation(internal.coingeckoState._touchTrackedCoin, {
      coingeckoId: args.coingeckoId,
      reason: "news",
      lastSeen: Date.now(),
    });

    // Run the refresh action and wait for DB writes.
    await ctx.runAction(internal.coingeckoNewsJobs.refreshCoinNews, {
      coingeckoId: args.coingeckoId,
      perPage: 5,
    });

    return null;
  },
});

export const requestSentimentForArticles = mutation({
  args: {
    articleIds: v.array(v.id("coingeckoNewsArticles")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const unique = Array.from(new Set(args.articleIds)).slice(0, 20);
    if (unique.length === 0) return null;

    await ctx.scheduler.runAfter(0, internal.coingeckoNewsJobs.analyzeSentimentBatch, {
      articleIds: unique,
    });

    return null;
  },
});

