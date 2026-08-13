import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  fetchCoinGeckoJson,
  getCoinGeckoApiKey,
} from "./_lib/coingeckoFetch";
import { fetchArticleText } from "./newsArticleText";

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
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
      const postedAtIso =
        typeof row.posted_at === "string" ? row.posted_at : undefined;
      const postedAtMs = toPostedAtMs(postedAtIso) ?? now;
      const type = typeof row.type === "string" ? row.type : "news";
      if (!title || !url) return null;
      if (type !== "news") return null;

      return {
        url,
        title,
        postedAtIso,
        postedAtMs,
        sourceName:
          typeof row.source_name === "string" ? row.source_name : undefined,
        author:
          typeof row.author === "string" && row.author.length > 0
            ? row.author
            : undefined,
        image:
          typeof row.image === "string" && row.image.length > 0
            ? row.image
            : undefined,
      } satisfies NewsItem;
    })
    .filter((x) => x !== null);

  return mapped as Array<NewsItem>;
}

const SENTIMENT_BATCH_LIMIT = 20;

function chunkArticleIds<T>(values: ReadonlyArray<T>, size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
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
  url.searchParams.set(
    "per_page",
    String(Math.min(20, Math.max(1, args.perPage))),
  );
  url.searchParams.set("language", "en");

  const data = await fetchCoinGeckoJson(url.toString(), apiKey);
  if (!Array.isArray(data)) return [];
  return mapNewsRows(data as CoinGeckoNewsRow[]);
}

const JOB_KEY_REFRESH_NEWS = "coingecko_refresh_news";

export const refreshTrackedCoinNewsBatch = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  returns: v.object({
    refreshedCoins: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ refreshedCoins: number; nextCursor: string | null }> => {
    const batchSize = Math.min(50, Math.max(1, args.batchSize ?? 10));
    const perPage = Math.min(20, Math.max(1, args.perPage ?? 5));

    const state: { cursor?: string } | null = await ctx.runQuery(
      internal.coingeckoState._getJobState,
      {
        jobKey: JOB_KEY_REFRESH_NEWS,
      },
    );
    const cursor: string | null = state?.cursor ?? null;

    const page: {
      page: Array<{ coingeckoId: string }>;
      continueCursor: string | null;
    } = await ctx.runQuery(
      internal.coingeckoState._getTrackedCoinsPageByLastSeen,
      {
        paginationOpts: { numItems: batchSize, cursor },
      },
    );

    if (page.page.length === 0) {
      await ctx.runMutation(internal.coingeckoState._setJobCursor, {
        jobKey: JOB_KEY_REFRESH_NEWS,
        cursor: null,
      });
      return { refreshedCoins: 0, nextCursor: null };
    }

    // Dedupe coin IDs across reasons in this page.
    const coinIds: Array<string> = Array.from(
      new Set(page.page.map((row) => row.coingeckoId)),
    ).slice(0, batchSize);

    let refreshedCoins = 0;
    const articleIdsNeedingSentiment: Id<"coingeckoNewsArticles">[] = [];
    for (const coingeckoId of coinIds) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- deliberate sequential pacing against a rate-limited external API
      const items = await refreshNewsForCoin({ coingeckoId, perPage });
      const upserted = await ctx.runMutation(
        internal.coingeckoNewsWriters._upsertNewsForCoin,
        {
          coingeckoId,
          items,
        },
      );
      await ctx.runMutation(
        internal.coingeckoNewsWriters._pruneNewsLinksForCoin,
        { coingeckoId, keep: 20 },
      );
      articleIdsNeedingSentiment.push(...upserted.articleIdsNeedingSentiment);
      refreshedCoins++;
    }

    const batches = chunkArticleIds(
      Array.from(new Set(articleIdsNeedingSentiment)),
      SENTIMENT_BATCH_LIMIT,
    );
    await Promise.all(
      batches.flatMap((articleIds) =>
        articleIds.length === 0
          ? []
          : [
              ctx.scheduler.runAfter(
                0,
                internal.coingeckoNewsJobs.analyzeSentimentBatch,
                {
                  articleIds,
                },
              ),
            ],
      ),
    );

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
    const items = await refreshNewsForCoin({
      coingeckoId: args.coingeckoId,
      perPage,
    });
    const upserted = await ctx.runMutation(
      internal.coingeckoNewsWriters._upsertNewsForCoin,
      {
        coingeckoId: args.coingeckoId,
        items,
      },
    );
    await ctx.runMutation(
      internal.coingeckoNewsWriters._pruneNewsLinksForCoin,
      { coingeckoId: args.coingeckoId, keep: 20 },
    );
    const batches = chunkArticleIds(
      Array.from(new Set(upserted.articleIdsNeedingSentiment)),
      SENTIMENT_BATCH_LIMIT,
    );
    await Promise.all(
      batches.flatMap((articleIds) =>
        articleIds.length === 0
          ? []
          : [
              ctx.scheduler.runAfter(
                0,
                internal.coingeckoNewsJobs.analyzeSentimentBatch,
                {
                  articleIds,
                },
              ),
            ],
      ),
    );
    return null;
  },
});

const NEWS_CATEGORIES = [
  "regulation",
  "security",
  "etf",
  "partnership",
  "market",
  "tech",
  "macro",
  "other",
] as const;

// Lenient on purpose: out-of-range confidence and unknown categories are
// normalized in code rather than failing the whole article.
const ArticleAnalysisSchema = z.object({
  summary: z.string().min(1),
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  category: z.string().optional(),
});

function normalizeCategory(
  raw: string | undefined,
): (typeof NEWS_CATEGORIES)[number] {
  const c = raw?.trim().toLowerCase();
  return (NEWS_CATEGORIES as readonly string[]).includes(c ?? "")
    ? (c as (typeof NEWS_CATEGORIES)[number])
    : "other";
}

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

function heuristicSentiment(title: string): {
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
} {
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
    "crash",
    "tank",
    "tumble",
    "sink",
    "slide",
    "selloff",
    "sell-off",
    "bear",
    "liquidation",
    "down ",
    " -",
  ];
  const bullish = [
    "rally",
    "surge",
    "rise",
    "up ",
    "+",
    "breakout",
    "approval",
    "buy",
    "inflow",
    "record",
    "stake",
    "bull",
    "launch",
  ];

  const hasNegativePct =
    /\bdown\s+\d{1,3}(?:\.\d+)?%/.test(t) || /-\s*\d{1,3}(?:\.\d+)?%/.test(t);
  const hasPositivePct =
    /\bup\s+\d{1,3}(?:\.\d+)?%/.test(t) || /\+\s*\d{1,3}(?:\.\d+)?%/.test(t);

  const hasBearish = hasNegativePct || bearish.some((k) => t.includes(k));
  const hasBullish = hasPositivePct || bullish.some((k) => t.includes(k));

  if (hasBearish && hasBullish)
    return { sentiment: "neutral", confidence: 0.4 };
  if (hasBearish)
    return { sentiment: "bearish", confidence: hasNegativePct ? 0.65 : 0.6 };
  if (hasBullish)
    return { sentiment: "bullish", confidence: hasPositivePct ? 0.65 : 0.6 };
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
      url: string;
      title: string;
      sourceName?: string;
      sentiment?: "bullish" | "bearish" | "neutral";
      aiSummary?: string;
    };

    const docs = (await ctx.runQuery(
      internal.coingeckoNewsWriters._getNewsArticlesByIds,
      {
        articleIds: args.articleIds,
      },
    )) as Array<ArticleDoc | null>;

    // Analyze articles missing a label OR missing a summary (older
    // title-only labels get upgraded by full-article analysis).
    const pending = docs.filter(
      (doc): doc is ArticleDoc =>
        Boolean(doc) &&
        (doc!.sentiment === undefined || doc!.aiSummary === undefined),
    );

    if (pending.length === 0) return { analyzed: 0 };

    type WriteItem = {
      articleId: Id<"coingeckoNewsArticles">;
      sentiment: "bullish" | "bearish" | "neutral";
      confidence: number;
      aiSummary?: string;
      aiCategory?: (typeof NEWS_CATEGORIES)[number];
    };

    const heuristicItems = (arts: ReadonlyArray<ArticleDoc>): WriteItem[] =>
      // The heuristic only labels; it never overwrites an existing label.
      arts
        .filter((a) => a.sentiment === undefined)
        .map((a) => {
          const h = heuristicSentiment(a.title);
          return {
            articleId: a._id,
            sentiment: h.sentiment,
            confidence: h.confidence,
          };
        });

    if (!gem) {
      const items = heuristicItems(pending);
      if (items.length === 0) return { analyzed: 0 };
      await ctx.runMutation(
        internal.coingeckoNewsWriters._setArticleSentimentBatch,
        { items },
      );
      return { analyzed: items.length };
    }

    const coinLinks: Array<{
      articleId: Id<"coingeckoNewsArticles">;
      coingeckoIds: string[];
    }> = await ctx.runQuery(
      internal.coingeckoNewsWriters._getCoinIdsForArticles,
      { articleIds: pending.map((p) => p._id) },
    );
    // Cap coins per article to keep prompts bounded (multi-coin articles are rare).
    const coinsByArticleId = new Map(
      coinLinks.map((row) => [String(row.articleId), row.coingeckoIds.slice(0, 3)]),
    );

    type CoinTechnicalContext = {
      coingeckoId: string;
      priceUsd: number | null;
      change24hPct: number | null;
      change7dPct: number | null;
      change30dPct: number | null;
      pctFromAth: number | null;
      rsi14: number | null;
      trend: "up" | "down" | "flat" | "unknown";
    };
    const allCoinIds = Array.from(
      new Set(Array.from(coinsByArticleId.values()).flat()),
    );
    const technicalContexts: CoinTechnicalContext[] =
      allCoinIds.length > 0
        ? await ctx.runQuery(
            internal.coingeckoNewsWriters._getTechnicalContextForCoins,
            { coingeckoIds: allCoinIds },
          )
        : [];
    const techByCoinId = new Map(
      technicalContexts.map((t) => [t.coingeckoId, t]),
    );

    const system = `
You analyze a crypto news article and label its market sentiment for the specific coin(s) it is linked to.

You will receive JSON with:
- title: the headline
- source_name: the publisher
- coins: coingecko ids of the coin(s) this article is linked to in our app
- article_text: extracted article body (may be partial, noisy, or null)
- technical_context: current technical state of the linked coin(s) at analysis time (trend from daily closes, RSI-14, 24h/7d/30d change %, distance from ATH). May be empty or contain nulls.

Output MUST be valid JSON only with this exact shape:
{
  "summary": string, // 1-2 plain-English sentences: what happened and why it matters for the linked coin(s); no hype; do NOT copy the headline verbatim
  "sentiment": "bullish"|"bearish"|"neutral", // implied direction FOR THE LINKED COIN(S), not the market at large
  "confidence": number, // 0-1, conservative
  "category": "regulation"|"security"|"etf"|"partnership"|"market"|"tech"|"macro"|"other"
}

Rules:
- Base your judgment on article_text when present; otherwise use only the title.
- Judge sentiment from the perspective of someone holding the linked coin(s). News that is broadly about crypto but has no clear implication for the linked coin(s) is neutral with confidence <= 0.4.
- The news drives the sentiment label; technical_context calibrates it. Examples: a bullish headline that merely narrates a move the chart already made (price up big, RSI overbought) is likely priced in — lower the confidence or lean neutral; bearish news against a strong uptrend, or bullish news confirming an uptrend, deserves adjusted confidence accordingly. Never output a sentiment derived from technicals alone.
- If unclear or purely informational, use neutral with confidence <= 0.4.
- Do not invent facts beyond what is provided.
    `.trim();

    const items: WriteItem[] = await Promise.all(
      pending.map(async (article) => {
        const articleText = await fetchArticleText(article.url);
        const articleCoins = coinsByArticleId.get(String(article._id)) ?? [];
        const user = JSON.stringify(
          {
            title: article.title,
            source_name: article.sourceName ?? null,
            coins: articleCoins,
            article_text: articleText,
            technical_context: articleCoins
              .map((coinId) => techByCoinId.get(coinId))
              .filter((t): t is NonNullable<typeof t> => Boolean(t)),
          },
          null,
          2,
        );

        try {
          const result = await generateText({
            model: gem("gemini-2.5-flash"),
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            temperature: 0.1,
            maxOutputTokens: 800,
            providerOptions: {
              // Thinking would eat into maxOutputTokens and truncate the JSON.
              google: { thinkingConfig: { thinkingBudget: 0 } },
            },
          });

          const parsed = ArticleAnalysisSchema.safeParse(
            extractJsonObject(result.text.trim()),
          );
          if (parsed.success) {
            return {
              articleId: article._id,
              sentiment: parsed.data.sentiment,
              confidence: Math.min(1, Math.max(0, parsed.data.confidence)),
              aiSummary: parsed.data.summary.trim().slice(0, 400),
              aiCategory: normalizeCategory(parsed.data.category),
            };
          }
          console.warn(
            `analyzeSentimentBatch: unparseable LLM output for ${article._id}: ${result.text.slice(0, 200)}`,
          );
        } catch (error) {
          console.warn(
            `analyzeSentimentBatch: LLM call failed for ${article._id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        const h = heuristicSentiment(article.title);
        return {
          articleId: article._id,
          sentiment: h.sentiment,
          confidence: h.confidence,
        };
      }),
    );

    if (items.length === 0) return { analyzed: 0 };

    await ctx.runMutation(
      internal.coingeckoNewsWriters._setArticleSentimentBatch,
      { items },
    );
    return { analyzed: items.length };
  },
});

export const backfillRecentMissingSentiment = internalAction({
  args: {
    scanLimit: v.optional(v.number()),
    analyzeLimit: v.optional(v.number()),
  },
  returns: v.object({ queued: v.number() }),
  handler: async (ctx, args): Promise<{ queued: number }> => {
    const scanLimit = Math.min(500, Math.max(1, args.scanLimit ?? 200));
    const analyzeLimit = Math.min(100, Math.max(1, args.analyzeLimit ?? 50));
    const articleIds: Id<"coingeckoNewsArticles">[] = await ctx.runQuery(
      internal.coingeckoNewsWriters._listRecentArticlesMissingSentiment,
      {
        scanLimit,
        analyzeLimit,
      },
    );

    const batches = chunkArticleIds(
      Array.from(new Set(articleIds)),
      SENTIMENT_BATCH_LIMIT,
    );
    await Promise.all(
      batches.flatMap((batchArticleIds) =>
        batchArticleIds.length === 0
          ? []
          : [
              ctx.scheduler.runAfter(
                0,
                internal.coingeckoNewsJobs.analyzeSentimentBatch,
                {
                  articleIds: batchArticleIds,
                },
              ),
            ],
      ),
    );
    return { queued: articleIds.length };
  },
});
