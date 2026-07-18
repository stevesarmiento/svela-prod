import { describe, expect, it } from "bun:test";
import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  overlayCanonicalHoldings,
  partitionHoldingsByGroup,
  resolveHoldingsByCoinId,
} from "../convex/_lib/holdings";

const USER_ID = "user1" as Id<"users">;

function row(
  coinId: string,
  groupId: string,
  options: { holdings?: number; creationTime?: number } = {},
): Doc<"watchlists"> {
  return {
    _id: `${groupId}:${coinId}` as Id<"watchlists">,
    _creationTime: options.creationTime ?? 0,
    userId: USER_ID,
    watchlistGroupId: groupId as Id<"watchlistGroups">,
    coinId,
    ...(options.holdings !== undefined ? { holdings: options.holdings } : {}),
  };
}

describe("overlayCanonicalHoldings", () => {
  it("applies the canonical value to every row of the coin, across groups", () => {
    const rows = [row("solana", "groupA"), row("solana", "groupB"), row("bitcoin", "groupA")];
    const overlaid = overlayCanonicalHoldings(rows, new Map([["solana", 10]]));

    expect(overlaid[0]?.holdings).toBe(10);
    expect(overlaid[1]?.holdings).toBe(10);
    expect(overlaid[2]?.holdings).toBeUndefined();
  });

  it("canonical value overrides a stale legacy row value", () => {
    const rows = [row("solana", "groupA", { holdings: 3 })];
    const overlaid = overlayCanonicalHoldings(rows, new Map([["solana", 10]]));
    expect(overlaid[0]?.holdings).toBe(10);
  });

  it("keeps not-yet-migrated legacy values when no canonical entry exists", () => {
    const rows = [row("solana", "groupA", { holdings: 3 })];
    const overlaid = overlayCanonicalHoldings(rows, new Map());
    expect(overlaid[0]?.holdings).toBe(3);
  });
});

describe("resolveHoldingsByCoinId", () => {
  it("never sums a coin listed on multiple watchlists", () => {
    const rows = [row("solana", "groupA"), row("solana", "groupB")];
    const resolved = resolveHoldingsByCoinId(rows, new Map([["solana", 10]]));
    expect(resolved.get("solana")).toBe(10);
  });

  it("canonical wins over legacy row values", () => {
    const rows = [row("solana", "groupA", { holdings: 99 })];
    const resolved = resolveHoldingsByCoinId(rows, new Map([["solana", 10]]));
    expect(resolved.get("solana")).toBe(10);
  });

  it("falls back to MAX of legacy row values, not the sum", () => {
    const rows = [
      row("solana", "groupA", { holdings: 10 }),
      row("solana", "groupB", { holdings: 4 }),
    ];
    const resolved = resolveHoldingsByCoinId(rows, new Map());
    expect(resolved.get("solana")).toBe(10);
  });

  it("excludes canonical entries for coins no longer on any watchlist", () => {
    const rows = [row("bitcoin", "groupA")];
    const resolved = resolveHoldingsByCoinId(rows, new Map([["solana", 10]]));
    expect(resolved.has("solana")).toBe(false);
  });

  it("ignores invalid legacy values", () => {
    const rows = [
      row("solana", "groupA", { holdings: 0 }),
      row("bitcoin", "groupA", { holdings: Number.NaN }),
    ];
    const resolved = resolveHoldingsByCoinId(rows, new Map());
    expect(resolved.size).toBe(0);
  });
});

describe("partitionHoldingsByGroup", () => {
  it("attributes a multi-watchlist coin to exactly one group (earliest row)", () => {
    const rows = [
      row("solana", "groupB", { creationTime: 200 }),
      row("solana", "groupA", { creationTime: 100 }),
    ];
    const partitioned = partitionHoldingsByGroup(rows, new Map([["solana", 10]]));

    expect(partitioned.get("groupA" as Id<"watchlistGroups">)?.get("solana")).toBe(10);
    expect(partitioned.has("groupB" as Id<"watchlistGroups">)).toBe(false);
  });

  it("group totals sum to the canonical total (no double-count)", () => {
    const rows = [
      row("solana", "groupA", { creationTime: 1 }),
      row("solana", "groupB", { creationTime: 2 }),
      row("bitcoin", "groupB", { creationTime: 3 }),
    ];
    const holdings = new Map([
      ["solana", 10],
      ["bitcoin", 2],
    ]);
    const partitioned = partitionHoldingsByGroup(rows, holdings);

    let total = 0;
    for (const byCoin of partitioned.values()) {
      for (const value of byCoin.values()) total += value;
    }
    expect(total).toBe(12);
  });

  it("skips holdings for coins with no watchlist row", () => {
    const partitioned = partitionHoldingsByGroup([], new Map([["solana", 10]]));
    expect(partitioned.size).toBe(0);
  });
});
