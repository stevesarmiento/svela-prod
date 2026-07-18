import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, DatabaseWriter } from "../_generated/server";

/**
 * Canonical holdings live in the `coinHoldings` table, keyed by
 * (userId, coinId). A coin has exactly ONE holdings value per user, no matter
 * how many watchlist groups it appears in — watchlist rows only record
 * membership.
 *
 * Legacy note: `watchlists.holdings` is deprecated. Reads overlay canonical
 * values instead; the migration in `holdingsMigration.ts` moves old row-level
 * values into `coinHoldings` and clears the legacy field.
 */

function isValidHoldings(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Load the user's canonical holdings as a coinId → quantity map. */
export async function getCanonicalHoldingsByCoinId(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<Map<string, number>> {
  const rows = await db
    .query("coinHoldings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const byCoinId = new Map<string, number>();
  for (const row of rows) {
    if (!isValidHoldings(row.holdings)) continue;
    byCoinId.set(row.coinId, row.holdings);
  }
  return byCoinId;
}

/**
 * Overlay canonical holdings onto watchlist rows so every instance of a coin
 * shows the same value, regardless of which group the row belongs to. Rows
 * whose coin has no canonical entry are returned unchanged, so any
 * not-yet-migrated legacy row value keeps displaying until the migration runs.
 */
export function overlayCanonicalHoldings(
  items: Doc<"watchlists">[],
  holdingsByCoinId: Map<string, number>,
): Doc<"watchlists">[] {
  return items.map((item) => {
    const holdings = holdingsByCoinId.get(item.coinId);
    if (holdings === undefined) return item;
    return { ...item, holdings };
  });
}

/**
 * Resolve the user's effective holdings per coin from canonical rows plus a
 * legacy fallback for not-yet-migrated row-level values:
 * - canonical `coinHoldings` always wins for a coin;
 * - otherwise the MAX legacy row value is used (never summed — the same
 *   position listed twice is one position, not two);
 * - coins no longer on any watchlist are excluded.
 */
export function resolveHoldingsByCoinId(
  rows: Doc<"watchlists">[],
  canonicalByCoinId: Map<string, number>,
): Map<string, number> {
  const listedCoinIds = new Set(rows.map((row) => row.coinId));

  const resolved = new Map<string, number>();
  for (const [coinId, holdings] of canonicalByCoinId) {
    if (!listedCoinIds.has(coinId)) continue;
    resolved.set(coinId, holdings);
  }

  for (const row of rows) {
    if (canonicalByCoinId.has(row.coinId)) continue;
    const legacy = row.holdings;
    if (typeof legacy !== "number" || !isValidHoldings(legacy)) continue;
    resolved.set(row.coinId, Math.max(resolved.get(row.coinId) ?? 0, legacy));
  }

  return resolved;
}

/**
 * Partition resolved holdings across watchlist groups for per-group
 * breakdowns. Each coin is attributed to exactly ONE group — the one holding
 * the user's earliest watchlist row for that coin — so summing group totals
 * never double-counts a coin that appears on several watchlists.
 */
export function partitionHoldingsByGroup(
  rows: Doc<"watchlists">[],
  holdingsByCoinId: Map<string, number>,
): Map<Id<"watchlistGroups">, Map<string, number>> {
  const earliestRowByCoinId = new Map<string, Doc<"watchlists">>();
  for (const row of rows) {
    const current = earliestRowByCoinId.get(row.coinId);
    if (!current || row._creationTime < current._creationTime) {
      earliestRowByCoinId.set(row.coinId, row);
    }
  }

  const byGroupId = new Map<Id<"watchlistGroups">, Map<string, number>>();
  for (const [coinId, holdings] of holdingsByCoinId) {
    const ownerRow = earliestRowByCoinId.get(coinId);
    if (!ownerRow) continue;

    const groupId = ownerRow.watchlistGroupId;
    const byCoin = byGroupId.get(groupId) ?? new Map<string, number>();
    byCoin.set(coinId, holdings);
    byGroupId.set(groupId, byCoin);
  }

  return byGroupId;
}

/** Convenience: load + overlay in one call for queries returning items. */
export async function withCanonicalHoldings(
  db: DatabaseReader,
  userId: Id<"users">,
  items: Doc<"watchlists">[],
): Promise<Doc<"watchlists">[]> {
  const byCoinId = await getCanonicalHoldingsByCoinId(db, userId);
  return overlayCanonicalHoldings(items, byCoinId);
}

/** Set or clear the canonical holdings value for a (user, coin). */
export async function setCanonicalHoldings(
  db: DatabaseWriter,
  userId: Id<"users">,
  coinId: string,
  holdings: number | null,
): Promise<void> {
  const existing = await db
    .query("coinHoldings")
    .withIndex("by_user_coin", (q) => q.eq("userId", userId).eq("coinId", coinId))
    .first();

  if (holdings === null || !isValidHoldings(holdings)) {
    if (existing) await db.delete(existing._id);
    return;
  }

  if (existing) {
    await db.patch(existing._id, { holdings, updatedAt: Date.now() });
  } else {
    await db.insert("coinHoldings", {
      userId,
      coinId,
      holdings,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Delete the canonical holdings row when a coin no longer appears in ANY of
 * the user's watchlist groups. Call after deleting watchlist rows.
 */
export async function pruneCanonicalHoldingsIfUnlisted(
  db: DatabaseWriter,
  userId: Id<"users">,
  coinId: string,
): Promise<void> {
  const stillListed = await db
    .query("watchlists")
    .withIndex("by_user_coin", (q) => q.eq("userId", userId).eq("coinId", coinId))
    .first();
  if (stillListed) return;

  const holdingsRow = await db
    .query("coinHoldings")
    .withIndex("by_user_coin", (q) => q.eq("userId", userId).eq("coinId", coinId))
    .first();
  if (holdingsRow) await db.delete(holdingsRow._id);
}
