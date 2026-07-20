import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";

function scrubPrompt(input: string): string {
  // Scrub likely secrets/identifiers while keeping intent text.
  return input
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b0x[a-fA-F0-9]{40,}\b/g, "0x…")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,}\b/g, "…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function confidenceBucket(confidence: number): "low" | "medium" | "high" {
  if (!Number.isFinite(confidence)) return "low";
  if (confidence < 0.4) return "low";
  if (confidence < 0.7) return "medium";
  return "high";
}

export const recordPromptFailure = mutation({
  args: {
    serverToken: v.string(),
    createdAtMs: v.number(),
    surface: v.union(v.literal("watchlist"), v.literal("screener")),
    prompt: v.string(),
    confidence: v.number(),
    actionKinds: v.array(v.string()),
    fallbackSearchText: v.optional(v.string()),
    whatIMeant: v.optional(v.string()),
    errorType: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);

    const prompt = scrubPrompt(args.prompt);
    const whatIMeant = args.whatIMeant
      ? scrubPrompt(args.whatIMeant)
      : undefined;

    await ctx.db.insert("smartScreenerPromptFailures", {
      createdAtMs: args.createdAtMs,
      surface: args.surface,
      prompt,
      confidence: Number.isFinite(args.confidence) ? args.confidence : 0,
      confidenceBucket: confidenceBucket(args.confidence),
      actionKinds: args.actionKinds.slice(0, 20),
      fallbackSearchText: args.fallbackSearchText?.slice(0, 200),
      whatIMeant,
      errorType: args.errorType?.slice(0, 50),
    });

    return null;
  },
});

const eventKindValidator = v.union(
  v.literal("interpret_cache_hit"),
  v.literal("interpret_success"),
  v.literal("interpret_invalid_output"),
  v.literal("interpret_low_confidence"),
  v.literal("interpret_error"),
  v.literal("execute_success"),
  v.literal("execute_empty"),
  v.literal("execute_error"),
);

const eventSurfaceValidator = v.union(
  v.literal("watchlist"),
  v.literal("screener"),
  v.literal("internal"),
);

export const recordEvent = mutation({
  args: {
    serverToken: v.string(),
    createdAtMs: v.number(),
    surface: eventSurfaceValidator,
    kind: eventKindValidator,
    prompt: v.optional(v.string()),
    dslJson: v.optional(v.string()),
    confidence: v.number(),
    requestId: v.string(),
    latencyMs: v.optional(v.number()),
    model: v.optional(v.string()),
    promptVersion: v.optional(v.number()),
    errorType: v.optional(v.string()),
    scanned: v.optional(v.number()),
    matched: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);

    await ctx.db.insert("smartScreenerEvents", {
      createdAtMs: args.createdAtMs,
      surface: args.surface,
      kind: args.kind,
      prompt: args.prompt ? scrubPrompt(args.prompt) : undefined,
      dslJson: args.dslJson?.slice(0, 2000),
      confidence: Number.isFinite(args.confidence) ? args.confidence : 0,
      requestId: args.requestId.slice(0, 64),
      latencyMs: args.latencyMs,
      model: args.model?.slice(0, 64),
      promptVersion: args.promptVersion,
      errorType: args.errorType?.slice(0, 50),
      scanned: args.scanned,
      matched: args.matched,
    });

    return null;
  },
});

const eventDocValidator = v.object({
  _id: v.id("smartScreenerEvents"),
  _creationTime: v.number(),
  createdAtMs: v.number(),
  surface: eventSurfaceValidator,
  kind: eventKindValidator,
  prompt: v.optional(v.string()),
  dslJson: v.optional(v.string()),
  confidence: v.number(),
  requestId: v.string(),
  latencyMs: v.optional(v.number()),
  model: v.optional(v.string()),
  promptVersion: v.optional(v.number()),
  errorType: v.optional(v.string()),
  scanned: v.optional(v.number()),
  matched: v.optional(v.number()),
});

export const listEvents = query({
  args: {
    serverToken: v.string(),
    kind: v.optional(eventKindValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(eventDocValidator),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const limit = Math.min(200, Math.max(1, args.limit ?? 50));

    const kind = args.kind;
    if (kind) {
      return await ctx.db
        .query("smartScreenerEvents")
        .withIndex("by_kind_and_created_at_ms", (q) => q.eq("kind", kind))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("smartScreenerEvents")
      .withIndex("by_created_at_ms")
      .order("desc")
      .take(limit);
  },
});

export const listPromptFailures = query({
  args: {
    serverToken: v.string(),
    surface: v.optional(v.union(v.literal("watchlist"), v.literal("screener"))),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("smartScreenerPromptFailures"),
      _creationTime: v.number(),
      createdAtMs: v.number(),
      surface: v.union(v.literal("watchlist"), v.literal("screener")),
      prompt: v.string(),
      confidence: v.number(),
      confidenceBucket: v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
      ),
      actionKinds: v.array(v.string()),
      fallbackSearchText: v.optional(v.string()),
      whatIMeant: v.optional(v.string()),
      errorType: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const limit = Math.min(200, Math.max(1, args.limit ?? 50));

    const surface = args.surface;
    if (surface) {
      return await ctx.db
        .query("smartScreenerPromptFailures")
        .withIndex("by_surface_and_created_at_ms", (q) =>
          q.eq("surface", surface),
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("smartScreenerPromptFailures")
      .withIndex("by_created_at_ms")
      .order("desc")
      .take(limit);
  },
});
