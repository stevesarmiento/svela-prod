import { useQuery } from '@tanstack/react-query'
import { CoinGlassApi } from '@/lib/effect/coinglass-api'
import { runPromise } from '@/lib/effect/runtime-coinglass'

interface ExchangeData {
  exchange: string
  buyRatio: number
  sellRatio: number
  buyVolumeUsd: number
  sellVolumeUsd: number
  totalVolumeUsd: number
}

interface OverallData {
  buyRatio: number
  sellRatio: number
  buyVolumeUsd: number
  sellVolumeUsd: number
  totalVolumeUsd: number
}

interface TakerBuySellData {
  symbol: string
  overall: OverallData
  exchanges: ExchangeData[]
}

interface TakerBuySellResponse {
  success: boolean
  data: TakerBuySellData
  range: string
  symbol: string
  originalInput: string
  coinInfo?: {
    symbol: string
    name: string
    coinId: number
    isSupported: boolean
  }
  lastUpdated: string
}

interface UseTakerBuySellProps {
  symbol: string
  range?: string
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

export function useTakerBuySell({
  symbol,
  range = '24h',
}: UseTakerBuySellProps) {
  return useQuery({
    queryKey: ['takerBuySell', symbol, range],
    queryFn: async (): Promise<TakerBuySellResponse> => {
      try {
        const result = await runPromise(
          CoinGlassApi.getTakerBuySell({
            symbol,
            range,
          }),
        )

        return {
          ...result,
          data: {
            ...result.data,
            overall: { ...result.data.overall },
            exchanges: result.data.exchanges.map((exchange) => ({ ...exchange })),
          },
        }
      } catch (error) {
        throw new Error(formatCoinGlassError(error))
      }
    },
    enabled: !!symbol,
    // Backend refreshes CoinGlass derivatives every 4h (convex/crons.ts);
    // polling faster just re-reads an unchanged snapshot.
    refetchInterval: 15 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
  })
}