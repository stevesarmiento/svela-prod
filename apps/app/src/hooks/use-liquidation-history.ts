'use client'

import { useQuery } from '@tanstack/react-query'
import { CoinGlassApi } from '@/lib/effect/coinglass-api'
import { runPromise } from '@/lib/effect/runtime-coinglass'

interface LiquidationHistoryItem {
  timestamp: number
  date: string
  longLiquidations: number
  shortLiquidations: number
  totalLiquidations: number
}

interface LiquidationHistoryResponse {
  success: boolean
  data: LiquidationHistoryItem[]
  count: number
  symbol: string
  originalInput: string
  interval: string
  exchangeList: string
  lastUpdated: string
  coinInfo?: {
    symbol: string
    name: string
    coinId: number
    isSupported: boolean
  }
}

interface UseLiquidationHistoryParams {
  symbol?: string
  interval?: string
  exchangeList?: string
  limit?: number
  startTime?: number
  endTime?: number
}

function formatCoinGlassError(error: unknown): string {
  if (error && typeof error === "object" && "_tag" in error) {
    const tagged = error as { _tag: string; message?: unknown; status?: unknown }
    if (typeof tagged.message === "string") return tagged.message
    if (typeof tagged.status === "number") return `CoinGlass request failed (${tagged.status})`
    return `CoinGlass request failed (${tagged._tag})`
  }

  return error instanceof Error ? error.message : String(error)
}

export function useLiquidationHistory(params: UseLiquidationHistoryParams = {}) {
  const {
    symbol = 'BTC',
    interval = '1d',
    exchangeList = 'Binance',
    limit = 100,
    startTime,
    endTime
  } = params

  return useQuery({
    queryKey: ['liquidation-history', symbol, interval, exchangeList, limit, startTime, endTime],
    queryFn: async (): Promise<LiquidationHistoryResponse> => {
      try {
        const result = await runPromise(
          CoinGlassApi.getLiquidationHistory({
            symbol,
            interval,
            exchangeList,
            limit,
            startTime,
            endTime,
          }),
        )

        return {
          ...result,
          data: result.data.map((row) => ({ ...row })),
        }
      } catch (error) {
        throw new Error(formatCoinGlassError(error))
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  })
}