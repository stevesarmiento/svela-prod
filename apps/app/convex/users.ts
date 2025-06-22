import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getCurrentUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

export const createUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("=== CREATE USER FUNCTION CALLED ===");
    console.log("Args:", args);

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      console.log("User already exists, updating...");
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        fullName: args.fullName,
        avatarUrl: args.avatarUrl,
      });
      console.log("User updated successfully");
      return existingUser._id;
    }

    // Create new user
    console.log("Creating new user...");
    const newUserId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
    });
    console.log("New user created with ID:", newUserId);
    return newUserId;
  },
});

export const updateUser = mutation({
  args: {
    clerkId: v.string(),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
    });
  },
});