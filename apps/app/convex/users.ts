import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServerToken } from "./_lib/server_token";

const isDebug = process.env.LOG_LEVEL === "debug";

const userValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  clerkId: v.string(),
  email: v.optional(v.string()),
  fullName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
});

export const getCurrentUser = query({
  args: { serverToken: v.string(), clerkId: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
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
    if (isDebug) console.log("[users.createUser] called", { clerkId: args.clerkId });
    const email = args.email?.trim() || undefined;

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        email,
        fullName: args.fullName,
        avatarUrl: args.avatarUrl,
      });
      return existingUser._id;
    }

    // Create new user
    const newUserId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email,
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
    });
    if (isDebug) console.log("[users.createUser] inserted", { userId: newUserId });
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
    });

    return null;
  },
});

export const upsertCurrentUser = mutation({
  args: {
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = identity.subject;
    const email = args.email?.trim() || undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        fullName: args.fullName,
        avatarUrl: args.avatarUrl,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("users", {
      clerkId,
      email,
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
    });
    if (isDebug) console.log("[users.upsertCurrentUser] inserted", { userId: id });
    return id;
  },
});
