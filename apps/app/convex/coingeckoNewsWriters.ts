import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const sentimentValidator = v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral"));

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
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let insertedArticles = 0;
    let updatedArticles = 0;
    let insertedLinks = 0;
    let updatedLinks = 0;

    for (const item of args.items) {
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

      const existingLink = await ctx.db
        .query("coingeckoNewsCoinLinks")
        .withIndex("by_coingecko_id_and_article_id", (q) =>
          q.eq("coingeckoId", args.coingeckoId).eq("articleId", articleId),
        )
        .first();

      if (existingLink) {
        if (existingLink.postedAtMs !== item.postedAtMs) {
          await ctx.db.patch(existingLink._id, { postedAtMs: item.postedAtMs, updatedAt: now });
          updatedLinks++;
        }
        continue;
      }

      await ctx.db.insert("coingeckoNewsCoinLinks", {
        coingeckoId: args.coingeckoId,
        articleId,
        postedAtMs: item.postedAtMs,
        createdAt: now,
        updatedAt: now,
      });
      insertedLinks++;
    }

    return { insertedArticles, updatedArticles, insertedLinks, updatedLinks };
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
      .withIndex("by_coingecko_id_and_posted_at_ms", (q) => q.eq("coingeckoId", args.coingeckoId))
      .order("desc")
      .take(keep);

    const keepIds = new Set(keepRows.map((row) => row._id));
    const allRows = await ctx.db
      .query("coingeckoNewsCoinLinks")
      .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", args.coingeckoId))
      .take(2000);

    let deleted = 0;
    for (const row of allRows) {
      if (keepIds.has(row._id)) continue;
      await ctx.db.delete(row._id);
      deleted++;
    }

    return { deleted };
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
    let updated = 0;

    for (const item of args.items) {
      const existing = await ctx.db.get(item.articleId);
      if (!existing) continue;
      if (existing.sentiment !== undefined && existing.sentimentUpdatedAt !== undefined) continue;

      await ctx.db.patch(item.articleId, {
        sentiment: item.sentiment,
        sentimentConfidence: item.confidence,
        sentimentUpdatedAt: now,
        updatedAt: now,
      });
      updated++;
    }

    return { updated };
  },
});

