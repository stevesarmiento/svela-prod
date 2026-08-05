import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { computeRsiLast, trendFromCloses } from "./_lib/newsTechnicalContext";

const sentimentValidator = v.union(
  v.literal("bullish"),
  v.literal("bearish"),
  v.literal("neutral"),
);

const newsCategoryValidator = v.union(
  v.literal("regulation"),
  v.literal("security"),
  v.literal("etf"),
  v.literal("partnership"),
  v.literal("market"),
  v.literal("tech"),
  v.literal("macro"),
  v.literal("other"),
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
        // Queue articles missing either label so pre-existing rows get
        // enriched with summaries as the cron re-encounters them.
        if (
          articleAfterUpsert?.sentiment === undefined ||
          articleAfterUpsert?.aiSummary === undefined
        ) {
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
  aiSummary: v.optional(v.string()),
  aiCategory: v.optional(newsCategoryValidator),
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
        aiSummary: doc.aiSummary,
        aiCategory: doc.aiCategory,
      };
    });
  },
});

const coinTechnicalContextValidator = v.object({
  coingeckoId: v.string(),
  priceUsd: v.union(v.number(), v.null()),
  change24hPct: v.union(v.number(), v.null()),
  change7dPct: v.union(v.number(), v.null()),
  change30dPct: v.union(v.number(), v.null()),
  pctFromAth: v.union(v.number(), v.null()),
  rsi14: v.union(v.number(), v.null()),
  trend: v.union(
    v.literal("up"),
    v.literal("down"),
    v.literal("flat"),
    v.literal("unknown"),
  ),
});

/**
 * Compact per-coin technical snapshot used as context by the news sentiment
 * analysis. RSI/trend come from stored daily closes (priceHistory "365",
 * refreshed <=24h for tracked coins); market fields from coingeckoMarkets.
 * Coins without chart coverage return nulls — callers must tolerate gaps.
 */
export const _getTechnicalContextForCoins = internalQuery({
  args: {
    coingeckoIds: v.array(v.string()),
  },
  returns: v.array(coinTechnicalContextValidator),
  handler: async (ctx, args) => {
    const uniqueIds = Array.from(new Set(args.coingeckoIds)).slice(0, 25);

    return await Promise.all(
      uniqueIds.map(async (coingeckoId) => {
        const [market, recentPoints] = await Promise.all([
          ctx.db
            .query("coingeckoMarkets")
            .withIndex("by_coingecko_id", (q) =>
              q.eq("coingeckoId", coingeckoId),
            )
            .first(),
          ctx.db
            .query("priceHistory")
            .withIndex("by_coingecko_timeframe_timestamp", (q) =>
              q.eq("coingeckoId", coingeckoId).eq("timeframe", "365"),
            )
            .order("desc")
            .take(60),
        ]);

        const closes = recentPoints
          .reverse()
          .map((p) => p.close ?? p.price)
          .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

        const round = (x: number | undefined | null, digits = 1) =>
          typeof x === "number" && Number.isFinite(x)
            ? Number(x.toFixed(digits))
            : null;

        const rsi = computeRsiLast(closes, 14);
        return {
          coingeckoId,
          priceUsd: round(market?.currentPrice, 6),
          change24hPct: round(market?.priceChangePercentage24h),
          change7dPct: round(market?.return7dPct),
          change30dPct: round(market?.return30dPct),
          pctFromAth: round(market?.athChangePercentage),
          rsi14: rsi === null ? null : Math.round(rsi),
          trend: trendFromCloses(closes, 14),
        };
      }),
    );
  },
});

export const _getCoinIdsForArticles = internalQuery({
  args: {
    articleIds: v.array(v.id("coingeckoNewsArticles")),
  },
  returns: v.array(
    v.object({
      articleId: v.id("coingeckoNewsArticles"),
      coingeckoIds: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    return await Promise.all(
      args.articleIds.map(async (articleId) => {
        const links = await ctx.db
          .query("coingeckoNewsCoinLinks")
          .withIndex("by_article_id", (q) => q.eq("articleId", articleId))
          .take(10);
        return {
          articleId,
          coingeckoIds: links.map((link) => link.coingeckoId),
        };
      }),
    );
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
      .filter(
        (row) => row.sentiment === undefined || row.aiSummary === undefined,
      )
      .slice(0, args.analyzeLimit)
      .map((row) => row._id);
  },
});

const sentimentWriteItemValidator = v.object({
  articleId: v.id("coingeckoNewsArticles"),
  sentiment: sentimentValidator,
  confidence: v.number(),
  aiSummary: v.optional(v.string()),
  aiCategory: v.optional(newsCategoryValidator),
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

        // A summary-bearing item comes from full-article analysis and may
        // upgrade an older title-only label. Items without a summary
        // (heuristic fallback) never overwrite an existing label.
        const isFullAnalysis = item.aiSummary !== undefined;
        const alreadyLabeled =
          existing.sentiment !== undefined &&
          existing.sentimentUpdatedAt !== undefined;
        const alreadyEnriched = alreadyLabeled && existing.aiSummary !== undefined;
        if (isFullAnalysis ? alreadyEnriched : alreadyLabeled) return 0;

        await ctx.db.patch(item.articleId, {
          sentiment: item.sentiment,
          sentimentConfidence: item.confidence,
          sentimentUpdatedAt: now,
          ...(item.aiSummary !== undefined ? { aiSummary: item.aiSummary } : {}),
          ...(item.aiCategory !== undefined
            ? { aiCategory: item.aiCategory }
            : {}),
          updatedAt: now,
        });
        return 1;
      }),
    );

    return { updated: outcomes.reduce<number>((sum, n) => sum + n, 0) };
  },
});
