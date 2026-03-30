import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";

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

const MAX_RETURN_POINTS = 8192;
const DAY_MS = 24 * 60 * 60 * 1000;

function getStaleWindowMs(timeframe: string): number {
  const base = timeframe.replace(/_ohlc$/, "");
  // Stale windows are tuned to our cron cadence:
  // - Quotes/charts: ~hourly
  // - Medium windows: ~4h
  // - Long windows / OHLC: ~daily
  if (base === "1") return 60 * 60 * 1000;
  if (base === "7") return 60 * 60 * 1000;
  if (base === "30") return 4 * 60 * 60 * 1000;
  if (base === "90") return 4 * 60 * 60 * 1000;
  if (base === "365") return 24 * 60 * 60 * 1000;
  if (base === "730") return 24 * 60 * 60 * 1000;
  if (base === "1825") return 24 * 60 * 60 * 1000;
  if (base === "max") return 24 * 60 * 60 * 1000;
  return 10 * 60 * 1000;
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

    // NOTE: Convex arrays have a hard max length (8192). Never collect unbounded series.
    // We keep the most recent points and return them in ascending order.
    const latestPoints = await ctx.db
      .query("priceHistory")
      .withIndex("by_coingecko_timeframe_timestamp", (q) => {
        if (startMs !== null) {
          return q
            .eq("coingeckoId", args.coingeckoId)
            .eq("timeframe", args.timeframe)
            .gte("timestamp", startMs)
            .lte("timestamp", endMs);
        }
        return q
          .eq("coingeckoId", args.coingeckoId)
          .eq("timeframe", args.timeframe)
          .lte("timestamp", endMs);
      })
      .order("desc")
      .take(MAX_RETURN_POINTS);

    const data = latestPoints.slice().reverse();

    const staleWindowMs = getStaleWindowMs(args.timeframe);
    return {
      data,
      lastUpdated: latest.lastUpdated,
      stale: latest.lastUpdated <= now - staleWindowMs,
    };
  },
});

