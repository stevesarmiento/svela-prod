import { useQuery } from '@tanstack/react-query';

interface FundingRateHistoryItem {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
}

interface CombinedFundingRateData {
  actualFundingRate: number | null;
  predictedFundingRate: number | null;
  symbol: string | null;
  lastUpdate: number | null;
  combinedHistorical: Array<{
    time: string;
    timestamp: number;
    actualRate: number;
    predictedRate: number;
    actualRateRaw: number;
    predictedRateRaw: number;
  }>;
}

export function useFundingRate(cmcId: string) {
  return useQuery<CombinedFundingRateData>({
    queryKey: ['combined-funding-rate', cmcId],
    queryFn: async () => {
      // Fetch both actual and predicted data in parallel
      const [actualResponse, predictedResponse] = await Promise.all([
        fetch(`/api/coinalyze/fundingrate?cmcId=${cmcId}`),
        fetch(`/api/coinalyze/predicted-funding-rate?cmcId=${cmcId}`)
      ]);

      if (!actualResponse.ok || !predictedResponse.ok) {
        throw new Error('Failed to fetch funding rate data');
      }

      const actualData = await actualResponse.json();
      const predictedData = await predictedResponse.json();

      // Combine the historical data by timestamp
      const combinedHistorical: Array<{
        time: string;
        timestamp: number;
        actualRate: number;
        predictedRate: number;
        actualRateRaw: number;
        predictedRateRaw: number;
      }> = [];
      const actualHistory = actualData.historical || [];
      const predictedHistory = predictedData.historical || [];

      // Create a map of predicted data by timestamp for easy lookup
      const predictedMap = new Map();
      predictedHistory.forEach((item: FundingRateHistoryItem) => {
        predictedMap.set(item.t, item);
      });

      // Combine data based on actual data timestamps
      actualHistory.forEach((actualItem: FundingRateHistoryItem) => {
        const predictedItem = predictedMap.get(actualItem.t);
        const date = new Date(actualItem.t * 1000);
        const timeLabel = date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });

        combinedHistorical.push({
          time: timeLabel,
          timestamp: actualItem.t,
          actualRate: actualItem.c * 100, // Convert to percentage
          predictedRate: predictedItem ? predictedItem.c * 100 : actualItem.c * 100, // Fallback to actual if no prediction
          actualRateRaw: actualItem.c,
          predictedRateRaw: predictedItem ? predictedItem.c : actualItem.c,
        });
      });

      return {
        actualFundingRate: actualData.currentFundingRate,
        predictedFundingRate: predictedData.currentPredictedFundingRate,
        symbol: actualData.symbol || predictedData.symbol,
        lastUpdate: actualData.lastUpdate || predictedData.lastUpdate,
        combinedHistorical,
      };
    },
    refetchInterval: 300000, // Refetch every 5 minutes
    staleTime: 180000, // Consider data stale after 3 minutes
  });
}