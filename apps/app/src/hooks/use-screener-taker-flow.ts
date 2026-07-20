"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface TakerFlowMetrics {
  buyRatio: number;
  sellRatio: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  totalVolumeUsd: number;
  lastUpdatedMs: number;
  stale: boolean;
}

interface TakerFlowResponse {
  success: boolean;
  byId: Record<string, TakerFlowMetrics | null>;
}

const MAX_COINS = 500;

/**
 * ONE batched order-flow request for the whole screener table (ID-keyed),
 * replacing the old per-row taker-history chart fetches. Snapshots refresh
 * on a 4h cron + demand warmup, so a coarse client cadence is plenty.
 */
export function useScreenerTakerFlow(args: {
  coins: ReadonlyArray<{ id: string; symbol: string }>;
  enabled?: boolean;
}): {
  byId: Record<string, TakerFlowMetrics | null>;
  isLoading: boolean;
} {
  const coins = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ coingeckoId: string; symbol: string }> = [];
    for (const coin of args.coins) {
      const id = coin.id.trim();
      const symbol = coin.symbol.trim().toUpperCase();
      if (!id || !symbol || seen.has(id)) continue;
      seen.add(id);
      out.push({ coingeckoId: id, symbol });
      if (out.length >= MAX_COINS) break;
    }
    return out;
  }, [args.coins]);

  const queryKey = useMemo(
    () =>
      [
        "screener",
        "taker-flow",
        coins
          .map((c) => c.coingeckoId)
          .sort()
          .join(","),
      ] as const,
    [coins],
  );

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<TakerFlowResponse> => {
      const response = await fetch("/api/smart-screener/taker-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ coins, range: "24h" }),
      });
      if (!response.ok) throw new Error(`Taker flow error: ${response.status}`);
      return (await response.json()) as TakerFlowResponse;
    },
    enabled: (args.enabled ?? true) && coins.length > 0,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  });

  const byId = query.data?.byId;
  const isLoading = query.isLoading;
  // Stable identity: this feeds a context value memo.
  return useMemo(() => ({ byId: byId ?? {}, isLoading }), [byId, isLoading]);
}
