"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { CoinsInternalApi } from "@/lib/effect/coins-internal-api";
import { runPromise as runCoinsInternalPromise } from "@/lib/effect/runtime-coins-internal";
import {
  type ScreenerMarketRowLike,
  toCoinMarketData,
} from "@/lib/screener/coin-market-data";
import type { CoinMarketData } from "@/types/coins";

export type ScreenerTopMarketRow = ScreenerMarketRowLike;

function normalizeTopMarketsLimit(limit: number) {
  if (!Number.isFinite(limit)) return 500;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

export function screenerTopMarketsQueryKey(limit = 500) {
  return [
    "screener",
    "top-markets",
    String(normalizeTopMarketsLimit(limit)),
  ] as const;
}

export async function fetchScreenerTopMarkets(
  limit = 500,
  signal?: AbortSignal,
): Promise<ScreenerTopMarketRow[]> {
  const normalizedLimit = normalizeTopMarketsLimit(limit);
  const rows = await runCoinsInternalPromise(
    CoinsInternalApi.use((api) => api.topMarkets({ limit: normalizedLimit })),
    { signal },
  );
  return [...rows];
}

export function useScreenerTopMarkets(limit = 500): {
  data: CoinMarketData[];
  lastUpdatedAtMs: number | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: screenerTopMarketsQueryKey(limit),
    queryFn: async ({ signal }) => await fetchScreenerTopMarkets(limit, signal),
    enabled: limit > 0,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const coins = useMemo(() => {
    return (query.data ?? []).map((row) => toCoinMarketData(row));
  }, [query.data]);

  const lastUpdatedAtMs = useMemo(() => {
    const ids = query.data ?? [];
    let max = 0;
    for (const row of ids) {
      const ts = row.updatedAt ?? 0;
      if (Number.isFinite(ts) && ts > max) max = ts;
    }
    return max > 0 ? max : null;
  }, [query.data]);

  return {
    data: coins,
    lastUpdatedAtMs,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
  };
}
