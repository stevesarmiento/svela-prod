"use client";

import { useQuery } from "@tanstack/react-query";
import { searchCoins, getTopCoins } from "@/lib/coinmarketcap";
import type { CoinMarketData } from "@/types/coins";

export function useCoinSearch(query: string) {
  return useQuery({
    queryKey: ["coin-search", query.trim().toLowerCase()],
    queryFn: async (): Promise<CoinMarketData[]> => {
      if (!query.trim()) return [];
      
      const results = await searchCoins(query);
      return results.map(coin => ({
        ...coin,
        circulating_supply: 0,
        max_supply: 0,
      }));
    },
    enabled: query.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error?.message?.includes('rate limit')) return false;
      return failureCount < 2;
    },
  });
}

export function useTopCoins() {
  return useQuery({
    queryKey: ["top-coins"],
    queryFn: async (): Promise<CoinMarketData[]> => {
      const coins = await getTopCoins();
      return coins.map(coin => ({
        ...coin,
        circulating_supply: 0,
        max_supply: 0,
      }));
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}