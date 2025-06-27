import { useQuery } from '@tanstack/react-query';

interface OpenInterestData {
  currentOpenInterest: number | null;
  symbol: string | null;
  lastUpdate: number | null;
}

export function useOpenInterest(cmcId: string) {
  return useQuery<OpenInterestData>({
    queryKey: ['open-interest', cmcId],
    queryFn: async () => {
      const response = await fetch(`/api/coinalyze/open-interest?cmcId=${cmcId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch open interest');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000, // Consider data stale after 30 seconds
  });
}