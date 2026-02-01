import { useQuery } from '@tanstack/react-query'
import { CoinGlassApi } from '@/lib/effect/coinglass-api'
import { runPromise } from '@/lib/effect/runtime-coinglass'

interface FundingRateExchange {
  exchange: string
  fundingRateInterval: number
  fundingRate: number
  nextFundingTime: number
}

interface FundingRateData {
  symbol: string
  stablecoinMarginList: FundingRateExchange[]
  tokenMarginList: FundingRateExchange[]
}

interface FundingRateResponse {
  success: boolean
  data: FundingRateData[]
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

interface UseFundingRateExchangesOptions {
  symbol: string
}

export function useFundingRateExchanges({ symbol }: UseFundingRateExchangesOptions) {
  function formatCoinGlassError(error: unknown): string {
    if (error && typeof error === "object" && "_tag" in error) {
      const tagged = error as { _tag: string; message?: unknown; status?: unknown }
      if (typeof tagged.message === "string") return tagged.message
      if (typeof tagged.status === "number") return `CoinGlass request failed (${tagged.status})`
      return `CoinGlass request failed (${tagged._tag})`
    }

    return error instanceof Error ? error.message : String(error)
  }

  return useQuery({
    queryKey: ['funding-rate-exchanges', symbol],
    queryFn: async (): Promise<FundingRateResponse> => {
      try {
        const result = await runPromise(
          CoinGlassApi.getFundingRateExchanges({
            symbol: symbol.toString(),
          }),
        )

        return {
          ...result,
          data: result.data.map((row) => ({
            ...row,
            stablecoinMarginList: row.stablecoinMarginList.map((exchange) => ({ ...exchange })),
            tokenMarginList: row.tokenMarginList.map((exchange) => ({ ...exchange })),
          })),
        }
      } catch (error) {
        throw new Error(formatCoinGlassError(error))
      }
    },
    staleTime: 20 * 1000, // 20 seconds (matches API cache frequency)
    refetchInterval: 20 * 1000, // Auto-refresh every 20 seconds
    enabled: Boolean(symbol),
  })
}