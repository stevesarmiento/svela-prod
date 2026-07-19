import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";
import { getUserByClerkId } from "./_lib/user_lookup";

const isDebug = process.env.LOG_LEVEL === "debug";

const userValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  clerkId: v.string(),
  devClerkId: v.optional(v.string()),
  email: v.optional(v.string()),
  fullName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  walletAddress: v.optional(v.string()),
});

export const getCurrentUser = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    return await getUserByClerkId(ctx.db, args.clerkId);
  },
});

export const createUser = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    if (isDebug)
      console.log("[users.createUser] called", { clerkId: args.clerkId });
    const email = args.email?.trim() || undefined;

    // Check if user already exists
    const existingUser = await getUserByClerkId(ctx.db, args.clerkId);

    if (existingUser) {
      // Update existing user. When matched via the linked devClerkId (local
      // dev session), don't overwrite production profile data.
      if (existingUser.clerkId === args.clerkId) {
        await ctx.db.patch(existingUser._id, {
          email,
          fullName: args.fullName,
          avatarUrl: args.avatarUrl,
        });
      }
      return existingUser._id;
    }

    // Create new user
    const newUserId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email,
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
    });
    if (isDebug)
      console.log("[users.createUser] inserted", { userId: newUserId });
    return newUserId;
  },
});

export const updateUser = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await getUserByClerkId(ctx.db, args.clerkId);

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
    });

    return null;
  },
});

/**
 * Backfill-only: set the sign-in wallet address for a user without touching
 * other profile fields. Used by admin/backfill scripts with the server token;
 * the normal path is `upsertCurrentUser` from the client bootstrap.
 */
export const setWalletAddress = mutation({
  args: {
    serverToken: v.string(),
    clerkId: v.string(),
    walletAddress: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const user = await getUserByClerkId(ctx.db, args.clerkId);
    if (!user) return null;
    await ctx.db.patch(user._id, { walletAddress: args.walletAddress });
    return null;
  },
});

export const upsertCurrentUser = mutation({
  args: {
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = identity.subject;
    const email = args.email?.trim() || undefined;

    const existing = await getUserByClerkId(ctx.db, clerkId);

    if (existing) {
      // When matched via the linked devClerkId (local dev session), don't
      // overwrite production profile data with dev-instance values.
      if (existing.clerkId === clerkId) {
        await ctx.db.patch(existing._id, {
          email,
          fullName: args.fullName,
          avatarUrl: args.avatarUrl,
          ...(args.walletAddress ? { walletAddress: args.walletAddress } : {}),
        });
      }
      return existing._id;
    }

    const id = await ctx.db.insert("users", {
      clerkId,
      email,
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
      walletAddress: args.walletAddress,
    });
    if (isDebug)
      console.log("[users.upsertCurrentUser] inserted", { userId: id });
    return id;
  },
});
