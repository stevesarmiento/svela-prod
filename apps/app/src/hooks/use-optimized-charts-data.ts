'use client'

import { useState, useMemo } from 'react'
import { useWatchlist } from "../app/[locale]/(dashboard)/watchlist/_components/watchlist-context"
// import { useMultiChartData } from './use-multi-chart-data'
import type { CoinMarketData } from '@/types/coins'
import { useCoinGeckoQuotesBulk } from '@/hooks/use-coingecko-quotes'

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

  const idsForQuotes = useMemo(() => (isInitialized ? currentWatchlist : []), [currentWatchlist, isInitialized])
  const quotesQuery = useCoinGeckoQuotesBulk(idsForQuotes)

  const coins = useMemo(() => {
    const quotesById = quotesQuery.data
    if (!quotesById) return []

    return idsForQuotes.map((coinId) => {
      const coin = quotesById[coinId]
      if (!coin) {
        return {
          id: coinId,
          name: coinId,
          symbol: "N/A",
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
            },
          },
        }
      }

      return {
        id: coin.id, // CoinGecko string ID
        name: coin.name,
        symbol: coin.symbol,
        image: coin.image, // CoinGecko image URL
        cmc_rank: coin.market_cap_rank ?? 0,
        quote: {
          USD: {
            price: coin.current_price ?? 0,
            percent_change_24h: coin.price_change_percentage_24h ?? 0,
            percent_change_1h: coin.price_change_percentage_1h_in_currency ?? 0,
            percent_change_7d: coin.price_change_percentage_7d_in_currency ?? 0,
            percent_change_30d: coin.price_change_percentage_30d_in_currency ?? 0,
            market_cap: coin.market_cap ?? 0,
            volume_24h: coin.total_volume ?? 0,
          },
        },
      }
    })
  }, [idsForQuotes, quotesQuery.data])

    // Use the fetched coins directly (simplified approach like watchlist)
  const optimisticCoins = useMemo(() => {
    if (!isInitialized) return [];
    
    // If still loading, show loading coins with complete structure
    if (quotesQuery.isLoading && !quotesQuery.data) {
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
  }, [coins, currentWatchlist, isInitialized, quotesQuery.data, quotesQuery.isLoading]);

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
    isLoading: !isInitialized || quotesQuery.isLoading,
    selectedGroup, // Also return selected group info for display
    error: quotesQuery.error, // Include error from the query
    performance: { cacheHitRate: 0, apiCalls: 1, totalCoins: currentWatchlist.length } // Simple performance metrics
  }
} 