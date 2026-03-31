import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import type { Id } from "./_generated/dataModel";

function getCoinGeckoApiKey(): string {
  const key = process.env.X_CG_PRO_API_KEY;
  if (!key) throw new Error("Missing X_CG_PRO_API_KEY in Convex environment");
  return key;
}

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
}

async function fetchJson(endpoint: string, apiKey: string): Promise<unknown> {
  const response = await fetch(endpoint, {
    headers: {
      "x-cg-pro-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CoinGecko request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return await response.json();
}

type CoinGeckoNewsRow = {
  title?: string;
  url?: string;
  image?: string;
  author?: string;
  posted_at?: string;
  type?: string;
  source_name?: string;
};

type NewsItem = {
  url: string;
  title: string;
  postedAtIso?: string;
  postedAtMs: number;
  sourceName?: string;
  author?: string;
  image?: string;
};

function toPostedAtMs(postedAtIso: string | undefined | null): number | null {
  if (!postedAtIso) return null;
  const ms = Date.parse(postedAtIso);
  return Number.isFinite(ms) ? ms : null;
}

function mapNewsRows(rows: ReadonlyArray<CoinGeckoNewsRow>): Array<NewsItem> {
  const now = Date.now();
  const mapped = rows
    .map((row) => {
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const url = typeof row.url === "string" ? row.url.trim() : "";
      const postedAtIso = typeof row.posted_at === "string" ? row.posted_at : undefined;
      const postedAtMs = toPostedAtMs(postedAtIso) ?? now;
      const type = typeof row.type === "string" ? row.type : "news";
      if (!title || !url) return null;
      if (type !== "news") return null;

      return {
        url,
        title,
        postedAtIso,
        postedAtMs,
        sourceName: typeof row.source_name === "string" ? row.source_name : undefined,
        author: typeof row.author === "string" && row.author.length > 0 ? row.author : undefined,
        image: typeof row.image === "string" && row.image.length > 0 ? row.image : undefined,
      } satisfies NewsItem;
    })
    .filter((x) => x !== null);

  return mapped as Array<NewsItem>;
}

async function refreshNewsForCoin(args: {
  coingeckoId: string;
  perPage: number;
}): Promise<Array<NewsItem>> {
  const apiKey = getCoinGeckoApiKey();
  const url = new URL("https://pro-api.coingecko.com/api/v3/news");
  url.searchParams.set("coin_id", args.coingeckoId);
  url.searchParams.set("type", "news");
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(Math.min(20, Math.max(1, args.perPage))));
  url.searchParams.set("language", "en");

  const data = await fetchJson(url.toString(), apiKey);
  if (!Array.isArray(data)) return [];
  return mapNewsRows(data as CoinGeckoNewsRow[]);
}

const JOB_KEY_REFRESH_NEWS = "coingecko_refresh_news";

export const refreshTrackedCoinNewsBatch = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  returns: v.object({ refreshedCoins: v.number(), nextCursor: v.union(v.string(), v.null()) }),
  handler: async (
    ctx,
    args,
  ): Promise<{ refreshedCoins: number; nextCursor: string | null }> => {
    const batchSize = Math.min(50, Math.max(1, args.batchSize ?? 10));
    const perPage = Math.min(20, Math.max(1, args.perPage ?? 5));

    const state: { cursor?: string } | null = await ctx.runQuery(internal.coingeckoState._getJobState, {
      jobKey: JOB_KEY_REFRESH_NEWS,
    });
    const cursor: string | null = state?.cursor ?? null;

    const page: { page: Array<{ coingeckoId: string }>; continueCursor: string | null } = await ctx.runQuery(
      internal.coingeckoState._getTrackedCoinsPageByLastSeen,
      {
        paginationOpts: { numItems: batchSize, cursor },
      },
    );

    if (page.page.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, { jobKey: JOB_KEY_REFRESH_NEWS, cursor: null });
      return { refreshedCoins: 0, nextCursor: null };
    }

    // Dedupe coin IDs across reasons in this page.
    const coinIds: Array<string> = Array.from(new Set(page.page.map((row) => row.coingeckoId))).slice(
      0,
      batchSize,
    );

    let refreshedCoins = 0;
    for (const coingeckoId of coinIds) {
      const items = await refreshNewsForCoin({ coingeckoId, perPage });
      await ctx.runMutation(internal.coingeckoNewsWriters._upsertNewsForCoin, { coingeckoId, items });
      await ctx.runMutation(internal.coingeckoNewsWriters._pruneNewsLinksForCoin, { coingeckoId, keep: 20 });
      refreshedCoins++;
    }

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey: JOB_KEY_REFRESH_NEWS,
      cursor: page.continueCursor,
    });

    return { refreshedCoins, nextCursor: page.continueCursor };
  },
});

export const refreshCoinNews = internalAction({
  args: {
    coingeckoId: v.string(),
    perPage: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const perPage = Math.min(20, Math.max(1, args.perPage ?? 5));
    const items = await refreshNewsForCoin({ coingeckoId: args.coingeckoId, perPage });
    await ctx.runMutation(internal.coingeckoNewsWriters._upsertNewsForCoin, { coingeckoId: args.coingeckoId, items });
    await ctx.runMutation(internal.coingeckoNewsWriters._pruneNewsLinksForCoin, { coingeckoId: args.coingeckoId, keep: 20 });
    return null;
  },
});

const SentimentResultSchema = z.object({
  articleId: z.string().min(1),
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number().min(0).max(1),
});

const SentimentResponseSchema = z.object({
  results: z.array(SentimentResultSchema).max(100),
});

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const direct = safeJsonParse(trimmed);
  if (direct) return direct;

  const unfenced = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const fenceParsed = safeJsonParse(unfenced);
  if (fenceParsed) return fenceParsed;

  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return safeJsonParse(unfenced.slice(first, last + 1));
}

function heuristicSentiment(title: string): { sentiment: "bullish" | "bearish" | "neutral"; confidence: number } {
  const t = title.toLowerCase();

  const bearish = [
    "outflow",
    "hack",
    "exploit",
    "lawsuit",
    "ban",
    "decline",
    "drop",
    "slump",
    "falls",
    "plunge",
    "bear",
    "liquidation",
  ];
  const bullish = [
    "rally",
    "surge",
    "rise",
    "up ",
    "breakout",
    "approval",
    "buy",
    "inflow",
    "record",
    "stake",
    "bull",
    "launch",
  ];

  if (bearish.some((k) => t.includes(k))) return { sentiment: "bearish", confidence: 0.55 };
  if (bullish.some((k) => t.includes(k))) return { sentiment: "bullish", confidence: 0.55 };
  return { sentiment: "neutral", confidence: 0.35 };
}

export const analyzeSentimentBatch = internalAction({
  args: {
    articleIds: v.array(v.id("coingeckoNewsArticles")),
  },
  returns: v.object({ analyzed: v.number() }),
  handler: async (ctx, args) => {
    const gem = getGemini();

    type ArticleDoc = {
      _id: Id<"coingeckoNewsArticles">;
      title: string;
      sourceName?: string;
      sentiment?: "bullish" | "bearish" | "neutral";
    };

    const docs = (await ctx.runQuery(internal.coingeckoNewsWriters._getNewsArticlesByIds, {
      articleIds: args.articleIds,
    })) as Array<ArticleDoc | null>;

    const pending = docs
      .filter((doc): doc is ArticleDoc => Boolean(doc) && doc!.sentiment === undefined)
      .map((doc) => ({ _id: doc._id, title: doc.title, sourceName: doc.sourceName ?? null }));

    if (pending.length === 0) return { analyzed: 0 };

    if (!gem) {
      const items = pending.map((p) => {
        const h = heuristicSentiment(p.title);
        return { articleId: p._id, sentiment: h.sentiment, confidence: h.confidence };
      });
      await ctx.runMutation(internal.coingeckoNewsWriters._setArticleSentimentBatch, { items });
      return { analyzed: items.length };
    }

    const system = `
You label market sentiment implied by crypto news HEADLINES.

Output MUST be valid JSON only:
{
  "results": [
    { "articleId": "<id>", "sentiment": "bullish"|"bearish"|"neutral", "confidence": 0-1 }
  ]
}

Rules:
- Use only the headline (no browsing). If unclear or informational, choose neutral with confidence <= 0.4.
- Confidence should be conservative.
    `.trim();

    const user = JSON.stringify({ articles: pending }, null, 2);

    const result = await generateText({
      model: gem("gemini-2.5-flash"),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      maxOutputTokens: 600,
    });

    const json = extractJsonObject(result.text.trim());
    const parsed = SentimentResponseSchema.safeParse(json);
    if (!parsed.success) {
      const items = pending.map((p) => {
        const h = heuristicSentiment(p.title);
        return { articleId: p._id, sentiment: h.sentiment, confidence: h.confidence };
      });
      await ctx.runMutation(internal.coingeckoNewsWriters._setArticleSentimentBatch, { items });
      return { analyzed: items.length };
    }

    const idToDoc = new Map(pending.map((p) => [String(p._id), p._id]));
    const items = parsed.data.results
      .map((r) => {
        const articleId = idToDoc.get(r.articleId);
        if (!articleId) return null;
        return { articleId, sentiment: r.sentiment, confidence: r.confidence };
      })
      .filter((x) => x !== null);

    if (items.length === 0) return { analyzed: 0 };

    await ctx.runMutation(internal.coingeckoNewsWriters._setArticleSentimentBatch, { items });
    return { analyzed: items.length };
  },
});

