"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { CoinMarketData } from "@/types/coins";

export interface ScreenerTopMarketRow {
  coingeckoId: string;
  symbol: string;
  name: string;
  image: string;
  currentPrice?: number;
  marketCap?: number;
  marketCapRank?: number;
  totalVolume?: number;
  priceChangePercentage24h?: number;
  updatedAt?: number;
}

function isScreenerTopMarketRow(value: unknown): value is ScreenerTopMarketRow {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.coingeckoId === "string" &&
    typeof record.symbol === "string" &&
    typeof record.name === "string" &&
    typeof record.image === "string"
  );
}

function normalizeTopMarketsLimit(limit: number) {
  if (!Number.isFinite(limit)) return 500;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

export function screenerTopMarketsQueryKey(limit = 500) {
  return ["screener", "top-markets", String(normalizeTopMarketsLimit(limit))] as const;
}

export async function fetchScreenerTopMarkets(limit = 500): Promise<ScreenerTopMarketRow[]> {
  const normalizedLimit = normalizeTopMarketsLimit(limit);
  const response = await fetch(
    `/api/internal/markets/top?limit=${encodeURIComponent(String(normalizedLimit))}`,
  );
  if (!response.ok) throw new Error(`Top markets error: ${response.status}`);

  const json: unknown = await response.json();
  if (!Array.isArray(json) || !json.every(isScreenerTopMarketRow)) {
    throw new Error("Invalid top markets response");
  }

  return json;
}

function toCoinMarketData(row: ScreenerTopMarketRow): CoinMarketData {
  const price = row.currentPrice ?? 0;
  const marketCap = row.marketCap ?? 0;
  const marketCapRank = row.marketCapRank ?? 0;
  const totalVolume = row.totalVolume ?? 0;
  const change24h = row.priceChangePercentage24h ?? 0;

  return {
    id: row.coingeckoId,
    name: row.name,
    symbol: row.symbol,
    slug: row.coingeckoId,
    image: row.image,
    sparkline7d: undefined,
    cmc_rank: marketCapRank,
    circulating_supply: 0,
    max_supply: null,
    quote: {
      USD: {
        price,
        volume_24h: totalVolume,
        market_cap: marketCap,
        percent_change_24h: change24h,
        percent_change_1h: undefined,
        percent_change_7d: undefined,
        percent_change_30d: undefined,
        percent_change_60d: undefined,
        percent_change_90d: undefined,
      },
    },
    fundingRate: null,
  };
}

export function useScreenerTopMarkets(limit = 500): {
  data: CoinMarketData[];
  lastUpdatedAtMs: number | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: screenerTopMarketsQueryKey(limit),
    queryFn: async () => await fetchScreenerTopMarkets(limit),
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
  };
}
