import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const marketWriteItemValidator = v.object({
  coingeckoId: v.string(),
  symbol: v.string(),
  name: v.string(),
  image: v.string(),
  currentPrice: v.optional(v.number()),
  marketCap: v.optional(v.number()),
  marketCapRank: v.optional(v.number()),
  fullyDilutedValuation: v.optional(v.number()),
  totalVolume: v.optional(v.number()),
  high24h: v.optional(v.number()),
  low24h: v.optional(v.number()),
  priceChange24h: v.optional(v.number()),
  priceChangePercentage24h: v.optional(v.number()),
  marketCapChange24h: v.optional(v.number()),
  marketCapChangePercentage24h: v.optional(v.number()),
  circulatingSupply: v.optional(v.number()),
  totalSupply: v.optional(v.number()),
  maxSupply: v.optional(v.number()),
  ath: v.optional(v.number()),
  athChangePercentage: v.optional(v.number()),
  athDate: v.optional(v.string()),
  atl: v.optional(v.number()),
  atlChangePercentage: v.optional(v.number()),
  atlDate: v.optional(v.string()),
  return7dPct: v.optional(v.number()),
  return30dPct: v.optional(v.number()),
  volatility7dPct: v.optional(v.number()),
  technicalsUpdatedAt: v.optional(v.number()),
  lastUpdated: v.string(),
});

// Fields that represent real market movement. `lastUpdated` (a CoinGecko
// response string) changes on every fetch even when nothing moved, so it
// must not participate in the diff.
const MARKET_DIFF_FIELDS = [
  "symbol",
  "name",
  "image",
  "currentPrice",
  "marketCap",
  "marketCapRank",
  "fullyDilutedValuation",
  "totalVolume",
  "high24h",
  "low24h",
  "priceChange24h",
  "priceChangePercentage24h",
  "marketCapChange24h",
  "marketCapChangePercentage24h",
  "circulatingSupply",
  "totalSupply",
  "maxSupply",
  "ath",
  "athChangePercentage",
  "athDate",
  "atl",
  "atlChangePercentage",
  "atlDate",
  // Precomputed technicals (a technicals-only change must still patch).
  // `technicalsUpdatedAt` is intentionally excluded — like `lastUpdated`,
  // it changes on every fetch even when nothing moved.
  "return7dPct",
  "return30dPct",
  "volatility7dPct",
] as const;

function marketItemUnchanged(
  existing: Record<string, unknown>,
  item: Record<string, unknown>,
): boolean {
  for (const field of MARKET_DIFF_FIELDS) {
    // Treat `undefined` in the incoming item as "no data" — don't clobber
    // (or diff against) an existing value with it.
    if (item[field] === undefined) continue;
    if (existing[field] !== item[field]) return false;
  }
  return true;
}

export const _upsertMarketDataBatch = internalMutation({
  args: {
    items: v.array(marketWriteItemValidator),
  },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    unchanged: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const item of args.items) {
      const existing = await ctx.db
        .query("coingeckoMarkets")
        .withIndex("by_coingecko_id", (q) =>
          q.eq("coingeckoId", item.coingeckoId),
        )
        .first();

      if (existing) {
        // Diff before patching: this runs for ~500 coins every 5 minutes.
        // A blind patch creates a new document version (write bandwidth +
        // reactive-query invalidation) even when CoinGecko returned
        // identical numbers.
        if (marketItemUnchanged(existing, item)) {
          unchanged++;
          continue;
        }
        await ctx.db.patch(existing._id, {
          ...item,
          updatedAt: now,
        });
        updated++;
        continue;
      }

      await ctx.db.insert("coingeckoMarkets", {
        ...item,
        createdAt: now,
        updatedAt: now,
      });
      inserted++;
    }

    return { inserted, updated, unchanged };
  },
});

const historyPointValidator = v.object({
  timestamp: v.number(),
  price: v.number(),
  volume: v.number(),
  marketCap: v.optional(v.number()),
  open: v.optional(v.number()),
  high: v.optional(v.number()),
  low: v.optional(v.number()),
  close: v.optional(v.number()),
});

function pickOverlapMs(timeframe: string): number {
  // Keep overlap small to bound reads/writes while handling slight revisions.
  if (timeframe.endsWith("_ohlc")) return 24 * 60 * 60 * 1000;
  if (timeframe === "1") return 6 * 60 * 60 * 1000;
  if (timeframe === "7") return 12 * 60 * 60 * 1000;
  if (timeframe === "14") return 24 * 60 * 60 * 1000;
  return 48 * 60 * 60 * 1000;
}

function pickGlobalMarketOverlapMs(timeframe: string): number {
  if (timeframe === "1") return 6 * 60 * 60 * 1000;
  return 48 * 60 * 60 * 1000;
}

export const _upsertCoinGeckoHistoricalData = internalMutation({
  args: {
    coingeckoId: v.string(),
    timeframe: v.string(),
    dataPoints: v.array(historyPointValidator),
    dataSource: v.string(),
    asOfMs: v.optional(v.number()),
  },
  returns: v.object({
    insertedCount: v.number(),
    updatedCount: v.number(),
    skippedCount: v.number(),
    latestTimestamp: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = args.asOfMs ?? Date.now();
    if (args.dataPoints.length === 0) {
      return {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        latestTimestamp: undefined,
      };
    }

    const minIncomingTimestamp = args.dataPoints.reduce(
      (min, p) => (p.timestamp < min ? p.timestamp : min),
      args.dataPoints[0]?.timestamp ?? Number.POSITIVE_INFINITY,
    );
    const maxIncomingTimestamp = args.dataPoints.reduce(
      (max, p) => (p.timestamp > max ? p.timestamp : max),
      args.dataPoints[0]?.timestamp ?? 0,
    );

    const latestExisting = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe_timestamp", (q) =>
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe),
      )
      .order("desc")
      .first();

    const earliestExisting = latestExisting
      ? await ctx.db
          .query("priceHistory")
          .withIndex("by_coingecko_timeframe_timestamp", (q) =>
            q
              .eq("coingeckoId", args.coingeckoId)
              .eq("timeframe", args.timeframe),
          )
          .order("asc")
          .first()
      : null;

    const overlapMs = pickOverlapMs(args.timeframe);
    const defaultCutoff = latestExisting
      ? latestExisting.timestamp - overlapMs
      : Number.NEGATIVE_INFINITY;
    const shouldBackfill =
      earliestExisting != null &&
      Number.isFinite(minIncomingTimestamp) &&
      earliestExisting.timestamp > minIncomingTimestamp + overlapMs;
    const cutoff = shouldBackfill
      ? minIncomingTimestamp - overlapMs
      : defaultCutoff;
    const upperBound = Number.isFinite(maxIncomingTimestamp)
      ? maxIncomingTimestamp + overlapMs
      : Number.POSITIVE_INFINITY;

    const existingWindow = latestExisting
      ? await ctx.db
          .query("priceHistory")
          .withIndex("by_coingecko_timeframe_timestamp", (q) =>
            q
              .eq("coingeckoId", args.coingeckoId)
              .eq("timeframe", args.timeframe)
              .gte("timestamp", cutoff)
              .lte("timestamp", upperBound),
          )
          .collect()
      : [];

    const byTimestamp = new Map<number, (typeof existingWindow)[number]>();
    for (const row of existingWindow) byTimestamp.set(row.timestamp, row);

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const point of args.dataPoints) {
      // Avoid inserting duplicates for older timestamps on refreshes.
      // We only upsert the overlap window unless we detected missing historical coverage.
      if (point.timestamp < cutoff) {
        skippedCount++;
        continue;
      }

      const existing = byTimestamp.get(point.timestamp);
      if (!existing) {
        await ctx.db.insert("priceHistory", {
          coingeckoId: args.coingeckoId,
          timeframe: args.timeframe,
          timestamp: point.timestamp,
          price: point.price,
          volume: point.volume,
          marketCap: point.marketCap,
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          dataSource: args.dataSource,
          lastUpdated: now,
        });
        insertedCount++;
        continue;
      }

      const hasDiff =
        existing.price !== point.price ||
        existing.volume !== point.volume ||
        (existing.marketCap ?? null) !== (point.marketCap ?? null) ||
        (existing.open ?? null) !== (point.open ?? null) ||
        (existing.high ?? null) !== (point.high ?? null) ||
        (existing.low ?? null) !== (point.low ?? null) ||
        (existing.close ?? null) !== (point.close ?? null);

      if (!hasDiff) {
        skippedCount++;
        continue;
      }

      await ctx.db.patch(existing._id, {
        price: point.price,
        volume: point.volume,
        marketCap: point.marketCap,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        dataSource: args.dataSource,
        lastUpdated: now,
      });
      updatedCount++;
    }

    const latestTimestamp = args.dataPoints.reduce(
      (max, p) => (p.timestamp > max ? p.timestamp : max),
      args.dataPoints[0]?.timestamp ?? 0,
    );

    return { insertedCount, updatedCount, skippedCount, latestTimestamp };
  },
});

const globalMarketHistoryPointValidator = v.object({
  timestamp: v.number(),
  marketCapUsd: v.number(),
  volumeUsd: v.number(),
});

export const _upsertGlobalMarketHistory = internalMutation({
  args: {
    timeframe: v.union(
      v.literal("1"),
      v.literal("7"),
      v.literal("30"),
      v.literal("365"),
    ),
    dataPoints: v.array(globalMarketHistoryPointValidator),
    dataSource: v.string(),
    asOfMs: v.optional(v.number()),
  },
  returns: v.object({
    insertedCount: v.number(),
    updatedCount: v.number(),
    skippedCount: v.number(),
    latestTimestamp: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = args.asOfMs ?? Date.now();
    if (args.dataPoints.length === 0) {
      return {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        latestTimestamp: undefined,
      };
    }

    const uniqueByTimestamp = new Map<
      number,
      (typeof args.dataPoints)[number]
    >();
    for (const point of args.dataPoints)
      uniqueByTimestamp.set(point.timestamp, point);
    const dedupedPoints = Array.from(uniqueByTimestamp.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const minIncomingTimestamp =
      dedupedPoints[0]?.timestamp ?? Number.POSITIVE_INFINITY;
    const maxIncomingTimestamp =
      dedupedPoints[dedupedPoints.length - 1]?.timestamp ?? 0;
    const overlapMs = pickGlobalMarketOverlapMs(args.timeframe);
    const cutoff = minIncomingTimestamp - overlapMs;
    const upperBound = maxIncomingTimestamp + overlapMs;

    const existingWindow = await ctx.db
      .query("globalMarketHistory")
      .withIndex("by_timeframe_timestamp", (q) =>
        q
          .eq("timeframe", args.timeframe)
          .gte("timestamp", cutoff)
          .lte("timestamp", upperBound),
      )
      .collect();

    const byTimestamp = new Map<number, (typeof existingWindow)[number]>();
    for (const row of existingWindow) {
      if (!byTimestamp.has(row.timestamp)) byTimestamp.set(row.timestamp, row);
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const point of dedupedPoints) {
      const existing = byTimestamp.get(point.timestamp);
      if (!existing) {
        await ctx.db.insert("globalMarketHistory", {
          timeframe: args.timeframe,
          timestamp: point.timestamp,
          marketCapUsd: point.marketCapUsd,
          volumeUsd: point.volumeUsd,
          dataSource: args.dataSource,
          lastUpdated: now,
        });
        insertedCount++;
        continue;
      }

      const hasDiff =
        existing.marketCapUsd !== point.marketCapUsd ||
        existing.volumeUsd !== point.volumeUsd;

      if (!hasDiff) {
        skippedCount++;
        continue;
      }

      await ctx.db.patch(existing._id, {
        marketCapUsd: point.marketCapUsd,
        volumeUsd: point.volumeUsd,
        dataSource: args.dataSource,
        lastUpdated: now,
      });
      updatedCount++;
    }

    return {
      insertedCount,
      updatedCount,
      skippedCount,
      latestTimestamp: maxIncomingTimestamp || undefined,
    };
  },
});

const coinGeckoCoinWriteValidator = v.object({
  coingeckoId: v.string(),
  name: v.string(),
  symbol: v.string(),
  logoUrl: v.string(),
  isActive: v.boolean(),
  platforms: v.optional(v.record(v.string(), v.string())),
  imageUpdated: v.optional(v.boolean()),
});

export const _bulkUpsertCoinGeckoCoins = internalMutation({
  args: {
    coins: v.array(coinGeckoCoinWriteValidator),
    asOfMs: v.optional(v.number()),
  },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = args.asOfMs ?? Date.now();

    // Dedupe within request (idempotent under retries).
    const uniqueById = new Map<string, (typeof args.coins)[number]>();
    for (const coin of args.coins) uniqueById.set(coin.coingeckoId, coin);

    let inserted = 0;
    let updated = 0;

    for (const coin of uniqueById.values()) {
      const existing = await ctx.db
        .query("coingeckoCoins")
        .withIndex("by_coingecko_id", (q) =>
          q.eq("coingeckoId", coin.coingeckoId),
        )
        .first();

      if (existing) {
        // Skip the patch when nothing material changed — a blind patch
        // creates a new document version on every sync pass.
        const unchanged =
          existing.name === coin.name &&
          existing.symbol === coin.symbol &&
          existing.logoUrl === coin.logoUrl &&
          existing.isActive === coin.isActive &&
          (coin.imageUpdated === undefined ||
            existing.imageUpdated === coin.imageUpdated) &&
          areStringRecordsEqual(existing.platforms, coin.platforms);
        if (unchanged) continue;

        await ctx.db.patch(existing._id, {
          ...coin,
          lastUpdated: now,
        });
        updated++;
        continue;
      }

      await ctx.db.insert("coingeckoCoins", {
        ...coin,
        lastUpdated: now,
      });
      inserted++;
    }

    return { inserted, updated };
  },
});

const coinGeckoCoinListItemValidator = v.object({
  coingeckoId: v.string(),
  name: v.string(),
  symbol: v.string(),
  platforms: v.optional(v.record(v.string(), v.string())),
});

function areStringRecordsEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const aKeys = Object.keys(a ?? {});
  const bKeys = Object.keys(b ?? {});
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (b?.[key] !== a?.[key]) return false;
  }
  return true;
}

// Sync CoinGecko's `/coins/list` universe into `coingeckoCoins` without clobbering logos.
// - Inserts new ids with `logoUrl: ""` and `imageUpdated: false` (backfilled by cron).
// - Updates name/symbol/platforms for existing rows, preserving `logoUrl` and `imageUpdated`.
export const _syncCoinGeckoCoinsListBatch = internalMutation({
  args: {
    coins: v.array(coinGeckoCoinListItemValidator),
    asOfMs: v.optional(v.number()),
  },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    normalized: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = args.asOfMs ?? Date.now();

    const uniqueById = new Map<string, (typeof args.coins)[number]>();
    for (const coin of args.coins) uniqueById.set(coin.coingeckoId, coin);

    let inserted = 0;
    let updated = 0;
    let normalized = 0;

    for (const coin of uniqueById.values()) {
      const existing = await ctx.db
        .query("coingeckoCoins")
        .withIndex("by_coingecko_id", (q) =>
          q.eq("coingeckoId", coin.coingeckoId),
        )
        .first();

      const nextSymbol = coin.symbol.toUpperCase();
      const nextPlatforms = coin.platforms ?? {};

      if (existing) {
        const shouldNormalizeImageUpdated = existing.imageUpdated === undefined;

        const needsUpdate =
          existing.name !== coin.name ||
          existing.symbol !== nextSymbol ||
          (existing.isActive !== true && existing.isActive !== undefined) ||
          !areStringRecordsEqual(existing.platforms ?? {}, nextPlatforms) ||
          shouldNormalizeImageUpdated;

        if (!needsUpdate) continue;

        await ctx.db.patch(existing._id, {
          name: coin.name,
          symbol: nextSymbol,
          platforms: nextPlatforms,
          isActive: true,
          lastUpdated: now,
          ...(shouldNormalizeImageUpdated ? { imageUpdated: false } : {}),
        });
        updated++;
        if (shouldNormalizeImageUpdated) normalized++;
        continue;
      }

      await ctx.db.insert("coingeckoCoins", {
        coingeckoId: coin.coingeckoId,
        name: coin.name,
        symbol: nextSymbol,
        logoUrl: "",
        isActive: true,
        lastUpdated: now,
        platforms: nextPlatforms,
        imageUpdated: false,
      });
      inserted++;
    }

    return { inserted, updated, normalized };
  },
});
