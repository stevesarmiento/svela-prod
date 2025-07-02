import { useQuery } from '@tanstack/react-query';

interface LiquidationsData {
  longLiquidations: number | null;
  shortLiquidations: number | null;
  totalLiquidations: number | null;
  symbol: string | null;
  lastUpdate: number | null;
  historical: Array<{
    t: number; // timestamp
    l: number; // long liquidations
    s: number; // short liquidations
  }>;
}

export function useLiquidations(cmcId: string) {
  return useQuery<LiquidationsData>({
    queryKey: ['liquidations', cmcId],
    queryFn: async () => {
      const response = await fetch(`/api/coinalyze/liquidations?cmcId=${cmcId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch liquidations');
      }
      return response.json();
    },
    refetchInterval: 300000, // Refetch every 5 minutes
    staleTime: 180000, // Consider data stale after 3 minutes
  });
}