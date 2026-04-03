"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { CoinMarketData } from "@/types/coins";
import { useCoinGeckoQuotesBulk } from "@/hooks/use-coingecko-quotes";
import type { CoinGeckoQuoteMarketData } from "@/lib/effect/coingecko-api";

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

function toCoinMarketData(row: CoingeckoMarketRow, quote: CoinGeckoQuoteMarketData | undefined): CoinMarketData {
  const price = quote?.current_price ?? row.currentPrice ?? 0;
  const marketCap = quote?.market_cap ?? row.marketCap ?? 0;
  const marketCapRank = quote?.market_cap_rank ?? row.marketCapRank ?? 0;
  const totalVolume = quote?.total_volume ?? row.totalVolume ?? 0;
  const change24h = quote?.price_change_percentage_24h ?? row.priceChangePercentage24h ?? 0;

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

  const coingeckoIds = useMemo(
    () => (query.data ?? []).map((row) => row.coingeckoId).filter(Boolean),
    [query.data],
  );
  const quotesQuery = useCoinGeckoQuotesBulk(coingeckoIds, {
    // Screener tolerates partial quote maps — don't fast-poll to backfill missing IDs.
    mode: "bestEffort",
    refetchOnWindowFocus: false,
  });

  const coins = useMemo(() => {
    const quotesById = quotesQuery.data as Record<string, CoinGeckoQuoteMarketData> | undefined;
    return (query.data ?? []).map((row) => toCoinMarketData(row, quotesById?.[row.coingeckoId]));
  }, [query.data, quotesQuery.data]);

  const lastUpdatedAtMs = useMemo(() => {
    const quotesById = quotesQuery.data as Record<string, CoinGeckoQuoteMarketData> | undefined;
    const ids = query.data ?? [];
    let max = 0;
    for (const row of ids) {
      const q = quotesById?.[row.coingeckoId];
      const ts = q?.last_updated ? Date.parse(q.last_updated) : row.updatedAt ?? 0;
      if (Number.isFinite(ts) && ts > max) max = ts;
    }
    return max > 0 ? max : null;
  }, [query.data, quotesQuery.data]);

  return {
    data: coins,
    lastUpdatedAtMs,
    isLoading: query.isLoading || quotesQuery.isLoading,
    isFetching: query.isFetching || quotesQuery.isFetching,
    error: (query.error as Error | null) ?? (quotesQuery.error as Error | null) ?? null,
  };
}

