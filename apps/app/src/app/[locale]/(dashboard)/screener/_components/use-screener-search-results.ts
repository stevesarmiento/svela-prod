"use client";

import { toCoinMarketData } from "@/lib/screener/coin-market-data";
import type { CoinMarketData } from "@/types/coins";
import { useQuery } from "@tanstack/react-query";

interface CoinSearchResult {
  coingeckoId: string;
  name: string;
  symbol: string;
  logoUrl: string;
}

interface CoinGeckoMarketRow {
  id: string;
  name: string;
  symbol: string;
  image: string | null;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
}

interface CoinGeckoMarketsResponse {
  data: CoinGeckoMarketRow[];
}

function isCoinSearchResult(value: unknown): value is CoinSearchResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.coingeckoId === "string" &&
    typeof record.name === "string" &&
    typeof record.symbol === "string" &&
    typeof record.logoUrl === "string"
  );
}

function isCoinGeckoMarketRow(value: unknown): value is CoinGeckoMarketRow {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.symbol === "string"
  );
}

function isCoinGeckoMarketsResponse(
  value: unknown,
): value is CoinGeckoMarketsResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.data) && record.data.every(isCoinGeckoMarketRow);
}

function searchResultToCoinMarketData(
  result: CoinSearchResult,
  market: CoinGeckoMarketRow | null,
): CoinMarketData {
  // Null-preserving (see lib/screener/coin-market-data.ts): a coin without
  // market data yet renders "—" instead of a fake $0.
  return toCoinMarketData({
    coingeckoId: result.coingeckoId,
    symbol: result.symbol,
    name: result.name,
    image: market?.image ?? result.logoUrl,
    currentPrice: market?.current_price ?? undefined,
    marketCap: market?.market_cap ?? undefined,
    marketCapRank: market?.market_cap_rank ?? undefined,
    totalVolume: market?.total_volume ?? undefined,
    priceChangePercentage24h: market?.price_change_percentage_24h ?? undefined,
  });
}

async function fetchScreenerSearchResults(
  query: string,
  limit: number,
): Promise<CoinMarketData[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const searchResponse = await fetch(
    `/api/internal/coins/search?query=${encodeURIComponent(trimmedQuery)}&limit=${limit}`,
  );
  if (!searchResponse.ok) {
    throw new Error(`Search error: ${searchResponse.status}`);
  }

  const searchJson: unknown = await searchResponse.json();
  if (!Array.isArray(searchJson) || !searchJson.every(isCoinSearchResult)) {
    throw new Error("Invalid coin search response");
  }

  if (searchJson.length === 0) return [];

  const ids = searchJson.map((coin) => coin.coingeckoId);
  const marketsResponse = await fetch(
    `/api/coingecko/markets?ids=${encodeURIComponent(ids.join(","))}&vs_currency=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true`,
  );
  if (!marketsResponse.ok) {
    throw new Error(`Markets error: ${marketsResponse.status}`);
  }

  const marketsJson: unknown = await marketsResponse.json();
  if (!isCoinGeckoMarketsResponse(marketsJson)) {
    throw new Error("Invalid coin markets response");
  }

  const marketById = new Map(
    marketsJson.data.map((market) => [market.id, market] as const),
  );

  return searchJson
    .map((result) =>
      searchResultToCoinMarketData(
        result,
        marketById.get(result.coingeckoId) ?? null,
      ),
    )
    .sort((a, b) => {
      const marketCapA = a.quote.USD.market_cap ?? 0;
      const marketCapB = b.quote.USD.market_cap ?? 0;

      if (marketCapA > 0 && marketCapB > 0) {
        return marketCapB - marketCapA;
      }

      if (marketCapA > 0 && marketCapB === 0) return -1;
      if (marketCapB > 0 && marketCapA === 0) return 1;

      const rankA = a.cmc_rank ?? Number.POSITIVE_INFINITY;
      const rankB = b.cmc_rank ?? Number.POSITIVE_INFINITY;
      return rankA - rankB;
    });
}

export function useScreenerSearchResults(query: string, limit = 50) {
  const trimmedQuery = query.trim();

  const queryResult = useQuery({
    queryKey: ["screener", "coin-search", trimmedQuery, limit],
    queryFn: () => fetchScreenerSearchResults(trimmedQuery, limit),
    enabled: trimmedQuery.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: queryResult.data ?? [],
    isLoading: queryResult.isLoading,
    error: queryResult.error as Error | null,
  };
}
