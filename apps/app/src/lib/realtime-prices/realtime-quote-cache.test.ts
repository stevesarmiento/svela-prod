/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"

import type { CoinGeckoQuoteMarketData } from "@/lib/effect/coingecko-api"
import { coingeckoQuoteQueryKeys } from "@/hooks/use-coingecko-quotes"
import { patchCoinGeckoQuoteCaches } from "./realtime-quote-cache"

function makeQuote(coinId: string, price: number, lastUpdated: string): CoinGeckoQuoteMarketData {
  return {
    id: coinId,
    name: coinId,
    symbol: coinId.toUpperCase(),
    market_cap_rank: null,
    image: "",
    current_price: price,
    market_cap: null,
    total_volume: null,
    price_change_percentage_24h: null,
    last_updated: lastUpdated,
  }
}

describe("patchCoinGeckoQuoteCaches", () => {
  test("patches single quote cache and any bulk maps containing coin", () => {
    const queryClient = new QueryClient()

    const coinId = "bitcoin"
    const nextPrice = 123
    const nextUpdated = new Date("2026-01-01T00:00:00.000Z").toISOString()

    queryClient.setQueryData(coingeckoQuoteQueryKeys.single(coinId), makeQuote(coinId, 100, "2025-01-01T00:00:00.000Z"))

    const bulkKeyWith = coingeckoQuoteQueryKeys.bulk(["bitcoin", "ethereum"].join(","))
    const bulkKeyWithout = coingeckoQuoteQueryKeys.bulk(["solana"].join(","))

    queryClient.setQueryData(bulkKeyWith, {
      bitcoin: makeQuote("bitcoin", 100, "2025-01-01T00:00:00.000Z"),
      ethereum: makeQuote("ethereum", 200, "2025-01-01T00:00:00.000Z"),
    })

    queryClient.setQueryData(bulkKeyWithout, {
      solana: makeQuote("solana", 50, "2025-01-01T00:00:00.000Z"),
    })

    patchCoinGeckoQuoteCaches({
      queryClient,
      coinId,
      patch: { current_price: nextPrice, last_updated: nextUpdated },
    })

    const single = queryClient.getQueryData<CoinGeckoQuoteMarketData | null>(coingeckoQuoteQueryKeys.single(coinId))
    expect(single?.current_price).toBe(nextPrice)
    expect(single?.last_updated).toBe(nextUpdated)

    const bulkWith = queryClient.getQueryData<Record<string, CoinGeckoQuoteMarketData>>(bulkKeyWith)
    expect(bulkWith?.bitcoin?.current_price).toBe(nextPrice)
    expect(bulkWith?.bitcoin?.last_updated).toBe(nextUpdated)
    expect(bulkWith?.ethereum?.current_price).toBe(200)

    const bulkWithout = queryClient.getQueryData<Record<string, CoinGeckoQuoteMarketData>>(bulkKeyWithout)
    expect(bulkWithout?.solana?.current_price).toBe(50)
  })
})

