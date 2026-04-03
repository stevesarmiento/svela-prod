"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

interface TakerMetricsRow {
  buyRatio: number
  sellRatio: number
  buyVolumeUsd: number
  sellVolumeUsd: number
  totalVolumeUsd: number
  lastUpdatedMs: number
  stale: boolean
}

interface TakerMetricsResponse {
  success: boolean
  range: "1h" | "4h" | "12h" | "24h" | "7d"
  exchange: string | null
  bySymbol: Record<string, TakerMetricsRow | null>
  counts: { total: number; missing: number; stale: number }
}

export function useSmartScreenerTakerMetrics(args: {
  symbols: Array<string>
  range: "1h" | "4h" | "12h" | "24h" | "7d"
  exchange: string | null
  enabled: boolean
}) {
  const normalizedSymbols = useMemo(() => {
    return Array.from(
      new Set(args.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
    ).slice(0, 300)
  }, [args.symbols])

  const query = useQuery({
    queryKey: ["smart-screener", "taker-metrics", args.range, args.exchange, normalizedSymbols],
    queryFn: async (): Promise<TakerMetricsResponse> => {
      const res = await fetch("/api/smart-screener/taker-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: normalizedSymbols,
          range: args.range,
          exchange: args.exchange,
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`Request failed (${res.status}): ${text.slice(0, 200)}`)
      }

      return (await res.json()) as TakerMetricsResponse
    },
    enabled: args.enabled && normalizedSymbols.length > 0,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: 0,
  })

  return {
    bySymbol: query.data?.bySymbol ?? {},
    counts: query.data?.counts ?? { total: 0, missing: 0, stale: 0 },
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}

