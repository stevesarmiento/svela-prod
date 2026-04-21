"use client"

import { useQuery } from "@tanstack/react-query"
import type { CoinMarketData } from "@/types/coins"

interface CoinSearchResult {
  coingeckoId: string
  name: string
  symbol: string
  logoUrl: string
}

interface CoinGeckoMarketRow {
  id: string
  name: string
  symbol: string
  image: string | null
  current_price: number | null
  market_cap: number | null
  market_cap_rank: number | null
  total_volume: number | null
  price_change_percentage_24h: number | null
}

interface CoinGeckoMarketsResponse {
  data: CoinGeckoMarketRow[]
}

function isCoinSearchResult(value: unknown): value is CoinSearchResult {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.coingeckoId === "string" &&
    typeof record.name === "string" &&
    typeof record.symbol === "string" &&
    typeof record.logoUrl === "string"
  )
}

function isCoinGeckoMarketRow(value: unknown): value is CoinGeckoMarketRow {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.symbol === "string"
  )
}

function isCoinGeckoMarketsResponse(value: unknown): value is CoinGeckoMarketsResponse {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return Array.isArray(record.data) && record.data.every(isCoinGeckoMarketRow)
}

function toCoinMarketData(
  result: CoinSearchResult,
  market: CoinGeckoMarketRow | null,
): CoinMarketData {
  return {
    id: result.coingeckoId,
    name: result.name,
    symbol: result.symbol,
    slug: result.coingeckoId,
    image: market?.image ?? result.logoUrl,
    sparkline7d: undefined,
    cmc_rank: market?.market_cap_rank ?? 0,
    circulating_supply: 0,
    max_supply: null,
    quote: {
      USD: {
        price: market?.current_price ?? 0,
        volume_24h: market?.total_volume ?? 0,
        market_cap: market?.market_cap ?? 0,
        percent_change_24h: market?.price_change_percentage_24h ?? 0,
        percent_change_1h: undefined,
        percent_change_7d: undefined,
        percent_change_30d: undefined,
        percent_change_60d: undefined,
        percent_change_90d: undefined,
      },
    },
    fundingRate: null,
  }
}

async function fetchScreenerSearchResults(
  query: string,
  limit: number,
): Promise<CoinMarketData[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const searchResponse = await fetch(
    `/api/internal/coins/search?query=${encodeURIComponent(trimmedQuery)}&limit=${limit}`,
  )
  if (!searchResponse.ok) {
    throw new Error(`Search error: ${searchResponse.status}`)
  }

  const searchJson: unknown = await searchResponse.json()
  if (!Array.isArray(searchJson) || !searchJson.every(isCoinSearchResult)) {
    throw new Error("Invalid coin search response")
  }

  if (searchJson.length === 0) return []

  const ids = searchJson.map((coin) => coin.coingeckoId)
  const marketsResponse = await fetch(
    `/api/coingecko/markets?ids=${encodeURIComponent(ids.join(","))}&vs_currency=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true`,
  )
  if (!marketsResponse.ok) {
    throw new Error(`Markets error: ${marketsResponse.status}`)
  }

  const marketsJson: unknown = await marketsResponse.json()
  if (!isCoinGeckoMarketsResponse(marketsJson)) {
    throw new Error("Invalid coin markets response")
  }

  const marketById = new Map(marketsJson.data.map((market) => [market.id, market] as const))

  return searchJson
    .map((result) => toCoinMarketData(result, marketById.get(result.coingeckoId) ?? null))
    .sort((a, b) => {
      const marketCapA = a.quote.USD.market_cap || 0
      const marketCapB = b.quote.USD.market_cap || 0

      if (marketCapA > 0 && marketCapB > 0) {
        return marketCapB - marketCapA
      }

      if (marketCapA > 0 && marketCapB === 0) return -1
      if (marketCapB > 0 && marketCapA === 0) return 1

      const rankA = a.cmc_rank || Number.POSITIVE_INFINITY
      const rankB = b.cmc_rank || Number.POSITIVE_INFINITY
      return rankA - rankB
    })
}

export function useScreenerSearchResults(query: string, limit = 50) {
  const trimmedQuery = query.trim()

  const queryResult = useQuery({
    queryKey: ["screener", "coin-search", trimmedQuery, limit],
    queryFn: () => fetchScreenerSearchResults(trimmedQuery, limit),
    enabled: trimmedQuery.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  return {
    data: queryResult.data ?? [],
    isLoading: queryResult.isLoading,
    error: queryResult.error as Error | null,
  }
}
