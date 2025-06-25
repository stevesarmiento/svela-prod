"use client";

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCoinQuotes } from "./use-coin-quotes";

export function useCoinSearch(query: string) {
  // Step 1: Get ALL coins from Convex (we'll filter in memory)
  const allCoins = useConvexQuery(
    api.coins.searchCoins, 
    query.trim() ? { query: query.trim(), limit: 100 } : "skip" // Increase limit for better results
  );

  // Step 2: Get pricing data for matched coins
  const coinIds = allCoins?.map(coin => coin.coinId) || [];
  const { data: pricingData, isLoading: isPricingLoading } = useCoinQuotes(coinIds);

  // Step 3: Combine static + dynamic data
  const combinedData = allCoins?.map(coin => {
    const pricing = pricingData?.find(p => p.id === coin.coinId);
    return {
      id: coin.coinId,
      name: coin.name,
      symbol: coin.symbol,
      cmc_rank: coin.rank,
      quote: pricing?.quote || {
        USD: {
          price: 0,
          percent_change_24h: 0,
          market_cap: 0,
          volume_24h: 0
        }
      }
    };
  });

  return {
    data: combinedData,
    isLoading: allCoins === undefined || (coinIds.length > 0 && isPricingLoading),
    error: null
  };
}

export function useTopCoins() {
  // Get top 25 coins from Convex, then fetch their pricing
  const topCoinsStatic = useConvexQuery(api.coins.getTopCoins, { limit: 25 });
  
  const coinIds = topCoinsStatic?.map(coin => coin.coinId) || [];
  const { data: pricingData, isLoading: isPricingLoading } = useCoinQuotes(coinIds);

  const combinedData = topCoinsStatic?.map(coin => {
    const pricing = pricingData?.find(p => p.id === coin.coinId);
    return {
      id: coin.coinId,
      name: coin.name,
      symbol: coin.symbol,
      cmc_rank: coin.rank,
      quote: pricing?.quote || {
        USD: {
          price: 0,
          percent_change_24h: 0,
          market_cap: 0,
          volume_24h: 0
        }
      }
    };
  });

  return {
    data: combinedData,
    isLoading: topCoinsStatic === undefined || (coinIds.length > 0 && isPricingLoading),
    error: null
  };
}