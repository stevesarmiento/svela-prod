import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
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
    const whatIMeant = args.whatIMeant ? scrubPrompt(args.whatIMeant) : undefined;

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

