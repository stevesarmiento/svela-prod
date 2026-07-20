import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { convex, getServerToken } from "@/lib/convex-server";
import { api } from "../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

/**
 * Batched taker (order-flow) snapshots for a set of coins.
 *
 * Preferred shape: `coins: [{coingeckoId, symbol}]` — joined by coingeckoId
 * (collision-proof) via the ID-keyed Convex batch query. The legacy
 * `symbols: [...]` shape is still accepted for stale deployed tabs and joins
 * by ticker symbol.
 */
const CoinsRequestSchema = z.object({
  coins: z
    .array(
      z.object({
        coingeckoId: z.string().min(1),
        symbol: z.string().min(1),
      }),
    )
    .min(1)
    .max(500),
  range: z.enum(["1h", "4h", "12h", "24h", "7d"]).optional().default("24h"),
  exchange: z.string().min(1).optional().nullable(),
});

const LegacySymbolsRequestSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1).max(300),
  range: z.enum(["1h", "4h", "12h", "24h", "7d"]).optional().default("24h"),
  exchange: z.string().min(1).optional().nullable(),
});

interface ScopedMetrics {
  buyRatio: number;
  sellRatio: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  totalVolumeUsd: number;
  lastUpdatedMs: number;
  stale: boolean;
}

function scopeSnapshot(args: {
  snapshot: {
    overall: Omit<ScopedMetrics, "lastUpdatedMs" | "stale">;
    exchanges: Array<
      Omit<ScopedMetrics, "lastUpdatedMs" | "stale"> & { exchange: string }
    >;
  };
  exchange: string | null;
  lastUpdated: number;
  stale: boolean;
}): ScopedMetrics {
  const scoped =
    args.exchange && args.snapshot.exchanges.length > 0
      ? args.snapshot.exchanges.find(
          (ex) => ex.exchange.toLowerCase() === args.exchange?.toLowerCase(),
        ) ?? args.snapshot.overall
      : args.snapshot.overall;

  return {
    buyRatio: scoped.buyRatio,
    sellRatio: scoped.sellRatio,
    buyVolumeUsd: scoped.buyVolumeUsd,
    sellVolumeUsd: scoped.sellVolumeUsd,
    totalVolumeUsd: scoped.totalVolumeUsd,
    lastUpdatedMs: args.lastUpdated,
    stale: args.stale,
  };
}

async function handlePost(request: NextRequest) {
  const userId = (await auth().catch(() => null))?.userId ?? null;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await request.json().catch(() => null)) as unknown;

  // ---- Preferred: ID-keyed coins shape ----
  const coinsParsed = CoinsRequestSchema.safeParse(json);
  if (coinsParsed.success) {
    const { coins, range, exchange } = coinsParsed.data;
    const normalizedExchange = exchange ? exchange.trim() : null;

    const batch = await convex.query(
      api.coinglassReads.getTakerBuySellSnapshotsByCoinsBatch,
      {
        serverToken: getServerToken(),
        coins,
        range,
      },
    );

    // Warm up a small subset of missing/stale coins (dedup enforced in Convex).
    const warmupTargets = batch
      .filter((row) => !row.data || row.stale)
      .slice(0, 25);
    if (warmupTargets.length > 0) {
      void Promise.all(
        warmupTargets.map((row) =>
          convex.mutation(
            api.coinglassWarmup.requestTakerBuySellExchangeListSnapshotRefresh,
            {
              serverToken: getServerToken(),
              symbol: row.symbol,
              coingeckoId: row.coingeckoId,
              range,
            },
          ),
        ),
      ).catch(() => null);
    }

    const byId: Record<string, ScopedMetrics | null> = {};
    let staleCount = 0;
    let missingCount = 0;

    for (const row of batch) {
      if (!row.data) {
        byId[row.coingeckoId] = null;
        missingCount += 1;
        continue;
      }
      byId[row.coingeckoId] = scopeSnapshot({
        snapshot: row.data,
        exchange: normalizedExchange,
        lastUpdated: row.lastUpdated,
        stale: row.stale,
      });
      if (row.stale) staleCount += 1;
    }

    return NextResponse.json(
      {
        success: true,
        range,
        exchange: normalizedExchange,
        byId,
        counts: {
          total: batch.length,
          missing: missingCount,
          stale: staleCount,
        },
        warmupScheduled: warmupTargets.length,
      },
      { status: 200 },
    );
  }

  // ---- Legacy: symbol-keyed shape (stale deployed tabs) ----
  const parsed = LegacySymbolsRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { symbols, range, exchange } = parsed.data;
  const normalizedExchange = exchange ? exchange.trim() : null;

  const batch = await convex.query(
    api.coinglassReads.getTakerBuySellExchangeListSnapshotsBatch,
    {
      serverToken: getServerToken(),
      symbols,
      range,
    },
  );

  const bySymbol: Record<string, ScopedMetrics | null> = {};
  let staleCount = 0;
  let missingCount = 0;

  for (const row of batch) {
    if (!row.data) {
      bySymbol[row.symbol] = null;
      missingCount += 1;
      continue;
    }
    bySymbol[row.symbol] = scopeSnapshot({
      snapshot: row.data,
      exchange: normalizedExchange,
      lastUpdated: row.lastUpdated,
      stale: row.stale,
    });
    if (row.stale) staleCount += 1;
  }

  return NextResponse.json(
    {
      success: true,
      range,
      exchange: normalizedExchange,
      bySymbol,
      counts: { total: batch.length, missing: missingCount, stale: staleCount },
      warmupScheduled: 0,
    },
    { status: 200 },
  );
}

export const POST = withAuthRatelimit(handlePost, {
  name: "smart-screener-taker-metrics",
});
