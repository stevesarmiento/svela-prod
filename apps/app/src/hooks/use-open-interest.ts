import { useQuery } from '@tanstack/react-query';

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
      const params = new URLSearchParams({
        symbol,
        interval,
        limit: limit.toString(),
        unit,
      });

      if (startTime) params.append('start_time', startTime.toString());
      if (endTime) params.append('end_time', endTime.toString());

      const response = await fetch(
        `/api/coinglass/open-interest/aggregated-history?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch open interest data: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch open interest data');
      }

      return data;
    },
    enabled: !!symbol,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });
}