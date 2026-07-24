"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useScreenerTopMarkets } from "@/hooks/use-screener-top-markets";
import { toCoinMarketData } from "@/lib/screener/coin-market-data";
import {
  type SmartScreenerScreenResponse,
  SmartScreenerScreenResponseSchema,
} from "@/lib/smart-screener/screen-api";
import type { ScreeningDsl } from "@/lib/smart-screener/screening-dsl";
import type { CoinMarketData } from "@/types/coins";
import { useScreenerSearchResults } from "./use-screener-search-results";
import {
  SORT_KEY_TO_METRIC_ID,
  type ScreenerSort,
} from "./use-screener-url-state";

const SCREENER_BROWSE_LIMIT = 500;
const SCREENER_SEARCH_LIMIT = 50;

export type ScreenerResultsSource = "screen" | "search" | "browse";

/**
 * Merge an explicit header-click sort into the executed DSL. Server-side
 * re-sort is required under `limit` truncation (client-side reorder of a
 * truncated set is not a true global sort). "name" has no metric — client
 * sorts it via TanStack instead.
 */
export function mergeSortIntoDsl(
  dsl: ScreeningDsl,
  sort: ScreenerSort | null,
): ScreeningDsl {
  if (!sort) return dsl;
  const metricId = SORT_KEY_TO_METRIC_ID[sort.key];
  if (!metricId) return dsl;
  return { ...dsl, sort: { metricId, order: sort.desc ? "desc" : "asc" } };
}

/** Stable query-key form of a DSL. */
export function canonicalDslKey(dsl: ScreeningDsl): string {
  return JSON.stringify({
    f: dsl.filters.map((f) => [f.metricId, f.op, f.value]),
    s: dsl.sort ? [dsl.sort.metricId, dsl.sort.order] : null,
    l: dsl.limit,
    u: dsl.universe,
    t: dsl.takerContext
      ? [dsl.takerContext.range, dsl.takerContext.exchange]
      : null,
  });
}

export function screenerExecuteQueryKey(dsl: ScreeningDsl) {
  return ["screener", "execute", canonicalDslKey(dsl)] as const;
}

export async function executeScreeningDslRequest(
  dsl: ScreeningDsl,
  signal?: AbortSignal,
): Promise<SmartScreenerScreenResponse> {
  const response = await fetch("/api/smart-screener/screen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ dsl, surface: "screener" }),
  });

  // The screen API returns structured `ok: false` payloads with 200 only;
  // a non-2xx status is a transport/infra failure (rate limit, 500, …).
  if (!response.ok) {
    throw new Error(`Screen request failed (${response.status})`);
  }

  const json: unknown = await response.json().catch(() => null);
  const parsed = SmartScreenerScreenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Screen request failed (${response.status})`);
  }
  if (!parsed.data.ok) {
    throw new Error(
      parsed.data.error?.message ?? parsed.data.userMessage ?? "Screen failed",
    );
  }
  return parsed.data;
}

export interface ScreenerResults {
  source: ScreenerResultsSource;
  coins: Array<CoinMarketData>;
  coverage: SmartScreenerScreenResponse["coverage"] | null;
  screenUserMessage: string | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
  lastUpdatedAtMs: number | null;
}

/**
 * The single row source for the screener page:
 * - `dsl` set      → server-side DSL execution (react-query, keyed by canonical DSL)
 * - `q` set        → text search
 * - otherwise      → top-500 browse
 */
export function useScreenerResults(args: {
  dsl: ScreeningDsl | null;
  sort: ScreenerSort | null;
  q: string;
}): ScreenerResults {
  const mergedDsl = useMemo(
    () => (args.dsl ? mergeSortIntoDsl(args.dsl, args.sort) : null),
    [args.dsl, args.sort],
  );

  const executeQuery = useQuery({
    queryKey: mergedDsl
      ? screenerExecuteQueryKey(mergedDsl)
      : ["screener", "execute", "idle"],
    queryFn: async ({ signal }) => {
      if (!mergedDsl) throw new Error("no dsl");
      return await executeScreeningDslRequest(mergedDsl, signal);
    },
    enabled: mergedDsl !== null,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const searchText = args.dsl ? "" : args.q.trim();
  const searchQuery = useScreenerSearchResults(
    searchText,
    SCREENER_SEARCH_LIMIT,
  );
  const topMarketsQuery = useScreenerTopMarkets(SCREENER_BROWSE_LIMIT);

  const screenCoins = useMemo((): Array<CoinMarketData> => {
    const rows = executeQuery.data?.rows ?? [];
    return rows.map((row) => toCoinMarketData(row));
  }, [executeQuery.data]);

  if (mergedDsl) {
    return {
      source: "screen",
      coins: screenCoins,
      coverage: executeQuery.data?.coverage ?? null,
      screenUserMessage: executeQuery.data?.userMessage ?? null,
      isLoading: executeQuery.isLoading,
      isFetching: executeQuery.isFetching,
      error: (executeQuery.error as Error | null) ?? null,
      refetch: () => void executeQuery.refetch(),
      lastUpdatedAtMs: null,
    };
  }

  if (searchText) {
    return {
      source: "search",
      coins: searchQuery.data,
      coverage: null,
      screenUserMessage: null,
      isLoading: searchQuery.isLoading,
      isFetching: searchQuery.isLoading,
      error: searchQuery.error,
      refetch: () => null,
      lastUpdatedAtMs: null,
    };
  }

  return {
    source: "browse",
    coins: topMarketsQuery.data,
    coverage: null,
    screenUserMessage: null,
    isLoading: topMarketsQuery.isLoading,
    isFetching: topMarketsQuery.isFetching,
    error: topMarketsQuery.error,
    refetch: topMarketsQuery.refetch,
    lastUpdatedAtMs: topMarketsQuery.lastUpdatedAtMs,
  };
}
