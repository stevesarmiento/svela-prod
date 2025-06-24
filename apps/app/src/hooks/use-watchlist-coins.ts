"use client";

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCoinQuotes } from "./use-coin-quotes";
import { useMemo } from "react";

export function useWatchlistCoins(coinIds: number[]) {

  const stableCoinIds = useMemo(() => coinIds, [coinIds]);
  
  // Step 1: Get static coin data from Convex
  const staticCoins = useConvexQuery(
    api.coins.getCoinsByIds,
    stableCoinIds.length > 0 ? { coinIds: stableCoinIds } : "skip"
  );

  // Step 2: Get dynamic pricing data from API
  const { data: pricingData, isLoading: isPricingLoading, isRefetching } = useCoinQuotes(stableCoinIds);

  // Debug logging
  console.log('Static coins:', staticCoins);
  console.log('Pricing data:', pricingData);

  // Step 3: Combine static + dynamic data (memoized)
  const combinedData = useMemo(() => {
    if (!staticCoins) return undefined;
    
    return staticCoins.map(coin => {
      const pricing = pricingData?.find(p => p.id === coin.coinId);
      console.log(`Coin ${coin.name}:`, pricing?.quote);
      
      return {
        id: coin.coinId,
        name: coin.name,
        symbol: coin.symbol,
        quote: pricing?.quote || {
          USD: {
            price: 0,
            percent_change_24h: 0,
            market_cap: 0,
            volume_24h: 0
          }
        },
        fundingRate: pricing?.fundingRate || null
      };
    });
  }, [staticCoins, pricingData]);

  return {
    data: combinedData,
    isLoading: staticCoins === undefined || (stableCoinIds.length > 0 && isPricingLoading),
    isRefetching,
    error: null
  };
}