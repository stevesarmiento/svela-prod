'use client'

import { useState, useMemo } from 'react'
import { useWatchlist } from "../app/[locale]/(dashboard)/watchlist/_components/watchlist-context"
// import { useMultiChartData } from './use-multi-chart-data'
import { useQuery } from '@tanstack/react-query'
import type { CoinMarketData } from '@/types/coins'

// Keep existing structure for compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
  image?: string; // Add CoinGecko image URL
}



/**
 * Optimized version of useChartsData that maintains the same interface
 * but uses Convex caching internally for better performance
 */
export function useOptimizedChartsData() {
  const { 
    watchlist, 
    isInitialized,
    selectedGroup,
    selectedGroupCoins
  } = useWatchlist()
  
  const [activeTimeScale, setActiveTimeScale] = useState<string>("1d")
  
  // Use selected group coins if available, otherwise fall back to legacy watchlist
  const currentWatchlist = selectedGroup ? selectedGroupCoins : watchlist
  
  // Removed complex placeholder logic - using simplified approach like watchlist

  // Simplified approach - remove complex caching for now
  // const { series: cachedSeries } = useMultiChartData(placeholderCoinsForFetching, activeTimeScale)

  // Use the same working pattern as useOptimizedWatchlistCoins
  const { data: coins, isLoading: isCoinsLoading, error } = useQuery({
    queryKey: ['charts-market-data', currentWatchlist.join(',')],
    queryFn: async () => {
      if (!currentWatchlist.length) return [];
      
      // Pure CoinGecko API - use string IDs directly
      console.log('🎯 Requesting CoinGecko data for:', currentWatchlist)
      
      const response = await fetch(`/api/coingecko/quotes?ids=${currentWatchlist.join(',')}`)
      if (!response.ok) {
        console.warn('Failed to fetch market data:', response.status)
        return []
      }
      
            const data = await response.json()
      console.log('🔍 CoinGecko API Response:', data)
      
      if (data.data) {
        // Transform CoinGecko response to expected format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return Object.values(data.data).map((coin: any) => ({
          id: coin.id, // CoinGecko string ID
          name: coin.name,
          symbol: coin.symbol,
          image: coin.image, // CoinGecko image URL
          cmc_rank: coin.market_cap_rank || 0,
          quote: {
            USD: {
              price: coin.current_price || 0,
              percent_change_24h: coin.price_change_percentage_24h || 0,
              percent_change_1h: coin.price_change_percentage_1h_in_currency || 0,
              percent_change_7d: coin.price_change_percentage_7d_in_currency || 0,
              percent_change_30d: coin.price_change_percentage_30d_in_currency || 0,
              market_cap: coin.market_cap || 0,
              volume_24h: coin.total_volume || 0,
            }
          }
        }))
      }
      
      return []
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: currentWatchlist.length > 0 && isInitialized,
  })

    // Use the fetched coins directly (simplified approach like watchlist)
  const optimisticCoins = useMemo(() => {
    if (!isInitialized) return [];
    
    // If still loading, show loading coins with complete structure
    if (isCoinsLoading && !coins) {
      return currentWatchlist.map(coinId => ({
        id: coinId,
        name: 'Loading...',
        symbol: 'Loading...',
        image: '',
        cmc_rank: 0,
        quote: { 
          USD: { 
            price: 0, 
            volume_24h: 0, 
            percent_change_24h: 0,
            percent_change_1h: 0,
            percent_change_7d: 0,
            percent_change_30d: 0,
            market_cap: 0
          } 
        },
        isOptimistic: true
      }));
    }
    
         // Return real coin data
     return (coins || []).map(coin => ({
       ...coin,
       isOptimistic: false
     }));
  }, [currentWatchlist, isInitialized, isCoinsLoading, coins]);

  // Debug logging
  console.log('🚀 useOptimizedChartsData - selectedGroup:', selectedGroup?.name, 'coins:', selectedGroupCoins.length)
  console.log('🚀 useOptimizedChartsData - legacy watchlist coins:', watchlist.length)
  console.log('🚀 useOptimizedChartsData - currentWatchlist coins:', currentWatchlist.length)
  console.log('🚀 useOptimizedChartsData - coins.length:', optimisticCoins.length)

  return {
    optimisticCoins,
    activeTimeScale,
    setActiveTimeScale,
    isInitialized,
    hasWatchlistItems: currentWatchlist.length > 0,
    isLoading: !isInitialized || isCoinsLoading,
    selectedGroup, // Also return selected group info for display
    error, // Include error from the query
    performance: { cacheHitRate: 0, apiCalls: 1, totalCoins: currentWatchlist.length } // Simple performance metrics
  }
} 