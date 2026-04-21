"use client"

import { useEffect } from "react"
import type { CoinMarketData } from "@/types/coins"
import { useScreenerSearchResults } from "./use-screener-search-results"

export interface ScreenerSearchQueryState {
  data: CoinMarketData[]
  isLoading: boolean
  error: Error | null
}

interface ScreenerSearchStateLoaderProps {
  query: string
  limit: number
  onStateChange: (state: ScreenerSearchQueryState) => void
}

export function ScreenerSearchStateLoader({
  query,
  limit,
  onStateChange,
}: ScreenerSearchStateLoaderProps) {
  const queryState = useScreenerSearchResults(query, limit)

  useEffect(() => {
    onStateChange({
      data: queryState.data,
      isLoading: queryState.isLoading,
      error: queryState.error,
    })
  }, [onStateChange, queryState.data, queryState.error, queryState.isLoading])

  return null
}
