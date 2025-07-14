"use client";

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCoinGeckoQuotes } from "./use-coingecko-quotes";

export function useCoinSearch(query: string) {
  // Step 1: Get ALL CoinGecko coins from Convex (we'll filter in memory)
  const allCoins = useConvexQuery(
    api.coins.searchCoinGeckoCoins, 
    query.trim() ? { query: query.trim(), limit: 100 } : "skip" // Increase limit for better results
  );

  // Step 2: Get pricing data for matched coins using CoinGecko IDs
  const coingeckoIds = allCoins?.map(coin => coin.coingeckoId) || [];
  const { data: pricingData, isLoading: isPricingLoading } = useCoinGeckoQuotes(coingeckoIds);

  // Step 3: Combine static + dynamic data
  const combinedData = allCoins?.map(coin => {
    const pricing = pricingData?.find(p => p.id === coin.coingeckoId);
    return {
      id: coin.coingeckoId, // Use CoinGecko ID as the primary ID
      name: coin.name,
      symbol: coin.symbol,
      cmc_rank: pricing?.cmc_rank || 0, // Use market cap rank from pricing data
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
    isLoading: allCoins === undefined || (coingeckoIds.length > 0 && isPricingLoading),
    error: null
  };
}

export function useTopCoins() {
  // Get top 25 CoinGecko coins from Convex, then fetch their pricing
  const topCoinsStatic = useConvexQuery(api.coins.getTopCoinGeckoCoins, { limit: 25 });
  
  const coingeckoIds = topCoinsStatic?.map(coin => coin.coingeckoId) || [];
  const { data: pricingData, isLoading: isPricingLoading } = useCoinGeckoQuotes(coingeckoIds);

  const combinedData = topCoinsStatic?.map(coin => {
    const pricing = pricingData?.find(p => p.id === coin.coingeckoId);
    return {
      id: coin.coingeckoId, // Use CoinGecko ID as the primary ID
      name: coin.name,
      symbol: coin.symbol,
      cmc_rank: pricing?.cmc_rank || 0, // Use market cap rank from pricing data
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
    isLoading: topCoinsStatic === undefined || (coingeckoIds.length > 0 && isPricingLoading),
    error: null
  };
}