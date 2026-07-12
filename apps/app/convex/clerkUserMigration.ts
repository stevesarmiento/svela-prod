import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const CONFIRMATION = "MIGRATE_CLERK_USER_IDS";

function requireMigrationSecret(value: string): void {
  const expected = process.env.CLERK_MIGRATION_SECRET?.trim();
  if (!expected) throw new Error("Missing CLERK_MIGRATION_SECRET");
  if (value.trim() !== expected) throw new Error("Unauthorized");
}

function buildMapping(
  rawMappings: Array<{ from: string; to: string }>,
): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const raw of rawMappings) {
    const from = raw.from.trim();
    const to = raw.to.trim();

    if (!from || !to) {
      throw new Error("Mappings must include non-empty from/to Clerk user IDs");
    }
    if (from === to) {
      throw new Error(`Mapping cannot point to itself: ${from}`);
    }

    const existing = mapping.get(from);
    if (existing && existing !== to) {
      throw new Error(`Duplicate source mapping for ${from}`);
    }

    mapping.set(from, to);
  }

  if (mapping.size === 0) throw new Error("At least one mapping is required");
  return mapping;
}

const migrationResultValidator = v.object({
  apply: v.boolean(),
  mappings: v.number(),
  missingSourceUsers: v.number(),
  usersPatched: v.number(),
  usersMerged: v.number(),
  rowsReassigned: v.number(),
  rowsDeleted: v.number(),
});

type MigrationResult = {
  apply: boolean;
  mappings: number;
  missingSourceUsers: number;
  usersPatched: number;
  usersMerged: number;
  rowsReassigned: number;
  rowsDeleted: number;
};

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

/**
 * Merge a duplicate target user (created by production Clerk webhooks) into the
 * source user (the original row that all durable data references), then delete
 * the duplicate. The source user row and its `_id` are always preserved.
 */
async function mergeDuplicateTargetUser(
  ctx: MutationCtx,
  source: Doc<"users">,
  target: Doc<"users">,
  apply: boolean,
  result: MigrationResult,
): Promise<void> {
  const now = Date.now();

  // --- portfolioWallets + portfolioWalletCoins ---
  const [targetWallets, sourceWallets] = await Promise.all([
    ctx.db
      .query("portfolioWallets")
      .withIndex("by_user", (q) => q.eq("userId", target._id))
      .collect(),
    ctx.db
      .query("portfolioWallets")
      .withIndex("by_user", (q) => q.eq("userId", source._id))
      .collect(),
  ]);

  const sourceAddresses = new Set(
    sourceWallets.map((w) => w.address.toLowerCase()),
  );
  const deletedWalletIds = new Set<Id<"portfolioWallets">>();

  for (const wallet of targetWallets) {
    const coins = await ctx.db
      .query("portfolioWalletCoins")
      .withIndex("by_wallet", (q) => q.eq("walletId", wallet._id))
      .collect();

    if (sourceAddresses.has(wallet.address.toLowerCase())) {
      // Source already tracks this wallet address; drop the duplicate.
      deletedWalletIds.add(wallet._id);
      result.rowsDeleted += 1 + coins.length;
      if (apply) {
        for (const coin of coins) await ctx.db.delete(coin._id);
        await ctx.db.delete(wallet._id);
      }
    } else {
      result.rowsReassigned += 1 + coins.length;
      if (apply) {
        await ctx.db.patch(wallet._id, { userId: source._id, updatedAt: now });
        for (const coin of coins) {
          await ctx.db.patch(coin._id, { userId: source._id });
        }
      }
    }
  }

  // --- watchlistGroups ---
  const [targetGroups, sourceGroups] = await Promise.all([
    ctx.db
      .query("watchlistGroups")
      .withIndex("by_user", (q) => q.eq("userId", target._id))
      .collect(),
    ctx.db
      .query("watchlistGroups")
      .withIndex("by_user", (q) => q.eq("userId", source._id))
      .collect(),
  ]);

  const sourceSlugs = new Set(sourceGroups.map((g) => g.slug));
  const sourceHasDefault = sourceGroups.some((g) => g.isDefault);

  for (const group of targetGroups) {
    const patch: Partial<Doc<"watchlistGroups">> = {
      userId: source._id,
      updatedAt: now,
    };
    if (group.isDefault && sourceHasDefault) patch.isDefault = false;
    if (sourceSlugs.has(group.slug)) {
      patch.slug = `${group.slug}-migrated-${String(group._id).slice(-6)}`;
    }
    if (
      group.portfolioWalletId !== undefined &&
      deletedWalletIds.has(group.portfolioWalletId)
    ) {
      patch.portfolioWalletId = undefined;
    }

    result.rowsReassigned++;
    if (apply) await ctx.db.patch(group._id, patch);
  }

  // --- watchlists ---
  const targetWatchlists = await ctx.db
    .query("watchlists")
    .withIndex("by_user", (q) => q.eq("userId", target._id))
    .collect();

  for (const row of targetWatchlists) {
    result.rowsReassigned++;
    if (apply) await ctx.db.patch(row._id, { userId: source._id });
  }

  // --- userSettings (conservative: keep source settings if present) ---
  const [targetSettings, sourceSettings] = await Promise.all([
    ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", target._id))
      .collect(),
    ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", source._id))
      .collect(),
  ]);

  let sourceHasSettings = sourceSettings.length > 0;
  for (const settings of targetSettings) {
    if (sourceHasSettings) {
      result.rowsDeleted++;
      if (apply) await ctx.db.delete(settings._id);
    } else {
      sourceHasSettings = true;
      result.rowsReassigned++;
      if (apply) {
        await ctx.db.patch(settings._id, { userId: source._id, updatedAt: now });
      }
    }
  }

  // --- userApiKeys (reassign non-conflicting providers, drop conflicts) ---
  const [targetKeys, sourceKeys] = await Promise.all([
    ctx.db
      .query("userApiKeys")
      .withIndex("by_user", (q) => q.eq("userId", target._id))
      .collect(),
    ctx.db
      .query("userApiKeys")
      .withIndex("by_user", (q) => q.eq("userId", source._id))
      .collect(),
  ]);

  const sourceProviders = new Set(sourceKeys.map((k) => k.provider));
  for (const key of targetKeys) {
    if (sourceProviders.has(key.provider)) {
      result.rowsDeleted++;
      if (apply) await ctx.db.delete(key._id);
    } else {
      sourceProviders.add(key.provider);
      result.rowsReassigned++;
      if (apply) {
        await ctx.db.patch(key._id, { userId: source._id, updatedAt: now });
      }
    }
  }
}

export const updateAvatarUrls = mutation({
  args: {
    secret: v.string(),
    updates: v.array(
      v.object({
        clerkId: v.string(),
        avatarUrl: v.string(),
      }),
    ),
  },
  returns: v.object({ patched: v.number(), missing: v.number() }),
  handler: async (ctx, args) => {
    requireMigrationSecret(args.secret);

    let patched = 0;
    let missing = 0;

    for (const update of args.updates) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", update.clerkId))
        .first();

      if (!user) {
        missing++;
        continue;
      }

      await ctx.db.patch(user._id, { avatarUrl: update.avatarUrl });
      patched++;
    }

    return { patched, missing };
  },
});

export const linkDevClerkIds = mutation({
  args: {
    secret: v.string(),
    apply: v.boolean(),
    links: v.array(
      v.object({
        devClerkId: v.string(),
        prodClerkId: v.string(),
      }),
    ),
  },
  returns: v.object({
    apply: v.boolean(),
    linked: v.number(),
    alreadyLinked: v.number(),
    missingProdUsers: v.number(),
    duplicatesMerged: v.number(),
    rowsReassigned: v.number(),
    rowsDeleted: v.number(),
  }),
  handler: async (ctx, args) => {
    requireMigrationSecret(args.secret);

    const result = {
      apply: args.apply,
      linked: 0,
      alreadyLinked: 0,
      missingProdUsers: 0,
      duplicatesMerged: 0,
      rowsReassigned: 0,
      rowsDeleted: 0,
    };
    // mergeDuplicateTargetUser expects a MigrationResult-shaped counter object.
    const mergeCounters: MigrationResult = {
      apply: args.apply,
      mappings: 0,
      missingSourceUsers: 0,
      usersPatched: 0,
      usersMerged: 0,
      rowsReassigned: 0,
      rowsDeleted: 0,
    };

    for (const link of args.links) {
      const mainUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", link.prodClerkId))
        .first();

      if (!mainUser) {
        result.missingProdUsers++;
        continue;
      }

      // A stray duplicate row may exist for the dev Clerk ID (created by a
      // local-dev login before this linking existed). Merge it into the main
      // row, then delete it.
      const devDuplicate = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", link.devClerkId))
        .first();

      if (devDuplicate && devDuplicate._id !== mainUser._id) {
        result.duplicatesMerged++;
        await mergeDuplicateTargetUser(
          ctx,
          mainUser,
          devDuplicate,
          args.apply,
          mergeCounters,
        );
        if (args.apply) await ctx.db.delete(devDuplicate._id);
      }

      if (mainUser.devClerkId === link.devClerkId) {
        result.alreadyLinked++;
        continue;
      }

      result.linked++;
      if (args.apply) {
        await ctx.db.patch(mainUser._id, { devClerkId: link.devClerkId });
      }
    }

    result.rowsReassigned = mergeCounters.rowsReassigned;
    result.rowsDeleted = mergeCounters.rowsDeleted;
    return result;
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

    const result: MigrationResult = {
      apply: args.apply,
      mappings: mapping.size,
      missingSourceUsers: 0,
      usersPatched: 0,
      usersMerged: 0,
      rowsReassigned: 0,
      rowsDeleted: 0,
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
        // A duplicate Convex row already exists for the production Clerk ID
        // (e.g. created by a webhook after the user signed into production).
        // Preserve the source row (all data references its _id): merge the
        // duplicate's data into it, delete the duplicate, then take over the
        // production Clerk ID.
        result.usersMerged++;
        await mergeDuplicateTargetUser(
          ctx,
          sourceUser,
          targetUser,
          args.apply,
          result,
        );
        if (args.apply) {
          await ctx.db.delete(targetUser._id);
          await ctx.db.patch(sourceUser._id, {
            clerkId: to,
            ...(sourceUser.email === undefined && targetUser.email !== undefined
              ? { email: targetUser.email }
              : {}),
            ...(sourceUser.fullName === undefined &&
            targetUser.fullName !== undefined
              ? { fullName: targetUser.fullName }
              : {}),
            ...(sourceUser.avatarUrl === undefined &&
            targetUser.avatarUrl !== undefined
              ? { avatarUrl: targetUser.avatarUrl }
              : {}),
          });
        }
      } else {
        result.usersPatched++;
        if (args.apply) {
          await ctx.db.patch(sourceUser._id, { clerkId: to });
        }
      }
    }

    return result;
  },
});
