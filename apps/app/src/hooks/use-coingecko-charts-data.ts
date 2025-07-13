'use client'

import { useState, useMemo } from 'react'
import { useWatchlist } from "../app/[locale]/(dashboard)/watchlist/_components/watchlist-context"
import { useQuery } from '@tanstack/react-query'
import type { HybridCoinSearchResult } from './use-hybrid-coin-search'

// Pure CoinGecko data structure
interface OptimisticCoinData extends HybridCoinSearchResult {
  isOptimistic?: boolean;
}

/**
 * Pure CoinGecko charts data hook - no CoinMarketCap dependencies
 */
export function useCoingeckoChartsData() {
  const { 
    isInitialized,
    selectedGroup,
    selectedGroupCoins
  } = useWatchlist()
  
  const [activeTimeScale, setActiveTimeScale] = useState<string>("1d")
  
  // Use selected group coins (CoinGecko string IDs)
  const currentWatchlist = selectedGroupCoins
  
  // Fetch CoinGecko market data
  const { data: coinGeckoData, isLoading } = useQuery({
    queryKey: ['coingecko-charts-data', currentWatchlist.join(',')],
    queryFn: async () => {
      if (!currentWatchlist.length) return {}
      
      const response = await fetch(`/api/coingecko/quotes?ids=${currentWatchlist.join(',')}`)
      if (!response.ok) {
        console.warn('Failed to fetch CoinGecko data:', response.status)
        return {}
      }
      
      const data = await response.json()
      return data.data || {}
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: currentWatchlist.length > 0 && isInitialized,
  })

  // Create optimistic coins array
  const optimisticCoins = useMemo((): OptimisticCoinData[] => {
    if (!isInitialized) return [];
    
    const coins = currentWatchlist.map(coinId => {
      const apiData = coinGeckoData?.[coinId]
      
      // If we have real data, use it
      if (apiData) {
        return {
          id: coinId,
          name: apiData.name,
          symbol: apiData.symbol,
          image: apiData.image,
          cmc_rank: apiData.market_cap_rank || 0,
          quote: {
            USD: {
              price: apiData.current_price || 0,
              percent_change_24h: apiData.price_change_percentage_24h || 0,
              percent_change_1h: apiData.price_change_percentage_1h_in_currency || 0,
              percent_change_7d: apiData.price_change_percentage_7d_in_currency || 0,
              percent_change_30d: apiData.price_change_percentage_30d_in_currency || 0,
              market_cap: apiData.market_cap || 0,
              volume_24h: apiData.total_volume || 0,
            }
          },
          isOptimistic: false
        } as OptimisticCoinData;
      }
      
      // Otherwise return optimistic coin (still loading)
      return {
        id: coinId,
        name: "Loading...",
        symbol: "...",
        image: "",
        cmc_rank: 0,
        quote: {
          USD: {
            price: 0,
            percent_change_24h: 0,
            percent_change_1h: 0,
            percent_change_7d: 0,
            percent_change_30d: 0,
            market_cap: 0,
            volume_24h: 0,
          }
        },
        isOptimistic: true
      } as OptimisticCoinData;
    });

    // Sort: real coins first, then optimistic ones
    return coins.sort((a, b) => {
      if (a.isOptimistic && b.isOptimistic) return 0;
      if (a.isOptimistic) return 1;
      if (b.isOptimistic) return -1;
      return (a.cmc_rank || 999999) - (b.cmc_rank || 999999);
    });
  }, [currentWatchlist, isInitialized, coinGeckoData]);

  console.log('🚀 useCoingeckoChartsData - selectedGroup:', selectedGroup?.name, 'coins:', selectedGroupCoins.length)
  console.log('🚀 useCoingeckoChartsData - optimisticCoins:', optimisticCoins.length)

  return {
    optimisticCoins,
    activeTimeScale,
    setActiveTimeScale,
    isInitialized,
    hasWatchlistItems: currentWatchlist.length > 0,
    isLoading: !isInitialized || isLoading,
    selectedGroup,
  }
} 