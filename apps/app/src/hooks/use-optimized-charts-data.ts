'use client'

import { useState, useMemo } from 'react'
import { useWatchlist } from "../app/[locale]/(dashboard)/watchlist/_components/watchlist-context"
import { useMultiChartData } from './use-multi-chart-data'
import { useQuery } from '@tanstack/react-query'
import type { CoinMarketData } from '@/types/coins'

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
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
  
  // Create non-optimistic placeholder coins for useMultiChartData (it filters out optimistic ones)
  const placeholderCoinsForFetching = useMemo(() => {
    if (!isInitialized) return [];
    
    return currentWatchlist.map(coinId => ({
      id: coinId,
      name: "Loading...",
      symbol: "...",
      slug: "",
      cmc_rank: 0,
      circulating_supply: 0,
      max_supply: 0,
      quote: {
        USD: {
          price: 0,
          percent_change_24h: 0,
          percent_change_1h: 0,
          percent_change_7d: 0,
          percent_change_30d: 0,
          percent_change_60d: 0,
          percent_change_90d: 0,
          market_cap: 0,
          volume_24h: 0,
          volume_change_24h: 0,
          market_cap_dominance: 0,
          fully_diluted_market_cap: 0
        }
      },
      isOptimistic: false, // DON'T mark as optimistic so useMultiChartData processes them
      historical: {
        status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
        data: { id: coinId, name: "Loading...", symbol: "...", is_active: 1, is_fiat: 0, quotes: [] }
      },
      ohlcv: {
        status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
        data: { quotes: [] }
      }
    } as unknown as OptimisticCoinMarketData));
  }, [currentWatchlist, isInitialized]);

  // Use our optimized multi-chart data hook for caching
  const { 
    series: cachedSeries, 
    isLoading: chartDataLoading, 
    performance 
  } = useMultiChartData(placeholderCoinsForFetching, activeTimeScale)

  // Fetch current market data (quotes) for legend and table data
  const { data: currentMarketData } = useQuery({
    queryKey: ['current-market-data', currentWatchlist.join(',')],
    queryFn: async () => {
      if (!currentWatchlist.length) return {};
      
      const response = await fetch(`/api/coinmarketcap/quotes?ids=${currentWatchlist.join(',')}`)
      if (!response.ok) {
        console.warn('Failed to fetch current market data:', response.status)
        return {}
      }
      
      const data = await response.json()
      return data.data || {}
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: currentWatchlist.length > 0 && isInitialized,
  })

    // Merge optimistic coins with real data when available
  const optimisticCoins = useMemo(() => {
    if (!isInitialized) return [];
    
    // Create a map of cached series data by coin ID
    const seriesMap = new Map(cachedSeries.map(series => [series.id, series]))
    
    const coins = currentWatchlist.map(coinId => {
      const coinIdStr = coinId.toString()
      const cachedData = seriesMap.get(coinIdStr)
      const marketData = currentMarketData?.[coinId] // Current market data from quotes API
      
      // If we have market data (current prices), create a complete coin object
      if (marketData) {
        return {
          ...marketData, // Use all the real market data (name, symbol, price, etc.)
          isOptimistic: false, // Mark as real data
          historical: cachedData ? {
            status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
            data: { 
              id: coinId, 
              name: cachedData.name, 
              symbol: cachedData.symbol, 
              is_active: 1, 
              is_fiat: 0, 
              quotes: cachedData.data.map(point => ({
                timestamp: new Date((point.time as number) * 1000).toISOString(),
                quote: {
                  USD: {
                    price: point.value, // This is percentage change, but we'll use it
                    volume_24h: 0
                  }
                }
              }))
            }
          } : {
            status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
            data: { id: coinId, name: marketData.name || "Unknown", symbol: marketData.symbol || "UNK", is_active: 1, is_fiat: 0, quotes: [] }
          },
          ohlcv: {
            status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
            data: { quotes: [] }
          }
        } as unknown as OptimisticCoinMarketData;
      }
      
      // If we have cached data but no market data, use cached data with placeholder prices
      if (cachedData && cachedData.hasData) {
        return {
          id: coinId,
          name: cachedData.name,
          symbol: cachedData.symbol,
          slug: cachedData.symbol.toLowerCase(),
          cmc_rank: 0,
          circulating_supply: 0,
          max_supply: 0,
          quote: {
            USD: {
              price: 0, // No current price data yet
              percent_change_24h: cachedData.latestValue || (cachedData.data.length > 0 ? cachedData.data[cachedData.data.length - 1]?.value || 1 : 1),
              percent_change_1h: 0,
              percent_change_7d: 0,
              percent_change_30d: 0,
              percent_change_60d: 0,
              percent_change_90d: 0,
              market_cap: 0,
              volume_24h: 0,
              volume_change_24h: 0,
              market_cap_dominance: 0,
              fully_diluted_market_cap: 0
            }
          },
          isOptimistic: false, // Mark as real data (at least we have names/symbols)
          historical: {
            status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
            data: { 
              id: coinId, 
              name: cachedData.name, 
              symbol: cachedData.symbol, 
              is_active: 1, 
              is_fiat: 0, 
              quotes: cachedData.data.map(point => ({
                timestamp: new Date((point.time as number) * 1000).toISOString(),
                quote: {
                  USD: {
                    price: point.value,
                    volume_24h: 0
                  }
                }
              }))
            }
          },
          ohlcv: {
            status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
            data: { quotes: [] }
          }
        } as unknown as OptimisticCoinMarketData;
      }
      
      // Otherwise return optimistic coin (still loading)
      return {
        id: coinId,
        name: "Loading...",
        symbol: "...",
        slug: "",
        cmc_rank: 0,
        circulating_supply: 0,
        max_supply: 0,
        quote: {
          USD: {
            price: 0,
            percent_change_24h: 0,
            percent_change_1h: 0,
            percent_change_7d: 0,
            percent_change_30d: 0,
            percent_change_60d: 0,
            percent_change_90d: 0,
            market_cap: 0,
            volume_24h: 0,
            volume_change_24h: 0,
            market_cap_dominance: 0,
            fully_diluted_market_cap: 0
          }
        },
        isOptimistic: true, // Still loading
        historical: {
          status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
          data: { id: coinId, name: "Loading...", symbol: "...", is_active: 1, is_fiat: 0, quotes: [] }
        },
        ohlcv: {
          status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
          data: { quotes: [] }
        }
      } as unknown as OptimisticCoinMarketData;
    });

    // Sort: real coins first, then optimistic ones
    return coins.sort((a, b) => {
      if (a.isOptimistic && b.isOptimistic) return 0;
      if (a.isOptimistic) return 1;
      if (b.isOptimistic) return -1;
      return (a.cmc_rank || 999999) - (b.cmc_rank || 999999);
    });
  }, [currentWatchlist, isInitialized, cachedSeries, currentMarketData]);

  // Debug logging (same as original)
  console.log('🚀 useOptimizedChartsData - selectedGroup:', selectedGroup?.name, 'coins:', selectedGroupCoins.length)
  console.log('🚀 useOptimizedChartsData - legacy watchlist coins:', watchlist.length)
  console.log('🚀 useOptimizedChartsData - currentWatchlist coins:', currentWatchlist.length)
  console.log('🚀 useOptimizedChartsData - performance:', performance)
  console.log('🚀 useOptimizedChartsData - cachedSeries.length:', cachedSeries.length)

  return {
    optimisticCoins,
    activeTimeScale,
    setActiveTimeScale,
    isInitialized,
    hasWatchlistItems: currentWatchlist.length > 0,
    isLoading: !isInitialized || chartDataLoading,
    selectedGroup, // Also return selected group info for display
    performance // Add performance metrics for monitoring
  }
} 