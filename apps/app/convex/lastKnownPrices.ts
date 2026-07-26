import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const lastKnownPriceValidator = v.object({
  _id: v.id("lastKnownPrices"),
  _creationTime: v.number(),
  coingeckoId: v.string(),
  source: v.string(),
  sessionId: v.string(),
  writerClerkId: v.string(),
  priceUsd: v.number(),
  publishTime: v.optional(v.number()),
  confidence: v.optional(v.number()),
  updatedAt: v.number(),
});

const DEFAULT_SOURCE = "pyth";
const MIN_WRITE_INTERVAL_MS = 15 * 1000;
// When the price hasn't moved, heartbeat at most this often. Every write
// re-runs every other viewer's subscription on the same (coin, source)
// index range, so unchanged-price patches are pure reactive fan-out —
// N viewers of a stablecoin cost ~N² query re-executions per 15s without
// this. A slow heartbeat still keeps rows ahead of the 48h cleanup cron.
const UNCHANGED_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

export const getLastKnownPrice = query({
  args: {
    coingeckoId: v.string(),
    source: v.optional(v.string()),
  },
  returns: v.union(lastKnownPriceValidator, v.null()),
  handler: async (ctx, args) => {
    const source = args.source ?? DEFAULT_SOURCE;
    const row = await ctx.db
      .query("lastKnownPrices")
      .withIndex("by_coingecko_id_and_source_and_updated_at", (q) =>
        q.eq("coingeckoId", args.coingeckoId).eq("source", source),
      )
      .order("desc")
      .first();

    return row ?? null;
  },
});

export const getLastKnownPrices = query({
  args: {
    coingeckoIds: v.array(v.string()),
    source: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(lastKnownPriceValidator),
  handler: async (ctx, args) => {
    const source = args.source ?? DEFAULT_SOURCE;
    const limit = Math.min(250, Math.max(1, args.limit ?? 50));
    const ids = Array.from(
      new Set(
        args.coingeckoIds.flatMap((id) => {
          const trimmed = id.trim();
          return trimmed.length > 0 ? [trimmed] : [];
        }),
      ),
    ).slice(0, limit);

    if (ids.length === 0) return [];

    const rows = await Promise.all(
      ids.map(async (coingeckoId) => {
        const row = await ctx.db
          .query("lastKnownPrices")
          .withIndex("by_coingecko_id_and_source_and_updated_at", (q) =>
            q.eq("coingeckoId", coingeckoId).eq("source", source),
          )
          .order("desc")
          .first();
        return row;
      }),
    );

    return rows.filter((r) => r !== null);
  },
});

export const upsertLastKnownPrice = mutation({
  args: {
    coingeckoId: v.string(),
    source: v.optional(v.string()),
    sessionId: v.string(),
    priceUsd: v.number(),
    publishTime: v.optional(v.number()), // ms
    confidence: v.optional(v.number()),
  },
  returns: v.object({
    didWrite: v.boolean(),
    reason: v.string(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = Date.now();
    const coingeckoId = args.coingeckoId.trim();
    if (!coingeckoId) throw new Error("coingeckoId is required");

    const source = args.source ?? DEFAULT_SOURCE;

    const sessionId = args.sessionId.trim();
    if (!sessionId) throw new Error("sessionId is required");
    if (sessionId.length > 256) throw new Error("sessionId is too long");

    if (!Number.isFinite(args.priceUsd) || args.priceUsd <= 0) {
      return { didWrite: false, reason: "invalid_price", updatedAt: now };
    }

    const existing = await ctx.db
      .query("lastKnownPrices")
      .withIndex("by_coingecko_id_and_source_and_session_id", (q) =>
        q.eq("coingeckoId", coingeckoId).eq("source", source).eq("sessionId", sessionId),
      )
      .first();

    if (existing) {
      if (now - existing.updatedAt < MIN_WRITE_INTERVAL_MS) {
        return { didWrite: false, reason: "cooldown", updatedAt: existing.updatedAt };
      }

      if (
        existing.priceUsd === args.priceUsd &&
        now - existing.updatedAt < UNCHANGED_HEARTBEAT_INTERVAL_MS
      ) {
        return { didWrite: false, reason: "unchanged", updatedAt: existing.updatedAt };
      }

      await ctx.db.patch(existing._id, {
        priceUsd: args.priceUsd,
        publishTime: args.publishTime,
        confidence: args.confidence,
        updatedAt: now,
      });

      return {
        didWrite: true,
        reason: existing.priceUsd === args.priceUsd ? "heartbeat" : "patched",
        updatedAt: now,
      };
    }

    await ctx.db.insert("lastKnownPrices", {
      coingeckoId,
      source,
      sessionId,
      writerClerkId: identity.subject,
      priceUsd: args.priceUsd,
      publishTime: args.publishTime,
      confidence: args.confidence,
      updatedAt: now,
    });

    return { didWrite: true, reason: "inserted", updatedAt: now };
  },
});

