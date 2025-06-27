import { useQuery } from '@tanstack/react-query';

interface LongShortRatioData {
  longShortRatio: number | null;
  symbol: string | null;
  lastUpdate: number | null;
  historical: Array<{
    t: number; // timestamp
    r: number; // ratio
    l: number; // long
    s: number; // short
  }>;
}

export function useLongShortRatio(cmcId: string) {
  return useQuery<LongShortRatioData>({
    queryKey: ['long-short-ratio', cmcId],
    queryFn: async () => {
      const response = await fetch(`/api/coinalyze/long-short-ratio?cmcId=${cmcId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch long/short ratio');
      }
      return response.json();
    },
    refetchInterval: 300000, // Refetch every 5 minutes (less frequent since it's historical)
    staleTime: 180000, // Consider data stale after 3 minutes
  });
}