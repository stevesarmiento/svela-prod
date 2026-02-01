"use client";

import { useQuery } from "@tanstack/react-query";
import { useCoinGeckoQuotes } from "./use-coingecko-quotes";
import { CoinsInternalApi, type CoinSummary } from "@/lib/effect/coins-internal-api";
import { runPromise } from "@/lib/effect/runtime-coins-internal";

export function useCoinSearch(query: string) {
  const { data: allCoins, isLoading: isCoinsLoading } = useQuery({
    queryKey: ["coins", "search", query.trim()],
    queryFn: async (): Promise<ReadonlyArray<CoinSummary>> => {
      return await runPromise(
        CoinsInternalApi.search({
          query,
          limit: 100,
        }),
      );
    },
    enabled: !!query.trim(),
    staleTime: 10 * 60 * 1000,
  });

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
    isLoading: isCoinsLoading || (coingeckoIds.length > 0 && isPricingLoading),
    error: null
  };
}

export function useTopCoins() {
  const { data: topCoinsStatic, isLoading: isTopCoinsLoading } = useQuery({
    queryKey: ["coins", "top", 25],
    queryFn: async (): Promise<ReadonlyArray<CoinSummary>> => {
      return await runPromise(CoinsInternalApi.top({ limit: 25 }));
    },
    staleTime: 10 * 60 * 1000,
  });
  
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
    isLoading: isTopCoinsLoading || (coingeckoIds.length > 0 && isPricingLoading),
    error: null
  };
}