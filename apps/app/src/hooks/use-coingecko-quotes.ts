"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { CoinGeckoApi, type CoinGeckoQuoteMarketData } from "@/lib/effect/coingecko-api";
import { runPromise } from "@/lib/effect/runtime-coingecko";

// Transformed data structure to match our app's expectations
export interface CoinGeckoQuoteData {
  id: string;
  name: string;
  symbol: string;
  image: string; // CoinGecko image URL
  cmc_rank: number; // mapped from market_cap_rank for consistency
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
      market_cap: number;
      volume_24h: number;
    };
  };
}

// Search parameters interface
export interface CoinGeckoSearchParams {
  ids?: string[];
  symbols?: string[];
  names?: string[];
  category?: string;
  limit?: number;
}

function makeStableKeyPart(values: ReadonlyArray<string> | undefined): string {
  if (!values?.length) return ""
  const unique = Array.from(
    new Set(
      values.flatMap((value) => {
        const trimmed = value.trim()
        return trimmed.length > 0 ? [trimmed] : []
      }),
    ),
  )
  unique.sort()
  return unique.join(",")
}

export const coingeckoQuoteQueryKeys = {
  bulk: (stableIdsKey: string) => ["coingecko-quotes", stableIdsKey] as const,
  single: (coinId: string) => ["coingecko-quote", coinId] as const,
  search: (params: CoinGeckoSearchParams) =>
    [
      "coingecko-search",
      makeStableKeyPart(params.ids),
      makeStableKeyPart(params.symbols),
      makeStableKeyPart(params.names),
      params.category ?? "",
      String(params.limit ?? 100),
    ] as const,
} as const

export const COINGECKO_QUOTES_QUERY_OPTIONS = {
  staleTime: 30 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false,
} as const

function mergeQuoteMaps(args: {
  stableIds: ReadonlyArray<string>
  previous: Record<string, CoinGeckoQuoteMarketData> | undefined
  incoming: Record<string, CoinGeckoQuoteMarketData>
}): Record<string, CoinGeckoQuoteMarketData> {
  const { stableIds, previous, incoming } = args
  if (!previous) return incoming

  let didMerge = false
  const merged: Record<string, CoinGeckoQuoteMarketData> = { ...incoming }

  for (const id of stableIds) {
    const previousQuote = previous[id]
    if (!previousQuote) continue

    const incomingQuote = incoming[id]
    if (!incomingQuote) {
      merged[id] = previousQuote
      didMerge = true
      continue
    }

    const incomingSparklineLength = incomingQuote.sparkline7d?.length ?? 0
    const previousSparklineLength = previousQuote.sparkline7d?.length ?? 0
    if (incomingSparklineLength >= 2 || previousSparklineLength < 2) continue

    merged[id] = {
      ...incomingQuote,
      sparkline7d: previousQuote.sparkline7d,
    }
    didMerge = true
  }

  return didMerge ? merged : incoming
}

function isSameQuote(a: CoinGeckoQuoteMarketData | undefined, b: CoinGeckoQuoteMarketData | undefined): boolean {
  if (!a || !b) return false

  const aSpark = a.sparkline7d
  const bSpark = b.sparkline7d
  if ((aSpark?.length ?? 0) !== (bSpark?.length ?? 0)) return false
  const aSparkLast = aSpark && aSpark.length > 0 ? aSpark[aSpark.length - 1] : undefined
  const bSparkLast = bSpark && bSpark.length > 0 ? bSpark[bSpark.length - 1] : undefined
  if (aSparkLast !== bSparkLast) return false

  return (
    a.last_updated === b.last_updated &&
    a.current_price === b.current_price &&
    a.total_volume === b.total_volume &&
    a.market_cap === b.market_cap &&
    a.price_change_percentage_24h === b.price_change_percentage_24h
  )
}

function quoteUpdatedAtMs(quote: CoinGeckoQuoteMarketData | undefined): number | null {
  const raw = quote?.last_updated
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Whether a cache-sync write should replace `existing` with `incoming`.
 *
 * Only strictly-NEWER quotes propagate. This keeps cross-cache syncing
 * convergent: screens that mount many overlapping bulk maps at once (e.g. the
 * comparison view) can hold different snapshots of the same coin fetched
 * moments apart — if both directions were allowed to write, each cache's sync
 * effect would re-trigger the other's forever ("Maximum update depth
 * exceeded"). A monotonic newest-wins rule terminates by construction.
 */
function shouldSyncQuote(
  existing: CoinGeckoQuoteMarketData | undefined,
  incoming: CoinGeckoQuoteMarketData | undefined,
): boolean {
  if (!incoming) return false
  if (!existing) return true
  if (isSameQuote(existing, incoming)) return false

  const existingMs = quoteUpdatedAtMs(existing)
  const incomingMs = quoteUpdatedAtMs(incoming)
  // Without comparable timestamps we can't prove the write converges — only
  // allow filling in a timestamped quote over an untimestamped one.
  if (existingMs === null || incomingMs === null) {
    return existingMs === null && incomingMs !== null
  }
  return incomingMs > existingMs
}

function formatCoinGeckoError(error: unknown): string {
  if (error && typeof error === "object" && "_tag" in error) {
    const tagged = error as { _tag: string; message?: unknown; status?: unknown }
    if (typeof tagged.message === "string") return tagged.message
    if (typeof tagged.status === "number") return `CoinGecko request failed (${tagged.status})`
    return `CoinGecko request failed (${tagged._tag})`
  }

  return error instanceof Error ? error.message : String(error)
}

export async function fetchCoinGeckoQuote(
  coinId: string,
): Promise<CoinGeckoQuoteMarketData | null> {
  if (!coinId) return null

  try {
    const result = await runPromise(CoinGeckoApi.getQuotes({ ids: [coinId] }))
    if (result.status?.error_code !== undefined && result.status.error_code !== 0) {
      throw new Error(result.status.error_message || "API error")
    }
    return result.data[coinId] ?? null
  } catch (error) {
    throw new Error(formatCoinGeckoError(error))
  }
}

export function useCoinGeckoQuote(coinId: string | null | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery<CoinGeckoQuoteMarketData | null, Error>({
    queryKey: coingeckoQuoteQueryKeys.single(coinId ?? ""),
    queryFn: async (): Promise<CoinGeckoQuoteMarketData | null> =>
      await fetchCoinGeckoQuote(coinId ?? ""),
    enabled: !!coinId,
    retry: 1,
    ...COINGECKO_QUOTES_QUERY_OPTIONS,
  })

  useEffect(() => {
    if (!coinId) return
    const coin = query.data
    if (!coin) return

    // Keep ALL bulk quote maps consistent with the canonical per-coin quote.
    const bulkQueries = queryClient.getQueryCache().findAll({ queryKey: ["coingecko-quotes"] })
    for (const bulkQuery of bulkQueries) {
      const key = bulkQuery.queryKey
      const stableIdsKey = typeof key[1] === "string" ? (key[1] as string) : null
      if (!stableIdsKey) continue

      queryClient.setQueryData<Record<string, CoinGeckoQuoteMarketData> | undefined>(key, (old) => {
        if (!old) return old
        if (!(coinId in old)) return old
        if (!shouldSyncQuote(old[coinId], coin)) return old
        return { ...old, [coinId]: coin }
      })
    }
  }, [coinId, query.data, queryClient])

  return query
}

export interface CoinGeckoQuotesBulkOptions {
  /**
   * - "strict": temporarily poll faster when CoinGecko returns partial maps, to backfill missing IDs
   * - "bestEffort": accept partial maps and stick to the normal hourly cadence
   */
  mode?: "strict" | "bestEffort"
  /** Override global focus behavior (defaults to hook’s standard options). */
  refetchOnWindowFocus?: boolean
}

// Strict-mode backfill bookkeeping: how many fast refetches we've spent on a
// given set of missing ids. Some CoinGecko ids are permanently missing
// (delisted/renamed) — without a cap, one bad id in a watchlist makes every
// viewer poll at 20s forever.
const MAX_STRICT_BACKFILL_ATTEMPTS = 3
const strictBackfillAttempts = new Map<string, number>()

export function useCoinGeckoQuotesBulk(
  coingeckoIds: ReadonlyArray<string>,
  options: CoinGeckoQuotesBulkOptions = {},
) {
  const queryClient = useQueryClient()
  const mode = options.mode ?? "strict"

  const stableIds = useMemo(() => {
    const unique = Array.from(new Set(coingeckoIds)).filter((id) => id.length > 0)
    unique.sort()
    return unique
  }, [coingeckoIds])

  const stableIdsKey = useMemo(() => stableIds.join(","), [stableIds])
  const bulkQueryKey = useMemo(
    () => coingeckoQuoteQueryKeys.bulk(stableIdsKey),
    [stableIdsKey],
  )

  const query = useQuery<Record<string, CoinGeckoQuoteMarketData>, Error>({
    queryKey: bulkQueryKey,
    queryFn: async (): Promise<Record<string, CoinGeckoQuoteMarketData>> => {
      if (!stableIds.length) return {}

      try {
        const result = await runPromise(CoinGeckoApi.getQuotes({ ids: stableIds }))
        if (result.status?.error_code !== undefined && result.status.error_code !== 0) {
          throw new Error(result.status.error_message || "API error")
        }
        const previousData = queryClient.getQueryData<Record<string, CoinGeckoQuoteMarketData>>(
          bulkQueryKey,
        )
        return mergeQuoteMaps({
          stableIds,
          previous: previousData,
          incoming: result.data,
        })
      } catch (error) {
        throw new Error(formatCoinGeckoError(error))
      }
    },
    enabled: stableIds.length > 0,
    retry: 1,
    ...COINGECKO_QUOTES_QUERY_OPTIONS,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? COINGECKO_QUOTES_QUERY_OPTIONS.refetchOnWindowFocus,
    refetchInterval: (q) => {
      const data = q.state.data as Record<string, CoinGeckoQuoteMarketData> | undefined
      const error = q.state.error
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : ""
      if (errorMessage.includes("429") || errorMessage.includes("rate")) {
        return 60_000
      }

      const failureCount = q.state.fetchFailureCount ?? 0
      const backoffMs = Math.min(60_000, 10_000 * Math.max(1, failureCount))

      if (!data) {
        // Avoid aggressive retry loops for large bulk maps (e.g. screener).
        return mode === "bestEffort" ? Math.max(60_000, backoffMs) : backoffMs
      }

      if (mode === "strict") {
        const missing = stableIds.filter((id) => !data[id])
        if (missing.length > 0) {
          const attemptKey = `${stableIdsKey}:${missing.join(",")}`
          const attempts = strictBackfillAttempts.get(attemptKey) ?? 0
          if (attempts < MAX_STRICT_BACKFILL_ATTEMPTS) {
            strictBackfillAttempts.set(attemptKey, attempts + 1)
            return Math.max(20_000, backoffMs)
          }
          // Same ids still missing after several fast retries: treat them as
          // known-missing and fall back to the normal cadence.
        } else if (strictBackfillAttempts.size > 0) {
          // Everything resolved — reset bookkeeping for this id set.
          for (const key of strictBackfillAttempts.keys()) {
            if (key.startsWith(`${stableIdsKey}:`)) strictBackfillAttempts.delete(key)
          }
        }
      }

      return COINGECKO_QUOTES_QUERY_OPTIONS.refetchInterval
    },
  })

  useEffect(() => {
    const data = query.data
    if (!data) return

    // Keep per-coin cache warm so table → token page renders identical cached price instantly.
    for (const [id, coin] of Object.entries(data)) {
      if (!coin) continue
      queryClient.setQueryData<CoinGeckoQuoteMarketData | undefined>(
        coingeckoQuoteQueryKeys.single(id),
        (old) => (shouldSyncQuote(old ?? undefined, coin) ? coin : old),
      )
    }

    // Also keep ALL bulk quote maps in sync so different tables never drift for the same coin.
    const bulkQueries = queryClient.getQueryCache().findAll({ queryKey: ["coingecko-quotes"] })
    for (const bulkQuery of bulkQueries) {
      const key = bulkQuery.queryKey
      const otherStableIdsKey = typeof key[1] === "string" ? (key[1] as string) : null
      if (!otherStableIdsKey) continue
      if (otherStableIdsKey === stableIdsKey) continue

      queryClient.setQueryData<Record<string, CoinGeckoQuoteMarketData> | undefined>(key, (old) => {
        if (!old) return old

        let didChange = false
        const next: Record<string, CoinGeckoQuoteMarketData> = { ...old }
        for (const [id, coin] of Object.entries(data)) {
          if (!(id in old)) continue
          if (!shouldSyncQuote(old[id], coin)) continue
          next[id] = coin
          didChange = true
        }

        return didChange ? next : old
      })
    }
  }, [query.data, queryClient, stableIdsKey])

  return query
}

