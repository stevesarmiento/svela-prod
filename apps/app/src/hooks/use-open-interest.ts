import { useQuery } from '@tanstack/react-query';
import { CoinGlassApi } from '@/lib/effect/coinglass-api'
import { runPromise } from '@/lib/effect/runtime-coinglass'

interface OpenInterestOHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface OpenInterestResponse {
  success: boolean;
  data: OpenInterestOHLC[];
  count: number;
  symbol: string;
  interval: string;
  unit: string;
  originalInput: string;
  coinInfo?: {
    symbol: string;
    name: string;
    coinId: number;
    isSupported: boolean;
  };
  lastUpdated: string;
}

interface UseOpenInterestProps {
  symbol: string;
  interval?: string;
  limit?: number;
  unit?: 'usd' | 'coin';
  startTime?: number;
  endTime?: number;
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

export function useOpenInterest({
  symbol,
  interval = '4h',
  limit = 100,
  unit = 'usd',
  startTime,
  endTime,
}: UseOpenInterestProps) {
  return useQuery({
    queryKey: ['openInterest', symbol, interval, limit, unit, startTime, endTime],
    queryFn: async (): Promise<OpenInterestResponse> => {
      try {
        const result = await runPromise(
          CoinGlassApi.getOpenInterest({
            symbol,
            interval,
            limit,
            unit,
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
    enabled: !!symbol,
    // Backend refreshes CoinGlass open interest every 4h (convex/crons.ts).
    refetchInterval: 15 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
  });
}