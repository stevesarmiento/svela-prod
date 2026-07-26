import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

const sentimentValidator = v.union(
  v.literal("bullish"),
  v.literal("bearish"),
  v.literal("neutral"),
);

const newsItemValidator = v.object({
  url: v.string(),
  title: v.string(),
  postedAtMs: v.number(),
  postedAtIso: v.optional(v.string()),
  sourceName: v.optional(v.string()),
  author: v.optional(v.string()),
  image: v.optional(v.string()),
});

export const _upsertNewsForCoin = internalMutation({
  args: {
    coingeckoId: v.string(),
    items: v.array(newsItemValidator),
  },
  returns: v.object({
    insertedArticles: v.number(),
    updatedArticles: v.number(),
    insertedLinks: v.number(),
    updatedLinks: v.number(),
    articleIdsNeedingSentiment: v.array(v.id("coingeckoNewsArticles")),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let insertedArticles = 0;
    let updatedArticles = 0;
    let insertedLinks = 0;
    let updatedLinks = 0;
    const articleIdsNeedingSentiment = new Set<Id<"coingeckoNewsArticles">>();

    // Dedupe by URL (last wins, matching the sequential upsert's end-state)
    // so concurrent iterations can't double-insert the same article.
    const itemsByUrl = new Map(args.items.map((item) => [item.url, item]));

    await Promise.all(
      Array.from(itemsByUrl.values()).map(async (item) => {
        const existingArticle = await ctx.db
          .query("coingeckoNewsArticles")
          .withIndex("by_url", (q) => q.eq("url", item.url))
          .first();

        const articleId =
          existingArticle?._id ??
          (await ctx.db.insert("coingeckoNewsArticles", {
            url: item.url,
            title: item.title,
            type: "news",
            sourceName: item.sourceName,
            author: item.author,
            postedAtIso: item.postedAtIso,
            postedAtMs: item.postedAtMs,
            image: item.image,
            fetchedAt: now,
            createdAt: now,
            updatedAt: now,
          }));

        if (existingArticle) {
          await ctx.db.patch(articleId, {
            title: item.title,
            sourceName: item.sourceName,
            author: item.author,
            postedAtIso: item.postedAtIso,
            postedAtMs: item.postedAtMs,
            image: item.image,
            fetchedAt: now,
            updatedAt: now,
          });
          updatedArticles++;
        } else {
          insertedArticles++;
        }

        const articleAfterUpsert =
          existingArticle ?? (await ctx.db.get(articleId));
        if (articleAfterUpsert?.sentiment === undefined) {
          articleIdsNeedingSentiment.add(articleId);
        }

        const existingLink = await ctx.db
          .query("coingeckoNewsCoinLinks")
          .withIndex("by_coingecko_id_and_article_id", (q) =>
            q.eq("coingeckoId", args.coingeckoId).eq("articleId", articleId),
          )
          .first();

        if (existingLink) {
          if (existingLink.postedAtMs !== item.postedAtMs) {
            await ctx.db.patch(existingLink._id, {
              postedAtMs: item.postedAtMs,
              updatedAt: now,
            });
            updatedLinks++;
          }
          return;
        }

        await ctx.db.insert("coingeckoNewsCoinLinks", {
          coingeckoId: args.coingeckoId,
          articleId,
          postedAtMs: item.postedAtMs,
          createdAt: now,
          updatedAt: now,
        });
        insertedLinks++;
      }),
    );

    return {
      insertedArticles,
      updatedArticles,
      insertedLinks,
      updatedLinks,
      articleIdsNeedingSentiment: Array.from(articleIdsNeedingSentiment),
    };
  },
});

export const _pruneNewsLinksForCoin = internalMutation({
  args: {
    coingeckoId: v.string(),
    keep: v.number(),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const keep = Math.min(200, Math.max(1, Math.floor(args.keep)));

    const keepRows = await ctx.db
      .query("coingeckoNewsCoinLinks")
      .withIndex("by_coingecko_id_and_posted_at_ms", (q) =>
        q.eq("coingeckoId", args.coingeckoId),
      )
      .order("desc")
      .take(keep);

    const keepIds = new Set(keepRows.map((row) => row._id));
    const allRows = await ctx.db
      .query("coingeckoNewsCoinLinks")
      .withIndex("by_coingecko_id", (q) =>
        q.eq("coingeckoId", args.coingeckoId),
      )
      .take(2000);

    const toDelete = allRows.filter((row) => !keepIds.has(row._id));
    await Promise.all(toDelete.map((row) => ctx.db.delete(row._id)));

    return { deleted: toDelete.length };
  },
});

const articleForSentimentValidator = v.object({
  _id: v.id("coingeckoNewsArticles"),
  _creationTime: v.number(),
  url: v.string(),
  title: v.string(),
  sourceName: v.optional(v.string()),
  sentiment: v.optional(sentimentValidator),
  sentimentConfidence: v.optional(v.number()),
  sentimentUpdatedAt: v.optional(v.number()),
});

export const _getNewsArticlesByIds = internalQuery({
  args: {
    articleIds: v.array(v.id("coingeckoNewsArticles")),
  },
  returns: v.array(v.union(articleForSentimentValidator, v.null())),
  handler: async (ctx, args) => {
    const docs = await Promise.all(args.articleIds.map((id) => ctx.db.get(id)));
    return docs.map((doc) => {
      if (!doc) return null;
      return {
        _id: doc._id,
        _creationTime: doc._creationTime,
        url: doc.url,
        title: doc.title,
        sourceName: doc.sourceName,
        sentiment: doc.sentiment,
        sentimentConfidence: doc.sentimentConfidence,
        sentimentUpdatedAt: doc.sentimentUpdatedAt,
      };
    });
  },
});

export const _listRecentArticlesMissingSentiment = internalQuery({
  args: {
    scanLimit: v.number(),
    analyzeLimit: v.number(),
  },
  returns: v.array(v.id("coingeckoNewsArticles")),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("coingeckoNewsArticles")
      .withIndex("by_posted_at_ms")
      .order("desc")
      .take(args.scanLimit);

    return rows
      .filter((row) => row.sentiment === undefined)
      .slice(0, args.analyzeLimit)
      .map((row) => row._id);
  },
});

export const _listRecentLowConfidenceNeutralArticles = internalQuery({
  args: {
    scanLimit: v.number(),
    analyzeLimit: v.number(),
    maxConfidence: v.number(),
  },
  returns: v.array(v.id("coingeckoNewsArticles")),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("coingeckoNewsArticles")
      .withIndex("by_posted_at_ms")
      .order("desc")
      .take(args.scanLimit);

    return rows
      .filter(
        (row) =>
          row.sentiment === "neutral" &&
          (row.sentimentConfidence ?? 0) <= args.maxConfidence,
      )
      .slice(0, args.analyzeLimit)
      .map((row) => row._id);
  },
});

const sentimentWriteItemValidator = v.object({
  articleId: v.id("coingeckoNewsArticles"),
  sentiment: sentimentValidator,
  confidence: v.number(),
});

export const _setArticleSentimentBatch = internalMutation({
  args: {
    items: v.array(sentimentWriteItemValidator),
  },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Dedupe by articleId (first wins, matching the sequential skip-once-set
    // behavior) so concurrent iterations can't double-patch the same article.
    const seenIds = new Set<string>();
    const uniqueItems = args.items.filter((item) => {
      if (seenIds.has(item.articleId)) return false;
      seenIds.add(item.articleId);
      return true;
    });

    const outcomes = await Promise.all(
      uniqueItems.map(async (item) => {
        const existing = await ctx.db.get(item.articleId);
        if (!existing) return 0;
        if (
          existing.sentiment !== undefined &&
          existing.sentimentUpdatedAt !== undefined
        )
          return 0;

        await ctx.db.patch(item.articleId, {
          sentiment: item.sentiment,
          sentimentConfidence: item.confidence,
          sentimentUpdatedAt: now,
          updatedAt: now,
        });
        return 1;
      }),
    );

    return { updated: outcomes.reduce<number>((sum, n) => sum + n, 0) };
  },
});

export const _overwriteLowConfidenceNeutralSentimentBatch = internalMutation({
  args: {
    items: v.array(sentimentWriteItemValidator),
    maxExistingConfidence: v.number(),
  },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Dedupe by articleId (first wins, matching the sequential skip-once-set
    // behavior) so concurrent iterations can't double-patch the same article.
    const seenIds = new Set<string>();
    const uniqueItems = args.items.filter((item) => {
      if (seenIds.has(item.articleId)) return false;
      seenIds.add(item.articleId);
      return true;
    });

    const outcomes = await Promise.all(
      uniqueItems.map(async (item) => {
        const existing = await ctx.db.get(item.articleId);
        if (!existing) return 0;
        if (existing.sentiment !== "neutral") return 0;
        const existingConf = existing.sentimentConfidence ?? 0;
        if (existingConf > args.maxExistingConfidence) return 0;
        if (existingConf > item.confidence) return 0;

        await ctx.db.patch(item.articleId, {
          sentiment: item.sentiment,
          sentimentConfidence: item.confidence,
          sentimentUpdatedAt: now,
          updatedAt: now,
        });
        return 1;
      }),
    );

    return { updated: outcomes.reduce<number>((sum, n) => sum + n, 0) };
  },
});
