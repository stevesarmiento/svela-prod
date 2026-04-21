import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireServerToken } from "./_lib/server_token";
import { dedupeAndSortByOccurredAt, isCacheFresh, rankMovers } from "./_lib/overview_signals";

type Window = "24h" | "7d";

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

type MarketSnapshot = {
  source: "currentMarketData" | "coingeckoMarkets";
  priceUsd: number;
  volume24hUsd: number;
  marketCapUsd: number;
  change24hPct: number | null;
  change7dPct: number | null;
  lastUpdatedMs: number;
};

function asFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseIsoMs(value: string | undefined | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

async function getMarketSnapshot(ctx: QueryCtx, coingeckoId: string): Promise<MarketSnapshot | null> {
  const current = await ctx.db
    .query("currentMarketData")
    .withIndex("by_coingecko", (q) => q.eq("coingeckoId", coingeckoId))
    .first();

  if (current) {
    return {
      source: "currentMarketData",
      priceUsd: current.price,
      volume24hUsd: current.volume24h,
      marketCapUsd: current.marketCap,
      change24hPct: current.change24h,
      change7dPct: asFiniteNumberOrNull(current.change7d),
      lastUpdatedMs: current.lastUpdated,
    };
  }

  const market = await ctx.db
    .query("coingeckoMarkets")
    .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", coingeckoId))
    .first();

  if (!market) return null;

  const priceUsd = asFiniteNumberOrNull(market.currentPrice);
  const volume24hUsd = asFiniteNumberOrNull(market.totalVolume) ?? 0;
  const marketCapUsd = asFiniteNumberOrNull(market.marketCap) ?? 0;
  const change24hPct = asFiniteNumberOrNull(market.priceChangePercentage24h);
  const lastUpdatedMs =
    (typeof market.updatedAt === "number" && Number.isFinite(market.updatedAt) && market.updatedAt > 0
      ? market.updatedAt
      : parseIsoMs(market.lastUpdated)) ?? Date.now();

  if (priceUsd === null) return null;

  return {
    source: "coingeckoMarkets",
    priceUsd,
    volume24hUsd,
    marketCapUsd,
    change24hPct,
    change7dPct: null,
    lastUpdatedMs,
  };
}

async function compute7dChangePctFromHistory(
  ctx: QueryCtx,
  coingeckoId: string,
): Promise<number | null> {
  const earliest = await ctx.db
    .query("priceHistory")
    .withIndex("by_coingecko_timeframe_timestamp", (q) =>
      q.eq("coingeckoId", coingeckoId).eq("timeframe", "7"),
    )
    .order("asc")
    .first();

  const latest = await ctx.db
    .query("priceHistory")
    .withIndex("by_coingecko_timeframe_timestamp", (q) =>
      q.eq("coingeckoId", coingeckoId).eq("timeframe", "7"),
    )
    .order("desc")
    .first();

  if (!earliest || !latest) return null;
  if (!Number.isFinite(earliest.price) || earliest.price <= 0) return null;
  if (!Number.isFinite(latest.price)) return null;

  const pct = ((latest.price - earliest.price) / earliest.price) * 100;
  return Number.isFinite(pct) ? pct : null;
}

async function getCurrentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
  return user ?? null;
}

async function getOverviewHoldingsBreakdown(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<OverviewHoldingsGroupRow[]> {
  const [groups, rows] = await Promise.all([
    ctx.db
      .query("watchlistGroups")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("watchlists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);

  const groupsById = new Map(groups.map((group) => [group._id, group] as const));
  const holdingsByGroupId = new Map<Id<"watchlistGroups">, Map<string, number>>();

  for (const row of rows) {
    const holdings = row.holdings;
    if (typeof holdings !== "number") continue;
    if (!Number.isFinite(holdings) || holdings <= 0) continue;

    const groupId = row.watchlistGroupId;
    if (!groupsById.has(groupId)) continue;

    const byCoin = holdingsByGroupId.get(groupId) ?? new Map<string, number>();
    byCoin.set(row.coinId, (byCoin.get(row.coinId) ?? 0) + holdings);
    holdingsByGroupId.set(groupId, byCoin);
  }

  const result = Array.from(holdingsByGroupId.entries())
    .map(([groupId, byCoin]) => {
      const group = groupsById.get(groupId);
      if (!group) return null;

      const positions = Array.from(byCoin.entries())
        .map(([coinId, coinHoldings]) => ({ coinId, holdings: coinHoldings }))
        .sort((a, b) => a.coinId.localeCompare(b.coinId));

      const totalHoldings = positions.reduce((sum, row) => sum + row.holdings, 0);

      return {
        group,
        positions,
        totalHoldings,
        coinsWithHoldings: positions.length,
      };
    })
    .filter(
      (row): row is NonNullable<typeof row> =>
        row !== null && row.positions.length > 0,
    );

  result.sort((a, b) => a.group.name.localeCompare(b.group.name));
  return result;
}

const windowValidator = v.union(v.literal("24h"), v.literal("7d"));

const overviewStatusValidator = v.union(
  v.literal("missing"),
  v.literal("fresh"),
  v.literal("stale"),
);

const overviewHoldingsGroupValidator = v.object({
  group: v.object({
    _id: v.id("watchlistGroups"),
    _creationTime: v.number(),
    userId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    portfolioWalletId: v.optional(v.id("portfolioWallets")),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  positions: v.array(
    v.object({
      coinId: v.string(),
      holdings: v.number(),
    }),
  ),
  totalHoldings: v.number(),
  coinsWithHoldings: v.number(),
});

const moverRowValidator = v.object({
  coingeckoId: v.string(),
  name: v.string(),
  symbol: v.string(),
  logoUrl: v.union(v.string(), v.null()),
  priceUsd: v.number(),
  changePct: v.number(),
  impactUsd: v.union(v.number(), v.null()),
});

const moversSnapshotValidator = v.object({
  generatedAt: v.number(),
  coinCount: v.number(),
  missingMarketDataCount: v.number(),
  gainers: v.array(moverRowValidator),
  losers: v.array(moverRowValidator),
});

const MoverRowSchema = z.object({
  coingeckoId: z.string(),
  name: z.string(),
  symbol: z.string(),
  logoUrl: z.string().nullable(),
  priceUsd: z.number(),
  changePct: z.number(),
  impactUsd: z.number().nullable(),
});

const MoversSnapshotSchema = z.object({
  generatedAt: z.number(),
  coinCount: z.number(),
  missingMarketDataCount: z.number(),
  gainers: z.array(MoverRowSchema),
  losers: z.array(MoverRowSchema),
});

const eventKindValidator = v.union(
  v.literal("news"),
  v.literal("price_spike"),
  v.literal("volume_anomaly"),
  v.literal("breakout_high"),
  v.literal("breakout_low"),
);

const eventToneValidator = v.union(
  v.literal("positive"),
  v.literal("negative"),
  v.literal("neutral"),
);

const overviewEventValidator = v.object({
  id: v.string(),
  articleId: v.union(v.string(), v.null()),
  kind: eventKindValidator,
  tone: eventToneValidator,
  sentiment: v.union(
    v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral")),
    v.null(),
  ),
  occurredAtMs: v.number(),
  coingeckoId: v.string(),
  name: v.string(),
  symbol: v.string(),
  logoUrl: v.union(v.string(), v.null()),
  title: v.string(),
  summary: v.union(v.string(), v.null()),
  tokenHref: v.string(),
  externalHref: v.union(v.string(), v.null()),
  valueUsd: v.union(v.number(), v.null()),
  percent: v.union(v.number(), v.null()),
});

function newsToneFromSentiment(
  sentiment: "bullish" | "bearish" | "neutral" | null,
): "positive" | "negative" | "neutral" {
  if (sentiment === "bullish") return "positive";
  if (sentiment === "bearish") return "negative";
  return "neutral";
}

const eventsSnapshotValidator = v.object({
  generatedAt: v.number(),
  coinCount: v.number(),
  limited: v.boolean(),
  events: v.array(overviewEventValidator),
});

const OverviewEventSchema = z.object({
  id: z.string(),
  articleId: z.string().nullable(),
  kind: z.enum([
    "news",
    "price_spike",
    "volume_anomaly",
    "breakout_high",
    "breakout_low",
  ]),
  tone: z.enum(["positive", "negative", "neutral"]),
  sentiment: z.enum(["bullish", "bearish", "neutral"]).nullable(),
  occurredAtMs: z.number(),
  coingeckoId: z.string(),
  name: z.string(),
  symbol: z.string(),
  logoUrl: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  tokenHref: z.string(),
  externalHref: z.string().nullable(),
  valueUsd: z.number().nullable(),
  percent: z.number().nullable(),
});

const EventsSnapshotSchema = z.object({
  generatedAt: z.number(),
  coinCount: z.number(),
  limited: z.boolean(),
  events: z.array(OverviewEventSchema),
});

const newsSentimentOverlayRowValidator = v.object({
  articleId: v.string(),
  sentiment: v.union(
    v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral")),
    v.null(),
  ),
  sentimentConfidence: v.union(v.number(), v.null()),
  sentimentUpdatedAt: v.union(v.number(), v.null()),
});

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
}

const DailyBriefSchema = z.object({
  summary: z.string().min(1).max(700),
  headline: z.string().min(1).max(160),
  bullets: z.array(z.string().min(1).max(220)).min(0).max(8).default([]),
  risks: z.array(z.string().min(1).max(220)).max(6).default([]),
  opportunities: z.array(z.string().min(1).max(220)).max(6).default([]),
  cards: z
    .array(
      z.object({
        kind: z.enum(["top_gainer", "top_loser", "events", "regime", "technicals", "theme"]),
        title: z.string().min(1).max(48),
        primary: z.string().min(1).max(120),
        secondary: z.string().min(1).max(160).nullable().default(null),
        body: z.string().min(1).max(240),
        tone: z.enum(["positive", "negative", "neutral"]),
      }),
    )
    .max(6)
    .default([]),
});

const DailyBriefSchemaV1 = DailyBriefSchema.omit({ summary: true, cards: true });

// Cache rows include extra metadata fields; accept them but validate the core brief shape.
// Also accept older cache entries (without `summary`) and map them forward.
const DailyBriefCacheDataSchemaV2 = DailyBriefSchema.extend({
  generatedAt: z.number().optional(),
  model: z.string().nullable().optional(),
}).passthrough();

const DailyBriefCacheDataSchemaV1 = DailyBriefSchemaV1.extend({
  generatedAt: z.number().optional(),
  model: z.string().nullable().optional(),
}).passthrough();

const DailyBriefCacheDataSchema = z
  .union([DailyBriefCacheDataSchemaV2, DailyBriefCacheDataSchemaV1])
  .transform((data) => {
    if ("summary" in data && "cards" in data) return data;
    // Older cache entries lacked `summary` and `cards`. Avoid reconstructing from bullets here
    // because older bullets often repeat mover facts the UI already shows elsewhere.
    return { ...data, summary: data.headline, cards: [] };
  })
  .pipe(DailyBriefCacheDataSchemaV2);

function normalizeBriefText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeBriefList(items: ReadonlyArray<string>, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const text = normalizeBriefText(raw);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeDailyBrief(brief: z.infer<typeof DailyBriefSchema>): z.infer<typeof DailyBriefSchema> {
  const summary =
    normalizeBriefText(brief.summary).slice(0, 700) || "No major movers/events in cache for this window.";
  const headline = normalizeBriefText(brief.headline).slice(0, 160) || "Overview brief";
  const bullets = normalizeBriefList(brief.bullets, 6);
  const risks = normalizeBriefList(brief.risks ?? [], 4);
  const opportunities = normalizeBriefList(brief.opportunities ?? [], 4);
  const cards = (() => {
    const out: z.infer<typeof DailyBriefSchema>["cards"] = [];
    const seen = new Set<string>();
    for (const card of brief.cards ?? []) {
      if (!card) continue;
      if (seen.has(card.kind)) continue;
      seen.add(card.kind);
      out.push({
        kind: card.kind,
        title: normalizeBriefText(card.title).slice(0, 48) || card.kind,
        primary: normalizeBriefText(card.primary).slice(0, 120) || "—",
        secondary: (() => {
          const v = card.secondary == null ? null : normalizeBriefText(card.secondary).slice(0, 160);
          return v && v.length > 0 ? v : null;
        })(),
        body: normalizeBriefText(card.body).slice(0, 240) || "—",
        tone: card.tone,
      });
      if (out.length >= 6) break;
    }
    return out;
  })();

  return {
    summary,
    headline,
    bullets,
    risks,
    opportunities,
    cards,
  };
}

const dailyBriefValidator = v.object({
  summary: v.string(),
  headline: v.string(),
  bullets: v.array(v.string()),
  risks: v.array(v.string()),
  opportunities: v.array(v.string()),
  cards: v.array(
    v.object({
      kind: v.union(
        v.literal("top_gainer"),
        v.literal("top_loser"),
        v.literal("events"),
        v.literal("regime"),
        v.literal("technicals"),
        v.literal("theme"),
      ),
      title: v.string(),
      primary: v.string(),
      secondary: v.union(v.string(), v.null()),
      body: v.string(),
      tone: v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
    }),
  ),
  generatedAt: v.number(),
  model: v.union(v.string(), v.null()),
});

const dailyBriefCacheValidator = v.object({
  status: v.union(v.literal("missing"), v.literal("fresh"), v.literal("stale")),
  stale: v.boolean(),
  expiresAt: v.union(v.number(), v.null()),
  generatedAt: v.union(v.number(), v.null()),
  brief: v.union(dailyBriefValidator, v.null()),
});

function buildDailyBriefCacheKey(args: {
  clerkId: string;
  window: Window;
}): string {
  return `overview:dailyBrief:${args.clerkId}:watchlist:${args.window}`;
}

function buildSnapshotCacheKey(args: { clerkId: string }): string {
  // Bump when snapshot shape/semantics change (e.g. news-only feed) so stale apiCache rows are not reused.
  return `overview:watchlist:snapshot:v4:${args.clerkId}`;
}

type MoversSnapshot = z.infer<typeof MoversSnapshotSchema>;
type EventsSnapshot = z.infer<typeof EventsSnapshotSchema>;

type DailyBriefCache = {
  status: "missing" | "fresh" | "stale";
  stale: boolean;
  expiresAt: number | null;
  generatedAt: number | null;
  brief: {
    summary: string;
    headline: string;
    bullets: string[];
    risks: string[];
    opportunities: string[];
    cards: Array<{
      kind: "top_gainer" | "top_loser" | "events" | "regime" | "technicals" | "theme";
      title: string;
      primary: string;
      secondary: string | null;
      body: string;
      tone: "positive" | "negative" | "neutral";
    }>;
    generatedAt: number;
    model: string | null;
  } | null;
};

type OverviewHoldingsGroupRow = {
  group: {
    _id: Id<"watchlistGroups">;
    _creationTime: number;
    userId: Id<"users">;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    color?: string;
    portfolioWalletId?: Id<"portfolioWallets">;
    isDefault: boolean;
    createdAt: number;
    updatedAt: number;
  };
  positions: Array<{
    coinId: string;
    holdings: number;
  }>;
  totalHoldings: number;
  coinsWithHoldings: number;
};

type OverviewBootstrap = {
  status: "missing" | "fresh" | "stale";
  generatedAt: number | null;
  watchlistCoinCount: number;
  limited: boolean;
  holdingsBreakdown: OverviewHoldingsGroupRow[];
  movers24h: MoversSnapshot;
  movers7d: MoversSnapshot;
  events: EventsSnapshot;
  brief24h: DailyBriefCache;
  brief7d: DailyBriefCache;
};

type RefreshOverviewSnapshotResult = {
  refreshed: boolean;
  reason: string;
  generatedAt: number | null;
  watchlistCoinCount: number;
  limited: boolean;
};

type DailyBrief = {
  summary: string;
  headline: string;
  bullets: string[];
  risks: string[];
  opportunities: string[];
  cards: Array<{
    kind: "top_gainer" | "top_loser" | "events" | "regime" | "technicals" | "theme";
    title: string;
    primary: string;
    secondary: string | null;
    body: string;
    tone: "positive" | "negative" | "neutral";
  }>;
  generatedAt: number;
  model: string | null;
};

function emptyMoversSnapshot(now: number): MoversSnapshot {
  return {
    generatedAt: now,
    coinCount: 0,
    missingMarketDataCount: 0,
    gainers: [],
    losers: [],
  };
}

function emptyEventsSnapshot(now: number): EventsSnapshot {
  return { generatedAt: now, coinCount: 0, limited: false, events: [] };
}

function emptyBriefCache(): DailyBriefCache {
  return {
    status: "missing",
    stale: true,
    expiresAt: null,
    generatedAt: null,
    brief: null,
  };
}

function parseBriefCacheRow(row: {
  data: unknown;
  expiresAt: number;
  createdAt: number;
}): DailyBriefCache {
  const now = Date.now();
  const isFresh = isCacheFresh(row.expiresAt, now);
  const status: "fresh" | "stale" = isFresh ? "fresh" : "stale";

  const parsed = DailyBriefCacheDataSchema.safeParse(row.data);
  if (!parsed.success) {
    return {
      status,
      stale: !isFresh,
      expiresAt: row.expiresAt,
      generatedAt: null,
      brief: null,
    };
  }

  const generatedAt = parsed.data.generatedAt ?? row.createdAt;
  const model = parsed.data.model ?? null;

  return {
    status,
    stale: !isFresh,
    expiresAt: row.expiresAt,
    generatedAt,
    brief: {
      summary: parsed.data.summary,
      headline: parsed.data.headline,
      bullets: parsed.data.bullets,
      risks: parsed.data.risks ?? [],
      opportunities: parsed.data.opportunities ?? [],
      cards: parsed.data.cards ?? [],
      generatedAt,
      model,
    },
  };
}

export const _upsertApiCache = internalMutation({
  args: {
    cacheKey: v.string(),
    data: v.any(),
    expiresAt: v.number(),
    dataSource: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("apiCache")
      .withIndex("by_key", (q) => q.eq("cacheKey", args.cacheKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        data: args.data,
        expiresAt: args.expiresAt,
        lastAccessed: now,
        hitCount: (existing.hitCount ?? 0) + 1,
        dataSource: args.dataSource,
      });
      return null;
    }

    await ctx.db.insert("apiCache", {
      cacheKey: args.cacheKey,
      data: args.data,
      expiresAt: args.expiresAt,
      hitCount: 1,
      lastAccessed: now,
      dataSource: args.dataSource,
      createdAt: now,
    });
    return null;
  },
});

function buildFallbackBrief(args: {
  window: Window;
  movers: { gainers: Array<{ symbol: string; changePct: number }>; losers: Array<{ symbol: string; changePct: number }> };
  events: Array<{ kind: string; symbol: string; title: string }>;
}): z.infer<typeof DailyBriefSchema> {
  const topGainer = args.movers.gainers[0];
  const topLoser = args.movers.losers[0];
  const eventKinds = new Set(args.events.map((e) => e.kind));

  const bullets: Array<string> = [];
  if (topGainer) {
    bullets.push(
      `${topGainer.symbol.toUpperCase()} leads on ${args.window} momentum (${topGainer.changePct > 0 ? "+" : ""}${topGainer.changePct.toFixed(2)}%).`,
    );
  }
  if (topLoser) {
    bullets.push(
      `${topLoser.symbol.toUpperCase()} is the weakest mover (${topLoser.changePct > 0 ? "+" : ""}${topLoser.changePct.toFixed(2)}%).`,
    );
  }
  if (eventKinds.size > 0) {
    bullets.push(`Events detected across your watchlist: ${Array.from(eventKinds).join(", ")}.`);
  }

  const headline =
    topGainer || topLoser
      ? `Overview brief: watchlist ${args.window} movers`
      : "Overview brief: watchlist update";

  const summaryParts: string[] = [];
  if (topGainer) {
    summaryParts.push(
      `${topGainer.symbol.toUpperCase()} is leading your watchlist over the last ${args.window} (${topGainer.changePct > 0 ? "+" : ""}${topGainer.changePct.toFixed(2)}%).`,
    );
  }
  if (topLoser) {
    summaryParts.push(
      `${topLoser.symbol.toUpperCase()} is the main laggard (${topLoser.changePct > 0 ? "+" : ""}${topLoser.changePct.toFixed(2)}%).`,
    );
  }
  if (eventKinds.size > 0) {
    summaryParts.push(`Notable event types showing up: ${Array.from(eventKinds).join(", ")}.`);
  }

  return {
    summary:
      summaryParts.length > 0
        ? summaryParts.join(" ")
        : "No major movers or notable events were detected in the current cache window.",
    headline,
    bullets: bullets.length > 0 ? bullets.slice(0, 6) : [],
    risks: [],
    opportunities: [],
    cards: [],
  };
}

const overviewSnapshotValidator = v.object({
  generatedAt: v.number(),
  watchlistCoinCount: v.number(),
  limited: v.boolean(),
  movers24h: moversSnapshotValidator,
  movers7d: moversSnapshotValidator,
  events: eventsSnapshotValidator,
});

const OverviewSnapshotSchema = z.object({
  generatedAt: z.number(),
  watchlistCoinCount: z.number(),
  limited: z.boolean(),
  movers24h: MoversSnapshotSchema,
  movers7d: MoversSnapshotSchema,
  events: EventsSnapshotSchema,
});

type OverviewSnapshot = z.infer<typeof OverviewSnapshotSchema>;

export const _getApiCacheEntry = internalQuery({
  args: { cacheKey: v.string() },
  returns: v.union(
    v.object({
      cacheKey: v.string(),
      data: v.any(),
      expiresAt: v.number(),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("apiCache")
      .withIndex("by_key", (q) => q.eq("cacheKey", args.cacheKey))
      .first();
    if (!row) return null;
    return {
      cacheKey: row.cacheKey,
      data: row.data,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  },
});

type Candidate = { coingeckoId: string; marketCapUsd: number; volume24hUsd: number };

function normalizeCandidate(row: Candidate): Candidate {
  const marketCapUsd = Number.isFinite(row.marketCapUsd) && row.marketCapUsd > 0 ? row.marketCapUsd : 0;
  const volume24hUsd = Number.isFinite(row.volume24hUsd) && row.volume24hUsd > 0 ? row.volume24hUsd : 0;
  return { coingeckoId: row.coingeckoId, marketCapUsd, volume24hUsd };
}

async function buildRankedCoinUniverse(ctx: QueryCtx, watchlistIds: ReadonlyArray<string>): Promise<{
  watchlistCoinCount: number;
  limited: boolean;
  coinIds: string[];
}> {
  const unique = Array.from(new Set(watchlistIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  unique.sort();

  const watchlistCoinCount = unique.length;
  const MAX_COINS = 250;
  const limited = watchlistCoinCount > MAX_COINS;
  if (watchlistCoinCount === 0) return { watchlistCoinCount: 0, limited: false, coinIds: [] };

  // For <=250 coins we can rank precisely using per-coin lookups.
  if (watchlistCoinCount <= MAX_COINS) {
    const candidates = await Promise.all(
      unique.map(async (coingeckoId) => {
        const snap = await getMarketSnapshot(ctx, coingeckoId);
        return normalizeCandidate({
          coingeckoId,
          marketCapUsd: snap?.marketCapUsd ?? 0,
          volume24hUsd: snap?.volume24hUsd ?? 0,
        });
      }),
    );

    candidates.sort((a, b) => {
      if (b.marketCapUsd !== a.marketCapUsd) return b.marketCapUsd - a.marketCapUsd;
      if (b.volume24hUsd !== a.volume24hUsd) return b.volume24hUsd - a.volume24hUsd;
      return a.coingeckoId.localeCompare(b.coingeckoId);
    });

    return { watchlistCoinCount, limited, coinIds: candidates.map((c) => c.coingeckoId) };
  }

  // For large watchlists, avoid per-coin reads: intersect with a global "top" scan.
  // NOTE: We avoid `paginate()` entirely because Convex only permits a single paginated query per function,
  // and repeated paginate calls (even for the same table) will throw at runtime.
  const watchSet = new Set(unique);
  const candidatesById = new Map<string, Candidate>();

  const SCAN_N = 2500;
  const topCurrent = await ctx.db
    .query("currentMarketData")
    .withIndex("by_rank", (q) => q.gte("rank", 1))
    .order("asc")
    .take(SCAN_N);

  for (const row of topCurrent) {
    if (!watchSet.has(row.coingeckoId)) continue;
    if (candidatesById.has(row.coingeckoId)) continue;
    candidatesById.set(
      row.coingeckoId,
      normalizeCandidate({
        coingeckoId: row.coingeckoId,
        marketCapUsd: row.marketCap,
        volume24hUsd: row.volume24h,
      }),
    );
    if (candidatesById.size >= MAX_COINS) break;
  }

  if (candidatesById.size < MAX_COINS) {
    const topMarkets = await ctx.db
      .query("coingeckoMarkets")
      .withIndex("by_market_cap_rank", (q) => q.gte("marketCapRank", 1))
      .order("asc")
      .take(SCAN_N);

    for (const row of topMarkets) {
      if (!watchSet.has(row.coingeckoId)) continue;
      if (candidatesById.has(row.coingeckoId)) continue;
      candidatesById.set(
        row.coingeckoId,
        normalizeCandidate({
          coingeckoId: row.coingeckoId,
          marketCapUsd: asFiniteNumberOrNull(row.marketCap) ?? 0,
          volume24hUsd: asFiniteNumberOrNull(row.totalVolume) ?? 0,
        }),
      );
      if (candidatesById.size >= MAX_COINS) break;
    }
  }

  // Fill any remaining slots deterministically (unranked coins end up at the end).
  if (candidatesById.size < MAX_COINS) {
    for (const coingeckoId of unique) {
      if (candidatesById.has(coingeckoId)) continue;
      candidatesById.set(coingeckoId, { coingeckoId, marketCapUsd: 0, volume24hUsd: 0 });
      if (candidatesById.size >= MAX_COINS) break;
    }
  }

  const sorted = Array.from(candidatesById.values()).sort((a, b) => {
    if (b.marketCapUsd !== a.marketCapUsd) return b.marketCapUsd - a.marketCapUsd;
    if (b.volume24hUsd !== a.volume24hUsd) return b.volume24hUsd - a.volume24hUsd;
    return a.coingeckoId.localeCompare(b.coingeckoId);
  });

  return { watchlistCoinCount, limited, coinIds: sorted.slice(0, MAX_COINS).map((c) => c.coingeckoId) };
}

/** Ranked overview coin universe for a user (same ordering as snapshot movers/events). */
export const _getMyRankedOverviewCoinIds = internalQuery({
  args: { clerkId: v.string() },
  returns: v.object({
    coinIds: v.array(v.string()),
    watchlistCoinCount: v.number(),
    limited: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) {
      return { coinIds: [], watchlistCoinCount: 0, limited: false };
    }

    const rows = await ctx.db
      .query("watchlists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const watchlistIds = rows.map((row) => row.coinId);
    const universe = await buildRankedCoinUniverse(ctx, watchlistIds);
    return {
      coinIds: universe.coinIds,
      watchlistCoinCount: universe.watchlistCoinCount,
      limited: universe.limited,
    };
  },
});

const OVERVIEW_NEWS_WARMUP_DEDUP_MS = 5 * 60 * 1000;
const OVERVIEW_NEWS_WARMUP_MAX_COINS = 20;
const OVERVIEW_NEWS_WARMUP_STAGGER_MS = 250;

/** Touch watchlist tracking and schedule CoinGecko news fetches (deduped, staggered). */
export const _scheduleWatchlistNewsWarmup = internalMutation({
  args: { coinIds: v.array(v.string()) },
  returns: v.object({
    scheduled: v.number(),
    skippedCooldown: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const unique = Array.from(
      new Set(args.coinIds.map((id) => id.trim()).filter((id) => id.length > 0)),
    );
    if (unique.length === 0) {
      return { scheduled: 0, skippedCooldown: 0 };
    }

    await ctx.runMutation(internal.coingeckoState._touchTrackedCoinsBatch, {
      coingeckoIds: unique,
      reason: "watchlist",
      lastSeen: now,
    });

    const target = unique.slice(0, OVERVIEW_NEWS_WARMUP_MAX_COINS);
    let scheduled = 0;
    let skippedCooldown = 0;

    for (let i = 0; i < target.length; i++) {
      const coingeckoId = target[i]!;
      const jobKey = `warmup:overview-news:${coingeckoId}`;
      const existing = await ctx.db
        .query("jobState")
        .withIndex("by_job_key", (q) => q.eq("jobKey", jobKey))
        .first();

      if (existing && now - existing.updatedAt < OVERVIEW_NEWS_WARMUP_DEDUP_MS) {
        skippedCooldown += 1;
        continue;
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

      await ctx.scheduler.runAfter(
        i * OVERVIEW_NEWS_WARMUP_STAGGER_MS,
        internal.coingeckoNewsJobs.refreshCoinNews,
        { coingeckoId, perPage: 5 },
      );
      scheduled += 1;
    }

    return { scheduled, skippedCooldown };
  },
});

export const _computeMyOverviewSnapshotPayload = internalQuery({
  args: { clerkId: v.string() },
  returns: overviewSnapshotValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) {
      return {
        generatedAt: now,
        watchlistCoinCount: 0,
        limited: false,
        movers24h: emptyMoversSnapshot(now),
        movers7d: emptyMoversSnapshot(now),
        events: emptyEventsSnapshot(now),
      };
    }

    const rows = await ctx.db
      .query("watchlists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const watchlistIds = rows.map((row) => row.coinId);
    const universe = await buildRankedCoinUniverse(ctx, watchlistIds);

    const coinIds = universe.coinIds;
    if (coinIds.length === 0) {
      return {
        generatedAt: now,
        watchlistCoinCount: universe.watchlistCoinCount,
        limited: universe.limited,
        movers24h: emptyMoversSnapshot(now),
        movers7d: emptyMoversSnapshot(now),
        events: emptyEventsSnapshot(now),
      };
    }

    const [snapshotDocs, metaDocs] = await Promise.all([
      Promise.all(
        coinIds.map(async (coingeckoId) => {
          const snapshot = await getMarketSnapshot(ctx, coingeckoId);
          return { coingeckoId, snapshot };
        }),
      ),
      Promise.all(
        coinIds.map(async (coingeckoId) => {
          const doc = await ctx.db
            .query("coingeckoCoins")
            .withIndex("by_coingecko_id", (q) => q.eq("coingeckoId", coingeckoId))
            .first();
          return { coingeckoId, doc };
        }),
      ),
    ]);

    const metaById = new Map(metaDocs.map((row) => [row.coingeckoId, row.doc] as const));
    const snapshotById = new Map(
      snapshotDocs.map((row) => [row.coingeckoId, row.snapshot] as const),
    );

    function getMeta(coingeckoId: string): { name: string; symbol: string; logoUrl: string | null } {
      const meta = metaById.get(coingeckoId);
      const name =
        typeof meta?.name === "string" && meta.name.trim().length > 0 ? meta.name : coingeckoId;
      const symbol =
        typeof meta?.symbol === "string" && meta.symbol.trim().length > 0
          ? meta.symbol
          : coingeckoId.slice(0, 8);
      const logoUrl =
        typeof meta?.logoUrl === "string" && meta.logoUrl.trim().length > 0 ? meta.logoUrl : null;
      return { name, symbol, logoUrl };
    }

    // Movers (24h and 7d) ----------------------------------------------------
    const MOVERS_LIMIT = 6;
    const computed7dById = new Map<string, number>();
    {
      const needsCompute = coinIds.filter((id) => {
        const s = snapshotById.get(id);
        return s !== null && s !== undefined && s.change7dPct === null;
      });
      const MAX_7D_COMPUTE = 60;
      const computeIds = [...needsCompute]
        .sort((a, b) => {
          const av = snapshotById.get(a)?.volume24hUsd ?? 0;
          const bv = snapshotById.get(b)?.volume24hUsd ?? 0;
          return bv - av;
        })
        .slice(0, MAX_7D_COMPUTE);

      const computed = await Promise.all(
        computeIds.map(async (coingeckoId) => {
          const pct = await compute7dChangePctFromHistory(ctx, coingeckoId);
          return { coingeckoId, pct };
        }),
      );
      for (const row of computed) {
        if (typeof row.pct === "number" && Number.isFinite(row.pct)) {
          computed7dById.set(row.coingeckoId, row.pct);
        }
      }
    }

    function buildMovers(window: Window): MoversSnapshot {
      const movers: Array<{
        coingeckoId: string;
        name: string;
        symbol: string;
        logoUrl: string | null;
        priceUsd: number;
        changePct: number;
        impactUsd: number | null;
      }> = [];

      let missingMarketDataCount = 0;

      for (const coingeckoId of coinIds) {
        const snapshot = snapshotById.get(coingeckoId) ?? null;
        if (!snapshot) {
          missingMarketDataCount += 1;
          continue;
        }
        const changePctRaw =
          window === "24h"
            ? snapshot.change24hPct
            : snapshot.change7dPct ?? computed7dById.get(coingeckoId) ?? null;
        if (typeof changePctRaw !== "number" || !Number.isFinite(changePctRaw)) {
          missingMarketDataCount += 1;
          continue;
        }

        const meta = getMeta(coingeckoId);
        movers.push({
          coingeckoId,
          name: meta.name,
          symbol: meta.symbol,
          logoUrl: meta.logoUrl,
          priceUsd: snapshot.priceUsd,
          changePct: changePctRaw,
          impactUsd: null,
        });
      }

      const ranked = rankMovers(movers, MOVERS_LIMIT);
      return {
        generatedAt: now,
        coinCount: coinIds.length,
        missingMarketDataCount,
        gainers: ranked.gainers,
        losers: ranked.losers,
      };
    }

    const movers24h = buildMovers("24h");
    const movers7d = buildMovers("7d");

    // Events (news only; latest one article per watchlist coin in ranked universe)
    const events: Array<{
      id: string;
      articleId: string | null;
      kind: "news" | "price_spike" | "volume_anomaly" | "breakout_high" | "breakout_low";
      tone: "positive" | "negative" | "neutral";
      sentiment: "bullish" | "bearish" | "neutral" | null;
      occurredAtMs: number;
      coingeckoId: string;
      name: string;
      symbol: string;
      logoUrl: string | null;
      title: string;
      summary: string | null;
      tokenHref: string;
      externalHref: string | null;
      valueUsd: number | null;
      percent: number | null;
    }> = [];

    const newsLinks = await Promise.all(
      coinIds.map(async (coingeckoId) => {
        const link = await ctx.db
          .query("coingeckoNewsCoinLinks")
          .withIndex("by_coingecko_id_and_posted_at_ms", (q) => q.eq("coingeckoId", coingeckoId))
          .order("desc")
          .take(1);
        return link.length > 0 ? { coingeckoId, link: link[0]! } : null;
      }),
    );

    const links = newsLinks.filter((x): x is NonNullable<typeof x> => x !== null);
    const uniqueArticleIds = Array.from(new Set(links.map((l) => l.link.articleId)));
    const articleDocs = await Promise.all(uniqueArticleIds.map((id) => ctx.db.get(id)));
    const articleById = new Map(
      uniqueArticleIds.map((id, i) => [String(id), articleDocs[i]] as const),
    );

    for (const row of links) {
      const article = articleById.get(String(row.link.articleId));
      if (!article) continue;
      const meta = getMeta(row.coingeckoId);
      const sentiment = article.sentiment ?? null;
      const postedAtMs =
        typeof article.postedAtMs === "number" ? article.postedAtMs : row.link.postedAtMs;
      const marketSnap = snapshotById.get(row.coingeckoId);
      const pct24h =
        marketSnap && typeof marketSnap.change24hPct === "number" && Number.isFinite(marketSnap.change24hPct)
          ? marketSnap.change24hPct
          : null;
      const pct7dRaw =
        marketSnap?.change7dPct ?? computed7dById.get(row.coingeckoId) ?? null;
      const pct7d =
        typeof pct7dRaw === "number" && Number.isFinite(pct7dRaw) ? pct7dRaw : null;
      // Prefer 24h for feed badge; fall back to 7d when 24h missing (common on coingeckoMarkets rows).
      const percentForBadge = pct24h ?? pct7d;
      events.push({
        id: `news:${String(article._id)}`,
        articleId: String(article._id),
        kind: "news",
        tone: newsToneFromSentiment(sentiment),
        sentiment,
        occurredAtMs: postedAtMs,
        coingeckoId: row.coingeckoId,
        name: meta.name,
        symbol: meta.symbol,
        logoUrl: meta.logoUrl,
        title: article.title,
        summary: article.sourceName ?? null,
        tokenHref: `/charts/${row.coingeckoId}`,
        externalHref: article.url,
        valueUsd: null,
        percent: percentForBadge,
      });
    }

    const EVENT_LIMIT = 30;
    const merged = dedupeAndSortByOccurredAt(events);
    const eventsSnapshot = {
      generatedAt: now,
      coinCount: coinIds.length,
      limited: universe.limited,
      events: merged.slice(0, EVENT_LIMIT),
    };

    return {
      generatedAt: now,
      watchlistCoinCount: universe.watchlistCoinCount,
      limited: universe.limited,
      movers24h,
      movers7d,
      events: eventsSnapshot,
    };
  },
});

export const getMyOverviewBootstrap = query({
  args: {},
  returns: v.object({
    status: overviewStatusValidator,
    generatedAt: v.union(v.number(), v.null()),
    watchlistCoinCount: v.number(),
    limited: v.boolean(),
    holdingsBreakdown: v.array(overviewHoldingsGroupValidator),
    movers24h: moversSnapshotValidator,
    movers7d: moversSnapshotValidator,
    events: eventsSnapshotValidator,
    brief24h: dailyBriefCacheValidator,
    brief7d: dailyBriefCacheValidator,
  }),
  handler: async (ctx): Promise<OverviewBootstrap> => {
    const now = Date.now();
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        status: "missing",
        generatedAt: null,
        watchlistCoinCount: 0,
        limited: false,
        holdingsBreakdown: [],
        movers24h: emptyMoversSnapshot(now),
        movers7d: emptyMoversSnapshot(now),
        events: emptyEventsSnapshot(now),
        brief24h: emptyBriefCache(),
        brief7d: emptyBriefCache(),
      };
    }

    const user = await getCurrentUser(ctx);
    if (!user) {
      return {
        status: "missing",
        generatedAt: null,
        watchlistCoinCount: 0,
        limited: false,
        holdingsBreakdown: [],
        movers24h: emptyMoversSnapshot(now),
        movers7d: emptyMoversSnapshot(now),
        events: emptyEventsSnapshot(now),
        brief24h: emptyBriefCache(),
        brief7d: emptyBriefCache(),
      };
    }

    const snapshotKey = buildSnapshotCacheKey({ clerkId: identity.subject });
    const snapshotRow = await ctx.db
      .query("apiCache")
      .withIndex("by_key", (q) => q.eq("cacheKey", snapshotKey))
      .first();

    let status: "missing" | "fresh" | "stale" = "missing";
    let snapshot: OverviewSnapshot | null = null;
    if (snapshotRow) {
      status = isCacheFresh(snapshotRow.expiresAt, now) ? "fresh" : "stale";
      const parsed = OverviewSnapshotSchema.safeParse(snapshotRow.data);
      snapshot = parsed.success ? parsed.data : null;
    }

    const brief24hKey = buildDailyBriefCacheKey({ clerkId: identity.subject, window: "24h" });
    const brief7dKey = buildDailyBriefCacheKey({ clerkId: identity.subject, window: "7d" });
    const [brief24hRow, brief7dRow, holdingsBreakdown] = await Promise.all([
      ctx.db.query("apiCache").withIndex("by_key", (q) => q.eq("cacheKey", brief24hKey)).first(),
      ctx.db.query("apiCache").withIndex("by_key", (q) => q.eq("cacheKey", brief7dKey)).first(),
      getOverviewHoldingsBreakdown(ctx, user._id),
    ]);

    const brief24h = brief24hRow
      ? parseBriefCacheRow({
          data: brief24hRow.data,
          expiresAt: brief24hRow.expiresAt,
          createdAt: brief24hRow.createdAt,
        })
      : emptyBriefCache();
    const brief7d = brief7dRow
      ? parseBriefCacheRow({
          data: brief7dRow.data,
          expiresAt: brief7dRow.expiresAt,
          createdAt: brief7dRow.createdAt,
        })
      : emptyBriefCache();

    const generatedAt = snapshot?.generatedAt ?? null;
    const watchlistCoinCount = snapshot?.watchlistCoinCount ?? 0;
    const limited = snapshot?.limited ?? false;
    const movers24h = snapshot?.movers24h ?? emptyMoversSnapshot(now);
    const movers7d = snapshot?.movers7d ?? emptyMoversSnapshot(now);
    const events = snapshot?.events ?? emptyEventsSnapshot(now);

    return {
      status,
      generatedAt,
      watchlistCoinCount,
      limited,
      holdingsBreakdown,
      movers24h,
      movers7d,
      events,
      brief24h,
      brief7d,
    };
  },
});

export const getNewsSentimentOverlay = query({
  args: { articleIds: v.array(v.string()) },
  returns: v.array(newsSentimentOverlayRowValidator),
  handler: async (ctx, args) => {
    const uniqueArticleIds = Array.from(
      new Set(
        args.articleIds
          .map((articleId) => articleId.trim())
          .filter((articleId) => articleId.length > 0),
      ),
    ).slice(0, 100);

    const rows = await Promise.all(
      uniqueArticleIds.map(async (articleId) => {
        const doc = await ctx.db.get(articleId as Id<"coingeckoNewsArticles">);
        if (!doc) return null;
        return {
          articleId,
          sentiment: doc.sentiment ?? null,
          sentimentConfidence: doc.sentimentConfidence ?? null,
          sentimentUpdatedAt: doc.sentimentUpdatedAt ?? null,
        };
      }),
    );

    return rows.filter((row): row is NonNullable<typeof row> => row !== null);
  },
});

// Server-only helper: lets Next.js routes read the cached snapshot without Convex auth.
export const getMyOverviewSnapshotForServer = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: v.union(overviewSnapshotValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);

    const cacheKey = buildSnapshotCacheKey({ clerkId: args.clerkId });
    const row = await ctx.db
      .query("apiCache")
      .withIndex("by_key", (q) => q.eq("cacheKey", cacheKey))
      .first();

    if (!row) return null;
    const parsed = OverviewSnapshotSchema.safeParse(row.data);
    return parsed.success ? parsed.data : null;
  },
});

// Server-only helper: lets Next.js routes upsert the cached daily brief without Convex auth.
export const upsertMyOverviewBriefForServer = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    window: windowValidator,
    brief: v.object({
      summary: v.string(),
      headline: v.string(),
      bullets: v.array(v.string()),
      risks: v.array(v.string()),
      opportunities: v.array(v.string()),
      cards: v.array(
        v.object({
          kind: v.union(
            v.literal("top_gainer"),
            v.literal("top_loser"),
            v.literal("events"),
            v.literal("regime"),
            v.literal("technicals"),
            v.literal("theme"),
          ),
          title: v.string(),
          primary: v.string(),
          secondary: v.union(v.string(), v.null()),
          body: v.string(),
          tone: v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
        }),
      ),
      model: v.union(v.string(), v.null()),
    }),
  },
  returns: dailyBriefValidator,
  handler: async (ctx, args): Promise<DailyBrief> => {
    requireServerToken(args.serverToken);

    const now = Date.now();
    const TTL_MS = 6 * 60 * 60 * 1000;
    const expiresAt = now + TTL_MS;
    const cacheKey = buildDailyBriefCacheKey({ clerkId: args.clerkId, window: args.window as Window });

    const data = {
      summary: args.brief.summary,
      headline: args.brief.headline,
      bullets: args.brief.bullets,
      risks: args.brief.risks,
      opportunities: args.brief.opportunities,
      cards: args.brief.cards,
      generatedAt: now,
      model: args.brief.model ?? null,
    };

    const existing = await ctx.db
      .query("apiCache")
      .withIndex("by_key", (q) => q.eq("cacheKey", cacheKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        data,
        expiresAt,
        lastAccessed: now,
        hitCount: (existing.hitCount ?? 0) + 1,
        dataSource: args.brief.model ? "gemini" : "fallback",
      });
    } else {
      await ctx.db.insert("apiCache", {
        cacheKey,
        data,
        expiresAt,
        hitCount: 1,
        lastAccessed: now,
        dataSource: args.brief.model ? "gemini" : "fallback",
        createdAt: now,
      });
    }

    return {
      summary: data.summary,
      headline: data.headline,
      bullets: data.bullets,
      risks: data.risks,
      opportunities: data.opportunities,
      cards: data.cards,
      generatedAt: now,
      model: data.model,
    };
  },
});

export const refreshMyOverviewSnapshot = action({
  args: { force: v.optional(v.boolean()) },
  returns: v.object({
    refreshed: v.boolean(),
    reason: v.string(),
    generatedAt: v.union(v.number(), v.null()),
    watchlistCoinCount: v.number(),
    limited: v.boolean(),
  }),
  handler: async (ctx, args): Promise<RefreshOverviewSnapshotResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { refreshed: false, reason: "not_authenticated", generatedAt: null, watchlistCoinCount: 0, limited: false };
    }

    const now = Date.now();
    const cacheKey = buildSnapshotCacheKey({ clerkId: identity.subject });
    const existing = await ctx.runQuery(internal.overview._getApiCacheEntry, { cacheKey });
    if (args.force !== true && existing && isCacheFresh(existing.expiresAt, now)) {
      const parsed = OverviewSnapshotSchema.safeParse(existing.data);
      const snapshot = parsed.success ? parsed.data : null;
      return {
        refreshed: false,
        reason: "fresh",
        generatedAt: snapshot?.generatedAt ?? null,
        watchlistCoinCount: snapshot?.watchlistCoinCount ?? 0,
        limited: snapshot?.limited ?? false,
      };
    }

    const ranked = await ctx.runQuery(internal.overview._getMyRankedOverviewCoinIds, {
      clerkId: identity.subject,
    });
    if (ranked.coinIds.length > 0) {
      await ctx.runMutation(internal.overview._scheduleWatchlistNewsWarmup, {
        coinIds: ranked.coinIds,
      });
    }

    const snapshot = await ctx.runQuery(internal.overview._computeMyOverviewSnapshotPayload, {
      clerkId: identity.subject,
    });

    const TTL_MS = 60 * 60 * 1000;
    await ctx.runMutation(internal.overview._upsertApiCache, {
      cacheKey,
      data: snapshot,
      expiresAt: now + TTL_MS,
      dataSource: "overview_snapshot_v4",
    });

    return {
      refreshed: true,
      reason: "refreshed",
      generatedAt: snapshot.generatedAt,
      watchlistCoinCount: snapshot.watchlistCoinCount,
      limited: snapshot.limited,
    };
  },
});

export const generateMyOverviewBrief = action({
  args: {
    window: windowValidator,
    force: v.optional(v.boolean()),
  },
  returns: dailyBriefValidator,
  handler: async (ctx, args): Promise<DailyBrief> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        summary: "Sign in to generate a personalized brief for your watchlist.",
        headline: "Overview brief",
        bullets: [],
        risks: [],
        opportunities: [],
        cards: [],
        generatedAt: Date.now(),
        model: null,
      };
    }

    const clerkId = identity.subject;
    const now = Date.now();
    const TTL_MS = 6 * 60 * 60 * 1000;
    const expiresAt = now + TTL_MS;

    const cacheKey = buildDailyBriefCacheKey({ clerkId, window: args.window as Window });
    const existing = await ctx.runQuery(internal.overview._getApiCacheEntry, { cacheKey });
    if (args.force !== true && existing && isCacheFresh(existing.expiresAt, now)) {
      const parsed = DailyBriefCacheDataSchema.safeParse(existing.data);
      if (parsed.success) {
        const modelName = parsed.data.model ?? null;
        const generatedAt = parsed.data.generatedAt ?? existing.createdAt;
        return {
          summary: parsed.data.summary,
          headline: parsed.data.headline,
          bullets: parsed.data.bullets,
          risks: parsed.data.risks ?? [],
          opportunities: parsed.data.opportunities ?? [],
          cards: parsed.data.cards ?? [],
          generatedAt,
          model: modelName,
        };
      }
    }

    const snapshotKey = buildSnapshotCacheKey({ clerkId });
    const snapshotRow = await ctx.runQuery(internal.overview._getApiCacheEntry, { cacheKey: snapshotKey });
    const snapshotParsed = snapshotRow ? OverviewSnapshotSchema.safeParse(snapshotRow.data) : null;
    const snapshot = snapshotParsed?.success ? snapshotParsed.data : null;

    const moversBlock =
      args.window === "7d" ? snapshot?.movers7d ?? null : snapshot?.movers24h ?? null;

    const moversPayload = moversBlock
      ? {
          gainers: moversBlock.gainers.map((m) => ({
            symbol: m.symbol,
            changePct: m.changePct,
            impactUsd: m.impactUsd,
          })),
          losers: moversBlock.losers.map((m) => ({
            symbol: m.symbol,
            changePct: m.changePct,
            impactUsd: m.impactUsd,
          })),
          contributors: [] as Array<{ symbol: string; impactUsd: number; changePct: number }>,
        }
      : { gainers: [], losers: [], contributors: [] as Array<{ symbol: string; impactUsd: number; changePct: number }> };

    const eventsPayload = (snapshot?.events.events ?? []).slice(0, 18).map((e) => ({
      kind: e.kind,
      symbol: e.symbol,
      title: e.title,
      summary: e.summary,
    }));

    const gem = getGemini();
    let brief: z.infer<typeof DailyBriefSchema> | null = null;
    let modelName: string | null = null;

    if (gem) {
      modelName = "gemini-2.5-flash";
      const system = `
You write a concise daily brief for a crypto dashboard.

Input is JSON containing:
- window ("24h" or "7d")
- movers (gainers/losers with changePct and optional impactUsd)
- events (kind + title + summary)

Rules:
- Do not invent facts or numbers. Use only values provided in the input JSON.
- Keep it decision-focused and scannable. Write like a helpful, calm analyst.
- If there is not enough signal, be explicit ("No major movers/events in cache").

Formatting:
- summary: 1 short paragraph (2-4 sentences), no bullets/markdown
- headline: short (<= 120 chars)
- bullets: 0-6 items (optional)
- risks: 0-4 items
- opportunities: 0-4 items
      `.trim();

      const user = JSON.stringify(
        {
          window: args.window,
          movers: moversPayload,
          events: eventsPayload,
        },
        null,
        2,
      );

      try {
        const result = await generateText({
          model: gem(modelName),
          system,
          prompt: user,
          output: Output.object({
            schema: DailyBriefSchema,
            name: "DailyBrief",
            description: "A concise daily brief for a crypto dashboard (headline, bullets, risks, opportunities).",
          }),
          temperature: 0.2,
          maxOutputTokens: 600,
          maxRetries: 2,
        });

        brief = sanitizeDailyBrief(result.output);
      } catch {
        brief = null;
      }
    }

    if (!brief) {
      brief = buildFallbackBrief({
        window: args.window as Window,
        movers: {
          gainers: moversPayload.gainers.map((g) => ({ symbol: g.symbol, changePct: g.changePct })),
          losers: moversPayload.losers.map((l) => ({ symbol: l.symbol, changePct: l.changePct })),
        },
        events: eventsPayload.map((e) => ({ kind: e.kind, symbol: e.symbol, title: e.title })),
      });
      modelName = null;
    }

    const cacheData = {
      ...brief,
      generatedAt: now,
      model: modelName,
    };

    await ctx.runMutation(internal.overview._upsertApiCache, {
      cacheKey,
      data: cacheData,
      expiresAt,
      dataSource: modelName ? "gemini" : "fallback",
    });

    return {
      summary: brief.summary,
      headline: brief.headline,
      bullets: brief.bullets,
      risks: brief.risks ?? [],
      opportunities: brief.opportunities ?? [],
      cards: brief.cards ?? [],
      generatedAt: now,
      model: modelName,
    };
  },
});
