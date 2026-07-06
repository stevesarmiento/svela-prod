import { NextResponse, type NextRequest } from "next/server"
import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"

import { api } from "../../../../../convex/_generated/api"
import { convex, getServerToken } from "@/lib/convex-server"

export const dynamic = "force-dynamic"

const RequestSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1).max(300),
  range: z.enum(["1h", "4h", "12h", "24h", "7d"]).optional().default("24h"),
  exchange: z.string().min(1).optional().nullable(),
})

async function handlePost(request: NextRequest) {
  const userId = (await auth().catch(() => null))?.userId ?? null
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const json = (await request.json().catch(() => null)) as unknown
  const parsed = RequestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { symbols, range, exchange } = parsed.data
  const normalizedExchange = exchange ? exchange.trim() : null

  const batch = await convex.query(
    api.coinglassReads.getTakerBuySellExchangeListSnapshotsBatch,
    {
      serverToken: getServerToken(),
      symbols,
      range,
    },
  )

  // Warm up a small subset of missing/stale symbols (dedup is enforced in Convex).
  const warmupTargets = batch.filter((row) => !row.data || row.stale).slice(0, 25)
  if (warmupTargets.length > 0) {
    void Promise.all(
      warmupTargets.map((row) =>
        convex.mutation(api.coinglassWarmup.requestTakerBuySellExchangeListSnapshotRefresh, {
          serverToken: getServerToken(),
          symbol: row.symbol,
          range,
        }),
      ),
    ).catch(() => null)
  }

  const bySymbol: Record<
    string,
    | {
        buyRatio: number
        sellRatio: number
        buyVolumeUsd: number
        sellVolumeUsd: number
        totalVolumeUsd: number
        lastUpdatedMs: number
        stale: boolean
      }
    | null
  > = {}

  let staleCount = 0
  let missingCount = 0

  for (const row of batch) {
    if (!row.data) {
      bySymbol[row.symbol] = null
      missingCount += 1
      continue
    }

    const snapshot = row.data
    const scoped =
      normalizedExchange && snapshot.exchanges.length > 0
        ? snapshot.exchanges.find(
            (ex) => ex.exchange.toLowerCase() === normalizedExchange.toLowerCase(),
          ) ?? snapshot.overall
        : snapshot.overall

    bySymbol[row.symbol] = {
      buyRatio: scoped.buyRatio,
      sellRatio: scoped.sellRatio,
      buyVolumeUsd: scoped.buyVolumeUsd,
      sellVolumeUsd: scoped.sellVolumeUsd,
      totalVolumeUsd: scoped.totalVolumeUsd,
      lastUpdatedMs: row.lastUpdated,
      stale: row.stale,
    }

    if (row.stale) staleCount += 1
  }

  return NextResponse.json(
    {
      success: true,
      range,
      exchange: normalizedExchange,
      bySymbol,
      counts: {
        total: batch.length,
        missing: missingCount,
        stale: staleCount,
      },
      warmupScheduled: warmupTargets.length,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
      },
    },
  )
}


export const POST = withAuthRatelimit(handlePost, {
  name: "smart-screener-taker-metrics",
});
