import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

const CONFIRMATION = "MIGRATE_CLERK_USER_IDS";

function requireMigrationSecret(value: string): void {
  const expected = process.env.CLERK_MIGRATION_SECRET?.trim();
  if (!expected) throw new Error("Missing CLERK_MIGRATION_SECRET");
  if (value.trim() !== expected) throw new Error("Unauthorized");
}

function normalizeClerkId(value: string): string {
  return value.trim();
}

function buildMapping(
  rawMappings: Array<{ from: string; to: string }>,
): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const raw of rawMappings) {
    const from = normalizeClerkId(raw.from);
    const to = normalizeClerkId(raw.to);

    if (!from || !to)
      throw new Error("Mappings must include non-empty from/to Clerk user IDs");
    if (from === to) throw new Error(`Mapping cannot point to itself: ${from}`);

    const existing = mapping.get(from);
    if (existing && existing !== to)
      throw new Error(`Duplicate source mapping for ${from}`);

    mapping.set(from, to);
  }

  if (mapping.size === 0) throw new Error("At least one mapping is required");
  return mapping;
}

function mergeUserPatch(
  source: Doc<"users">,
  target: Doc<"users">,
): Partial<Doc<"users">> {
  return {
    ...(source.email === undefined && target.email !== undefined
      ? { email: target.email }
      : {}),
    ...(source.fullName === undefined && target.fullName !== undefined
      ? { fullName: target.fullName }
      : {}),
    ...(source.avatarUrl === undefined && target.avatarUrl !== undefined
      ? { avatarUrl: target.avatarUrl }
      : {}),
  };
}

async function reassignRowsByUserId(
  ctx: any,
  tableName: string,
  fromUserId: string,
  toUserId: string,
): Promise<number> {
  const rows = await ctx.db
    .query(tableName)
    .withIndex("by_user", (q: any) => q.eq("userId", fromUserId))
    .collect();

  for (const row of rows) {
    await ctx.db.patch(row._id, { userId: toUserId });
  }

  return rows.length;
}

async function mergeUserSettings(
  ctx: any,
  fromUserId: string,
  toUserId: string,
): Promise<{ patched: number; deleted: number }> {
  const sourceSettings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q: any) => q.eq("userId", toUserId))
    .first();
  const targetSettings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q: any) => q.eq("userId", fromUserId))
    .collect();

  let patched = 0;
  let deleted = 0;
  let hasSourceSettings = Boolean(sourceSettings);

  for (const setting of targetSettings) {
    if (hasSourceSettings) {
      await ctx.db.delete(setting._id);
      deleted++;
    } else {
      await ctx.db.patch(setting._id, { userId: toUserId });
      patched++;
      hasSourceSettings = true;
    }
  }

  return { patched, deleted };
}

async function mergeUserApiKeys(
  ctx: any,
  fromUserId: string,
  toUserId: string,
): Promise<{ patched: number; deleted: number }> {
  const sourceKeys = await ctx.db
    .query("userApiKeys")
    .withIndex("by_user", (q: any) => q.eq("userId", toUserId))
    .collect();
  const targetKeys = await ctx.db
    .query("userApiKeys")
    .withIndex("by_user", (q: any) => q.eq("userId", fromUserId))
    .collect();
  const sourceProviders = new Set(sourceKeys.map((key: any) => key.provider));

  let patched = 0;
  let deleted = 0;

  for (const key of targetKeys) {
    if (sourceProviders.has(key.provider)) {
      await ctx.db.delete(key._id);
      deleted++;
    } else {
      await ctx.db.patch(key._id, { userId: toUserId });
      patched++;
      sourceProviders.add(key.provider);
    }
  }

  return { patched, deleted };
}

async function moveDuplicateUserReferences(
  ctx: any,
  fromUserId: string,
  toUserId: string,
): Promise<{ patched: number; deleted: number }> {
  let patched = 0;
  let deleted = 0;

  for (const tableName of [
    "posts",
    "watchlistGroups",
    "watchlists",
    "portfolioWallets",
    "portfolioWalletCoins",
  ]) {
    patched += await reassignRowsByUserId(ctx, tableName, fromUserId, toUserId);
  }

  const settingsResult = await mergeUserSettings(ctx, fromUserId, toUserId);
  patched += settingsResult.patched;
  deleted += settingsResult.deleted;

  const apiKeysResult = await mergeUserApiKeys(ctx, fromUserId, toUserId);
  patched += apiKeysResult.patched;
  deleted += apiKeysResult.deleted;

  return { patched, deleted };
}

const migrationResultValidator = v.object({
  apply: v.boolean(),
  mappings: v.number(),
  missingSourceUsers: v.number(),
  usersPatched: v.number(),
  usersMerged: v.number(),
  userReferencesPatched: v.number(),
  userReferencesDeleted: v.number(),
});

export const listUsersForProductionImport = query({
  args: {
    secret: v.string(),
  },
  returns: v.array(
    v.object({
      clerkId: v.string(),
      email: v.optional(v.string()),
      fullName: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    requireMigrationSecret(args.secret);

    const users = await ctx.db.query("users").collect();

    return users
      .map((user) => ({
        clerkId: user.clerkId,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        createdAt: user._creationTime,
      }))
      .sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const migrateClerkUserIds = mutation({
  args: {
    secret: v.string(),
    apply: v.boolean(),
    confirmation: v.optional(v.string()),
    mappings: v.array(
      v.object({
        from: v.string(),
        to: v.string(),
      }),
    ),
  },
  returns: migrationResultValidator,
  handler: async (ctx, args) => {
    requireMigrationSecret(args.secret);

    if (args.apply && args.confirmation !== CONFIRMATION) {
      throw new Error(`Apply mode requires confirmation: ${CONFIRMATION}`);
    }

    const mapping = buildMapping(args.mappings);
    const result = {
      apply: args.apply,
      mappings: mapping.size,
      missingSourceUsers: 0,
      usersPatched: 0,
      usersMerged: 0,
      userReferencesPatched: 0,
      userReferencesDeleted: 0,
    };

    for (const [from, to] of mapping) {
      const sourceUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", from))
        .first();

      const targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", to))
        .first();

      if (!sourceUser) {
        result.missingSourceUsers++;
        continue;
      }

      if (targetUser) {
        result.usersMerged++;

        if (args.apply) {
          const references = await moveDuplicateUserReferences(
            ctx,
            targetUser._id,
            sourceUser._id,
          );
          result.userReferencesPatched += references.patched;
          result.userReferencesDeleted += references.deleted;

          await ctx.db.patch(sourceUser._id, {
            ...mergeUserPatch(sourceUser, targetUser),
            clerkId: to,
          });
          await ctx.db.delete(targetUser._id);
        }
        continue;
      }

      result.usersPatched++;

      if (args.apply) {
        await ctx.db.patch(sourceUser._id, {
          clerkId: to,
        });
      }
    }

    return result;
  },
});
