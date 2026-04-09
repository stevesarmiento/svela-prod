import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";
import type { Doc } from "./_generated/dataModel";

const priceHistoryPointValidator = v.object({
  _id: v.id("priceHistory"),
  _creationTime: v.number(),
  coingeckoId: v.string(),
  timeframe: v.string(),
  timestamp: v.number(),
  price: v.number(),
  volume: v.number(),
  marketCap: v.optional(v.number()),
  open: v.optional(v.number()),
  high: v.optional(v.number()),
  low: v.optional(v.number()),
  close: v.optional(v.number()),
  dataSource: v.string(),
  lastUpdated: v.number(),
});

const globalMarketHistoryPointValidator = v.object({
  _id: v.id("globalMarketHistory"),
  _creationTime: v.number(),
  timeframe: v.string(),
  timestamp: v.number(),
  marketCapUsd: v.number(),
  volumeUsd: v.number(),
  dataSource: v.string(),
  lastUpdated: v.number(),
});

const MAX_RETURN_POINTS = 8192;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHUNK_SIZE = 4096;
const MAX_CHUNKS = 6;

function getStaleWindowMs(timeframe: string): number {
  const base = timeframe.replace(/_ohlc$/, "");
  // Stale windows are tuned to our cron cadence:
  // - Quotes/charts: ~hourly
  // - Medium windows: ~4h
  // - Long windows / OHLC: ~daily
  if (base === "1") return 60 * 60 * 1000;
  if (base === "7") return 60 * 60 * 1000;
  if (base === "14") return 60 * 60 * 1000;
  if (base === "30") return 4 * 60 * 60 * 1000;
  if (base === "90") return 4 * 60 * 60 * 1000;
  if (base === "365") return 24 * 60 * 60 * 1000;
  if (base === "730") return 24 * 60 * 60 * 1000;
  if (base === "1825") return 24 * 60 * 60 * 1000;
  if (base === "max") return 24 * 60 * 60 * 1000;
  return 10 * 60 * 1000;
}

function getGlobalMarketStaleWindowMs(timeframe: string): number {
  if (timeframe === "1") return 90 * 60 * 1000;
  return 36 * 60 * 60 * 1000;
}

function getWindowStartMs(timeframe: string, now: number): number | null {
  const base = timeframe.replace(/_ohlc$/, "");
  if (base === "max") return now - 1825 * DAY_MS; // cap "max" to ~5y for safety

  const n = Number(base);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Include a little buffer to avoid edge gaps while the cron is mid-refresh.
  return now - n * DAY_MS - 60 * 60 * 1000;
}

function downsampleEvenly<T>(items: Array<T>, maxPoints: number): Array<T> {
  if (items.length <= maxPoints) return items;
  if (maxPoints <= 1) return [items[items.length - 1] as T];

  const step = (items.length - 1) / (maxPoints - 1);
  const out: Array<T> = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    out.push(items[idx] as T);
  }
  return out;
}

export const getPriceHistorySeries = query({
  args: {
    serverToken: v.string(),
    coingeckoId: v.string(),
    timeframe: v.string(),
  },
  returns: v.object({
    data: v.array(priceHistoryPointValidator),
    lastUpdated: v.number(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();
    const endMs = now + 5 * 60 * 1000;

    const latest = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe_and_last_updated", (q) =>
        q.eq("coingeckoId", args.coingeckoId).eq("timeframe", args.timeframe),
      )
      .order("desc")
      .first();

    if (!latest) {
      return { data: [], lastUpdated: 0, stale: false };
    }

    const startMs = getWindowStartMs(args.timeframe, now);

    // NOTE: Convex arrays have a hard max length (8192). Never return unbounded series.
    // Dedupe by `timestamp` to tolerate accidental duplicate writes (keeps newest per timestamp).
    const byTimestamp = new Map<number, Doc<"priceHistory">>();
    let beforeTimestamp = endMs;

    for (let i = 0; i < MAX_CHUNKS; i++) {
      const chunk = await ctx.db
        .query("priceHistory")
        .withIndex("by_coingecko_timeframe_timestamp", (q) => {
          if (startMs !== null) {
            return q
              .eq("coingeckoId", args.coingeckoId)
              .eq("timeframe", args.timeframe)
              .gte("timestamp", startMs)
              .lte("timestamp", beforeTimestamp);
          }
          return q
            .eq("coingeckoId", args.coingeckoId)
            .eq("timeframe", args.timeframe)
            .lte("timestamp", beforeTimestamp);
        })
        .order("desc")
        .take(CHUNK_SIZE);

      if (chunk.length === 0) break;

      let minTimestampInChunk = Number.POSITIVE_INFINITY;
      for (const row of chunk) {
        if (!byTimestamp.has(row.timestamp))
          byTimestamp.set(row.timestamp, row);
        if (row.timestamp < minTimestampInChunk)
          minTimestampInChunk = row.timestamp;
        if (byTimestamp.size >= MAX_RETURN_POINTS) break;
      }

      if (byTimestamp.size >= MAX_RETURN_POINTS) break;
      if (!Number.isFinite(minTimestampInChunk)) break;
      if (startMs !== null && minTimestampInChunk <= startMs) break;

      const nextBefore = minTimestampInChunk - 1;
      if (nextBefore >= beforeTimestamp) break;
      beforeTimestamp = nextBefore;
    }

    const data = Array.from(byTimestamp.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const staleWindowMs = getStaleWindowMs(args.timeframe);
    return {
      data,
      lastUpdated: latest.lastUpdated,
      stale: latest.lastUpdated <= now - staleWindowMs,
    };
  },
});

export const getGlobalMarketHistorySeries = query({
  args: {
    serverToken: v.string(),
    timeframe: v.union(
      v.literal("1"),
      v.literal("7"),
      v.literal("30"),
      v.literal("365"),
    ),
  },
  returns: v.object({
    data: v.array(globalMarketHistoryPointValidator),
    lastUpdated: v.number(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const now = Date.now();

    const latest = await ctx.db
      .query("globalMarketHistory")
      .withIndex("by_timeframe_last_updated", (q) =>
        q.eq("timeframe", args.timeframe),
      )
      .order("desc")
      .first();

    if (!latest) {
      return { data: [], lastUpdated: 0, stale: false };
    }

    const data = await ctx.db
      .query("globalMarketHistory")
      .withIndex("by_timeframe_timestamp", (q) =>
        q.eq("timeframe", args.timeframe),
      )
      .order("asc")
      .collect();

    return {
      data,
      lastUpdated: latest.lastUpdated,
      stale:
        latest.lastUpdated <=
        now - getGlobalMarketStaleWindowMs(args.timeframe),
    };
  },
});
