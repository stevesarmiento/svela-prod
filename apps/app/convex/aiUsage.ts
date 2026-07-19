import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";
import { getUserByClerkId } from "./_lib/user_lookup";

/**
 * Records one use of an AI feature (e.g. "analyze", "screener_search") for a
 * user. Called fire-and-forget from Next.js API routes with the internal
 * server token. Upserts a per-(user, feature) counter row.
 */
export const recordAiFeatureUsage = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    feature: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);

    const user = await getUserByClerkId(ctx.db, args.clerkId);
    if (!user) return null;

    const feature = args.feature.slice(0, 50);
    const existing = await ctx.db
      .query("aiFeatureUsage")
      .withIndex("by_user_feature", (q) =>
        q.eq("userId", user._id).eq("feature", feature),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        lastUsedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("aiFeatureUsage", {
        userId: user._id,
        feature,
        count: 1,
        lastUsedAt: Date.now(),
      });
    }

    return null;
  },
});
