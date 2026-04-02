"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { CoinMarketData } from "@/types/coins";

interface CoingeckoMarketRow {
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

function isCoingeckoMarketRow(value: unknown): value is CoingeckoMarketRow {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.coingeckoId === "string" &&
    typeof record.symbol === "string" &&
    typeof record.name === "string" &&
    typeof record.image === "string"
  );
}

function toCoinMarketData(row: CoingeckoMarketRow): CoinMarketData {
  return {
    id: row.coingeckoId,
    name: row.name,
    symbol: row.symbol,
    slug: row.coingeckoId,
    image: row.image,
    sparkline7d: undefined,
    cmc_rank: row.marketCapRank ?? 0,
    circulating_supply: 0,
    max_supply: null,
    quote: {
      USD: {
        price: row.currentPrice ?? 0,
        volume_24h: row.totalVolume ?? 0,
        market_cap: row.marketCap ?? 0,
        percent_change_24h: row.priceChangePercentage24h ?? 0,
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

export function useScreenerTopMarkets(limit = 250): {
  data: CoinMarketData[];
  lastUpdatedAtMs: number | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: ["screener", "top-markets", String(limit)],
    queryFn: async (): Promise<CoingeckoMarketRow[]> => {
      const response = await fetch(`/api/internal/markets/top?limit=${encodeURIComponent(String(limit))}`);
      if (!response.ok) throw new Error(`Top markets error: ${response.status}`);
      const json: unknown = await response.json();
      if (!Array.isArray(json) || !json.every(isCoingeckoMarketRow)) {
        throw new Error("Invalid top markets response");
      }
      return json;
    },
    enabled: limit > 0,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const coins = useMemo(() => (query.data ?? []).map(toCoinMarketData), [query.data]);
  const lastUpdatedAtMs = useMemo(() => {
    const rows = query.data ?? [];
    let max = 0;
    for (const row of rows) {
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

