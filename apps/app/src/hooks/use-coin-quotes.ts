"use client";

import { useQuery } from "@tanstack/react-query";
import { CoinMarketData } from "@/types/coins";

interface CoinQuotesResponse {
  data: Record<string, CoinMarketData>;
  status: {
    timestamp: string;
    error_code: number;
    error_message: string | null;
    elapsed: number;
    credit_count: number;
  };
}

export function useCoinQuotes(coinIds: number[]) {
  return useQuery({
    queryKey: ["coin-quotes", coinIds.sort().join(",")],
    queryFn: async (): Promise<CoinMarketData[]> => {
      if (!coinIds.length) return [];

      const response = await fetch(`/api/coinmarketcap/quotes?ids=${coinIds.join(",")}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Invalid response format");
      }

      const data: CoinQuotesResponse = await response.json();
      
      if (data.status.error_code !== 0) {
        throw new Error(data.status.error_message || "API error");
      }

      return Object.values(data.data);
    },
    enabled: coinIds.length > 0,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
  });
}