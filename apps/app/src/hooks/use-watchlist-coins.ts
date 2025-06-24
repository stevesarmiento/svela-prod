"use client";

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCoinQuotes } from "./use-coin-quotes";
import { useDebounce } from "./use-debounce";
import { useMemo, useState, useEffect, useRef } from "react";

// Add this interface at the top
interface OptimisticCoin {
  id: number;
  name: string;
  symbol: string;
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      market_cap: number;
      volume_24h: number;
    };
  };
  fundingRate: number | null;
  isOptimistic: boolean;
}

export function useWatchlistCoins(coinIds: number[]) {
  const stableCoinIds = useMemo(() => coinIds, [coinIds]);
  // Debounce API calls to prevent rate limiting
  const debouncedCoinIds = useDebounce(stableCoinIds, 500);
  const [optimisticCoins, setOptimisticCoins] = useState<Map<number, OptimisticCoin>>(new Map());
  const prevCoinIdsRef = useRef<number[]>([]);
  
  // Detect newly added coins
  const newlyAddedCoins = useMemo(() => {
    const prev = new Set(prevCoinIdsRef.current);
    return stableCoinIds.filter(id => !prev.has(id));
  }, [stableCoinIds]);

  // Update ref
  useEffect(() => {
    prevCoinIdsRef.current = stableCoinIds;
  }, [stableCoinIds]);

  // Add optimistic entries for newly added coins
  useEffect(() => {
    if (newlyAddedCoins.length > 0) {
      setOptimisticCoins(prev => {
        const newMap = new Map(prev);
        newlyAddedCoins.forEach(coinId => {
          if (!newMap.has(coinId)) {
            newMap.set(coinId, {
              id: coinId,
              name: "Loading...",
              symbol: "...",
              quote: {
                USD: {
                  price: 0,
                  percent_change_24h: 0,
                  market_cap: 0,
                  volume_24h: 0
                }
              },
              fundingRate: null,
              isOptimistic: true
            });
          }
        });
        return newMap;
      });
    }
  }, [newlyAddedCoins]);

  // Use debounced IDs for API calls
  const staticCoins = useConvexQuery(
    api.coins.getCoinsByIds,
    debouncedCoinIds.length > 0 ? { coinIds: debouncedCoinIds } : "skip"
  );

  const { data: pricingData, isRefetching } = useCoinQuotes(debouncedCoinIds);

  // Update optimistic coins with real data as it becomes available
  useEffect(() => {
    if (staticCoins && pricingData) {
      setOptimisticCoins(prev => {
        const newMap = new Map(prev);
        
        staticCoins.forEach(coin => {
          const pricing = pricingData.find(p => p.id === coin.coinId);
          const realData = {
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
            fundingRate: pricing?.fundingRate || null,
            isOptimistic: false
          };
          newMap.set(coin.coinId, realData);
        });
        
        return newMap;
      });
    }
  }, [staticCoins, pricingData]);

  // Clean up optimistic coins that are no longer in watchlist
  useEffect(() => {
    setOptimisticCoins(prev => {
      const newMap = new Map();
      const currentIds = new Set(stableCoinIds);
      
      prev.forEach((coin, id) => {
        if (currentIds.has(id)) {
          newMap.set(id, coin);
        }
      });
      
      return newMap;
    });
  }, [stableCoinIds]);

  // Combine all data
  const combinedData = useMemo(() => {
    if (stableCoinIds.length === 0) {
      return [];
    }
    
    // Return coins in the order they appear in watchlist
    return stableCoinIds.map(coinId => {
      const coin = optimisticCoins.get(coinId);
      return coin || {
        id: coinId,
        name: "Loading...",
        symbol: "...",
        quote: {
          USD: {
            price: 0,
            percent_change_24h: 0,
            market_cap: 0,
            volume_24h: 0
          }
        },
        fundingRate: null,
        isOptimistic: true
      };
    });
  }, [stableCoinIds, optimisticCoins]);

  // Loading logic - only show loading for initial load, not for individual updates
  const isLoading = useMemo(() => {
    if (stableCoinIds.length === 0) {
      return false;
    }
    
    // If we have no data at all, we're loading
    if (optimisticCoins.size === 0) {
      return true;
    }
    
    return false;
  }, [stableCoinIds.length, optimisticCoins.size]);

  return {
    data: combinedData,
    isLoading,
    isRefetching,
    error: null
  };
}