import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";

interface PortfolioWalletForSync {
  _id: Id<"portfolioWallets">;
  userId: Id<"users">;
  address: string;
  isActive: boolean;
}

interface ActiveWalletsPage {
  walletIds: Array<Id<"portfolioWallets">>;
  isDone: boolean;
  continueCursor: string | null;
}

interface ReconcileWalletCoinsResult {
  nextCoingeckoIds: string[];
  addedCoingeckoIds: string[];
  removedCoingeckoIds: string[];
}

function chunk<T>(items: ReadonlyArray<T>, size: number): Array<Array<T>> {
  const out: Array<Array<T>> = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function getHeliusApiKey(): string {
  const key = process.env.HELIUS_API_KEY ?? process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!key) throw new Error("Missing HELIUS_API_KEY in Convex environment");
  return key;
}

function getBirdeyeApiKey(): string {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) throw new Error("Missing BIRDEYE_API_KEY in Convex environment");
  return key;
}

function isBase58Address(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

type HeliusBalancesResponse = {
  balances: Array<{
    mint: string;
  }>;
  pagination?: { hasMore: boolean };
};

type HeliusDasAsset = {
  interface?: string;
  id?: string;
  token_info?: {
    price_info?: {
      total_price?: number;
      currency?: string;
    };
  };
};

type HeliusDasAssetsByOwnerResult = {
  items: Array<HeliusDasAsset>;
  nativeBalance?: {
    lamports?: number;
    total_price?: number;
  };
};

async function fetchWithRetry(args: {
  url: string;
  init?: RequestInit;
  maxAttempts: number;
  shouldRetry: (response: Response, bodyText: string) => boolean;
}): Promise<{ response: Response; bodyText: string }> {
  let lastBodyText = "";
  for (let attempt = 1; attempt <= args.maxAttempts; attempt++) {
    const response = await fetch(args.url, args.init);
    const bodyText = await response.text().catch(() => "");
    lastBodyText = bodyText;

    if (response.ok) return { response, bodyText };

    if (attempt >= args.maxAttempts) return { response, bodyText };

    if (!args.shouldRetry(response, bodyText)) return { response, bodyText };

    // Backoff: 250ms, 750ms, 1750ms ...
    const backoffMs = 250 + (attempt - 1) * (attempt - 1) * 500;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  // Should be unreachable.
  throw new Error(`Fetch failed after retries: ${lastBodyText.slice(0, 200)}`);
}

async function fetchHeliusDasWalletTopMints(args: {
  walletAddress: string;
  heliusApiKey: string;
  limit: number;
}): Promise<Array<string>> {
  const url = new URL("https://mainnet.helius-rpc.com/");
  url.searchParams.set("api-key", args.heliusApiKey);

  const payload = {
    jsonrpc: "2.0",
    id: "portfolio-sync",
    method: "getAssetsByOwner",
    params: {
      ownerAddress: args.walletAddress,
      page: 1,
      limit: 1000,
      options: {
        showFungible: true,
        showNativeBalance: true,
        showZeroBalance: false,
      },
    },
  };

  const { response, bodyText } = await fetchWithRetry({
    url: url.toString(),
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    },
    maxAttempts: 3,
    shouldRetry: (res) => res.status === 429 || res.status >= 500,
  });

  if (!response.ok) {
    throw new Error(`Helius DAS getAssetsByOwner failed (${response.status}): ${bodyText.slice(0, 200)}`);
  }

  const json = JSON.parse(bodyText) as { result?: HeliusDasAssetsByOwnerResult };
  const result = json?.result;
  const items = Array.isArray(result?.items) ? result.items : [];

  const scored: Array<{ mint: string; score: number }> = [];
  for (const item of items) {
    if (item.interface !== "FungibleToken") continue;
    const mint = item.id?.trim();
    if (!mint || !isBase58Address(mint)) continue;
    const totalPrice = item.token_info?.price_info?.total_price;
    scored.push({ mint, score: typeof totalPrice === "number" ? totalPrice : 0 });
  }

  // Include native SOL balance as wrapped SOL so downstream mint->CoinGecko mapping works.
  const nativeLamports = result?.nativeBalance?.lamports;
  if (typeof nativeLamports === "number" && nativeLamports > 0) {
    const nativeScore =
      typeof result?.nativeBalance?.total_price === "number" ? result.nativeBalance.total_price : 0;
    scored.push({ mint: "So11111111111111111111111111111111111111112", score: nativeScore });
  }

  scored.sort((a, b) => b.score - a.score);

  const out: Array<string> = [];
  const seen = new Set<string>();
  for (const row of scored) {
    if (seen.has(row.mint)) continue;
    seen.add(row.mint);
    out.push(row.mint);
    if (out.length >= args.limit) break;
  }

  return out;
}

async function fetchHeliusWalletBalancesTop100(args: {
  walletAddress: string;
  heliusApiKey: string;
}): Promise<Array<string>> {
  const url = new URL(`https://api.helius.xyz/v1/wallet/${args.walletAddress}/balances`);
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", "100");
  url.searchParams.set("showNfts", "false");
  url.searchParams.set("showNative", "true");
  url.searchParams.set("showZeroBalance", "false");

  const { response, bodyText } = await fetchWithRetry({
    url: url.toString(),
    init: {
      method: "GET",
      headers: {
        "X-Api-Key": args.heliusApiKey,
        Accept: "application/json",
      },
    },
    maxAttempts: 3,
    shouldRetry: (res) => res.status === 429 || res.status >= 500,
  });

  if (!response.ok) {
    // In practice, we've seen the Wallet API intermittently 500 from Convex actions.
    // Fall back to the DAS API (getAssetsByOwner) which is often more stable.
    if (response.status === 429 || response.status >= 500) {
      return await fetchHeliusDasWalletTopMints({
        walletAddress: args.walletAddress,
        heliusApiKey: args.heliusApiKey,
        limit: 100,
      });
    }

    throw new Error(`Helius balances failed (${response.status}): ${bodyText.slice(0, 200)}`);
  }

  const data = JSON.parse(bodyText) as HeliusBalancesResponse;
  const mints = Array.isArray(data?.balances) ? data.balances.map((b) => b.mint) : [];
  return mints
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && isBase58Address(m));
}

type BirdeyeTokenOverviewResponse = {
  success?: boolean;
  data?: {
    extensions?: {
      coingeckoId?: string;
    };
  };
};

async function fetchBirdeyeCoingeckoIdByMint(args: {
  mint: string;
  birdeyeApiKey: string;
}): Promise<string | null> {
  const url = new URL("https://public-api.birdeye.so/defi/token_overview");
  url.searchParams.set("chain", "solana");
  url.searchParams.set("address", args.mint);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "X-API-KEY": args.birdeyeApiKey, Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Birdeye token_overview failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as BirdeyeTokenOverviewResponse;
  const id = json?.data?.extensions?.coingeckoId?.trim();
  if (!id) return null;
  return id;
}

export const _getPortfolioWalletById = internalQuery({
  args: { walletId: v.id("portfolioWallets") },
  returns: v.union(
    v.object({
      _id: v.id("portfolioWallets"),
      userId: v.id("users"),
      address: v.string(),
      isActive: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) return null;
    return {
      _id: wallet._id,
      userId: wallet.userId,
      address: wallet.address,
      isActive: wallet.isActive,
    };
  },
});

export const _getMintMappingsByMints = internalQuery({
  args: { mints: v.array(v.string()) },
  returns: v.record(v.string(), v.string()),
  handler: async (ctx, args) => {
    const out: Record<string, string> = {};
    const unique = Array.from(new Set(args.mints.map((m) => m.trim()).filter((m) => m.length > 0)));
    if (unique.length === 0) return out;

    const rows = await Promise.all(
      unique.map(async (mint) => {
        return await ctx.db
          .query("portfolioMintMappings")
          .withIndex("by_mint", (q) => q.eq("mint", mint))
          .first();
      }),
    );

    for (const row of rows) {
      if (!row) continue;
      out[row.mint] = row.coingeckoId;
    }
    return out;
  },
});

export const _upsertMintMappings = internalMutation({
  args: {
    items: v.array(
      v.object({
        mint: v.string(),
        coingeckoId: v.string(),
        source: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const unique = new Map<string, (typeof args.items)[number]>();
    for (const item of args.items) unique.set(item.mint, item);

    for (const item of unique.values()) {
      const existing = await ctx.db
        .query("portfolioMintMappings")
        .withIndex("by_mint", (q) => q.eq("mint", item.mint))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          coingeckoId: item.coingeckoId,
          source: item.source,
          updatedAt: now,
        });
        continue;
      }

      await ctx.db.insert("portfolioMintMappings", {
        mint: item.mint,
        coingeckoId: item.coingeckoId,
        source: item.source,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const _reconcileWalletCoins = internalMutation({
  args: {
    walletId: v.id("portfolioWallets"),
    userId: v.id("users"),
    next: v.array(
      v.object({
        mint: v.string(),
        coingeckoId: v.string(),
      }),
    ),
    syncedAt: v.number(),
    syncError: v.union(v.string(), v.null()),
  },
  returns: v.object({
    nextCoingeckoIds: v.array(v.string()),
    addedCoingeckoIds: v.array(v.string()),
    removedCoingeckoIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) throw new Error("Portfolio wallet not found");
    if (wallet.userId !== args.userId) throw new Error("Portfolio wallet not found");

    const now = Date.now();

    // Normalize next set: unique by CoinGecko id (avoid duplicates per wallet).
    const nextById = new Map<string, { mint: string; coingeckoId: string }>();
    for (const item of args.next) {
      const id = item.coingeckoId.trim();
      const mint = item.mint.trim();
      if (!id || !mint) continue;
      if (!nextById.has(id)) nextById.set(id, { mint, coingeckoId: id });
    }

    const existing = await ctx.db
      .query("portfolioWalletCoins")
      .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId))
      .collect();

    const existingById = new Map<string, (typeof existing)[number]>();
    for (const row of existing) existingById.set(row.coingeckoId, row);

    const added: Array<string> = [];
    const removed: Array<string> = [];

    // Deletes (stale rows).
    for (const row of existing) {
      if (nextById.has(row.coingeckoId)) continue;
      removed.push(row.coingeckoId);
      await ctx.db.delete(row._id);
    }

    // Inserts / mint updates.
    for (const [coingeckoId, item] of nextById.entries()) {
      const row = existingById.get(coingeckoId);
      if (!row) {
        added.push(coingeckoId);
        await ctx.db.insert("portfolioWalletCoins", {
          userId: args.userId,
          walletId: args.walletId,
          coingeckoId,
          mint: item.mint,
          createdAt: now,
        });
        continue;
      }

      if (row.mint !== item.mint) {
        await ctx.db.patch(row._id, { mint: item.mint });
      }
    }

    await ctx.db.patch(args.walletId, {
      lastSyncedAt: args.syncError ? wallet.lastSyncedAt : args.syncedAt,
      lastSyncError: args.syncError ?? undefined,
      updatedAt: now,
    });

    const nextCoingeckoIds = Array.from(nextById.keys());
    nextCoingeckoIds.sort();
    added.sort();
    removed.sort();

    return {
      nextCoingeckoIds,
      addedCoingeckoIds: added,
      removedCoingeckoIds: removed,
    };
  },
});

export const _setWalletSyncError = internalMutation({
  args: {
    walletId: v.id("portfolioWallets"),
    userId: v.id("users"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) return null;
    if (wallet.userId !== args.userId) return null;

    await ctx.db.patch(args.walletId, {
      lastSyncError: args.errorMessage,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const _touchTrackedCoinsForPortfolio = internalMutation({
  args: {
    coingeckoIds: v.array(v.string()),
    removedCoingeckoIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lastSeen = Date.now();

    for (const idChunk of chunk(args.coingeckoIds, 100)) {
      await ctx.runMutation(internal.coingeckoState._touchTrackedCoinsBatch, {
        coingeckoIds: idChunk,
        reason: "portfolio",
        lastSeen,
      });
    }

    // Remove stale portfolio membership only when no wallet still tracks it.
    for (const coingeckoId of args.removedCoingeckoIds) {
      const remaining = await ctx.db
        .query("portfolioWalletCoins")
        .withIndex("by_coingecko", (q) => q.eq("coingeckoId", coingeckoId))
        .first();
      if (remaining) continue;

      await ctx.runMutation(internal.coingeckoState._removeTrackedCoinReason, {
        coingeckoId,
        reason: "portfolio",
      });
    }

    return null;
  },
});

export const previewWalletCandidates = internalAction({
  args: { walletAddress: v.string() },
  returns: v.object({
    candidates: v.array(
      v.object({
        mint: v.string(),
        coingeckoId: v.string(),
      }),
    ),
    unresolvedCount: v.number(),
  }),
  handler: async (ctx, args): Promise<{ candidates: Array<{ mint: string; coingeckoId: string }>; unresolvedCount: number }> => {
    const walletAddress = args.walletAddress.trim();
    if (!walletAddress || !isBase58Address(walletAddress)) throw new Error("Invalid wallet address");

    const heliusApiKey = getHeliusApiKey();
    const birdeyeApiKey = getBirdeyeApiKey();

    // DAS-only for stable ordering and fewer intermittent Wallet API failures.
    const rawMints = await fetchHeliusDasWalletTopMints({
      walletAddress,
      heliusApiKey,
      limit: 100,
    });

    const uniqueMints = Array.from(new Set(rawMints));
    const cached = await ctx.runQuery(internal.portfolioJobs._getMintMappingsByMints, {
      mints: uniqueMints,
    });

    const missing = uniqueMints.filter((m) => !cached[m]);
    const resolvedFromBirdeye: Array<{ mint: string; coingeckoId: string }> = [];

    for (const mintChunk of chunk(missing, 5)) {
      const results = await Promise.all(
        mintChunk.map(async (mint) => {
          const coingeckoId = await fetchBirdeyeCoingeckoIdByMint({ mint, birdeyeApiKey });
          return coingeckoId ? { mint, coingeckoId } : null;
        }),
      );
      for (const r of results) if (r) resolvedFromBirdeye.push(r);
    }

    if (resolvedFromBirdeye.length > 0) {
      await ctx.runMutation(internal.portfolioJobs._upsertMintMappings, {
        items: resolvedFromBirdeye.map((r) => ({ ...r, source: "birdeye" })),
      });
    }

    const allResolvedByMint: Record<string, string> = { ...cached };
    for (const r of resolvedFromBirdeye) allResolvedByMint[r.mint] = r.coingeckoId;

    // Preserve DAS ordering (already sorted by USD total_price) for a better picker default.
    const candidates = uniqueMints
      .map((mint) => {
        const coingeckoId = allResolvedByMint[mint];
        if (!coingeckoId) return null;
        return { mint, coingeckoId };
      })
      .filter((x): x is { mint: string; coingeckoId: string } => x !== null);

    return {
      candidates,
      unresolvedCount: uniqueMints.length - candidates.length,
    };
  },
});

export const syncWallet = internalAction({
  args: { walletId: v.id("portfolioWallets") },
  returns: v.object({
    walletId: v.id("portfolioWallets"),
    resolvedCount: v.number(),
    unresolvedCount: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ walletId: Id<"portfolioWallets">; resolvedCount: number; unresolvedCount: number }> => {
    const wallet: PortfolioWalletForSync | null = await ctx.runQuery(
      internal.portfolioJobs._getPortfolioWalletById,
      {
      walletId: args.walletId,
      },
    );

    if (!wallet) {
      return { walletId: args.walletId, resolvedCount: 0, unresolvedCount: 0 };
    }
    if (!wallet.isActive) {
      return { walletId: args.walletId, resolvedCount: 0, unresolvedCount: 0 };
    }

    const syncedAt = Date.now();

    try {
      const heliusApiKey = getHeliusApiKey();
      const birdeyeApiKey = getBirdeyeApiKey();

      const rawMints = await fetchHeliusWalletBalancesTop100({
        walletAddress: wallet.address,
        heliusApiKey,
      });

      const uniqueMints = Array.from(new Set(rawMints));
      const cached = await ctx.runQuery(internal.portfolioJobs._getMintMappingsByMints, {
        mints: uniqueMints,
      });

      const missing = uniqueMints.filter((m) => !cached[m]);
      const resolvedFromBirdeye: Array<{ mint: string; coingeckoId: string }> = [];

      // Resolve unknown mints in small batches to avoid spiky external traffic.
      for (const mintChunk of chunk(missing, 5)) {
        const results = await Promise.all(
          mintChunk.map(async (mint) => {
            const coingeckoId = await fetchBirdeyeCoingeckoIdByMint({ mint, birdeyeApiKey });
            return coingeckoId ? { mint, coingeckoId } : null;
          }),
        );
        for (const r of results) if (r) resolvedFromBirdeye.push(r);
      }

      if (resolvedFromBirdeye.length > 0) {
        await ctx.runMutation(internal.portfolioJobs._upsertMintMappings, {
          items: resolvedFromBirdeye.map((r) => ({ ...r, source: "birdeye" })),
        });
      }

      const allResolvedByMint: Record<string, string> = { ...cached };
      for (const r of resolvedFromBirdeye) allResolvedByMint[r.mint] = r.coingeckoId;

      const nextCoins = uniqueMints
        .map((mint) => {
          const coingeckoId = allResolvedByMint[mint];
          if (!coingeckoId) return null;
          return { mint, coingeckoId };
        })
        .filter((x): x is { mint: string; coingeckoId: string } => x !== null);

      const diff: ReconcileWalletCoinsResult = await ctx.runMutation(
        internal.portfolioJobs._reconcileWalletCoins,
        {
        walletId: args.walletId,
        userId: wallet.userId,
        next: nextCoins,
        syncedAt,
        syncError: null,
        },
      );

      await ctx.runMutation(internal.portfolioJobs._touchTrackedCoinsForPortfolio, {
        coingeckoIds: diff.nextCoingeckoIds,
        removedCoingeckoIds: diff.removedCoingeckoIds,
      });

      return {
        walletId: args.walletId,
        resolvedCount: diff.nextCoingeckoIds.length,
        unresolvedCount: uniqueMints.length - nextCoins.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await ctx.runMutation(internal.portfolioJobs._setWalletSyncError, {
        walletId: args.walletId,
        userId: wallet.userId,
        errorMessage: message,
      });

      return { walletId: args.walletId, resolvedCount: 0, unresolvedCount: 0 };
    }
  },
});

export const _getActiveWalletsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    walletIds: v.array(v.id("portfolioWallets")),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("portfolioWallets")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .paginate(args.paginationOpts);

    const walletIds = result.page.map((w) => w._id);
    return { walletIds, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const syncWalletsDaily = internalAction({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx, args): Promise<{ scheduled: number }> => {
    const batchSize = Math.min(100, Math.max(1, args.batchSize ?? 25));
    const jobKey = "portfolio:wallets";

    const state: { cursor?: string } | null = await ctx.runQuery(internal.coingeckoState._getJobState, {
      jobKey,
    });
    const cursor = state?.cursor ?? null;

    const page: ActiveWalletsPage = await ctx.runQuery(internal.portfolioJobs._getActiveWalletsPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });

    for (const walletId of page.walletIds) {
      await ctx.scheduler.runAfter(0, internal.portfolioJobs.syncWallet, { walletId });
    }

    await ctx.runMutation(internal.coingeckoState._setJobCursor, {
      jobKey,
      cursor: page.continueCursor,
    });

    return { scheduled: page.walletIds.length };
  },
});

