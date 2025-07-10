'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { CoinMarketData } from '@/types/coins'
import { useRateLimitRecovery } from './use-rate-limit-recovery'

interface CoinMarketCapResponse {
  id: number
  name: string
  symbol: string
  slug: string
  cmc_rank?: number
  circulating_supply?: number
  total_supply?: number
  max_supply?: number | null
  quote?: {
    USD?: {
      price?: number
      volume_24h?: number
      market_cap?: number
      percent_change_24h?: number
      percent_change_1h?: number
      percent_change_7d?: number
      percent_change_30d?: number
      percent_change_60d?: number
      percent_change_90d?: number
    }
  }
}

interface OptimizedWatchlistCoinsResult {
  data: CoinMarketData[] | undefined
  error: Error | null
  isLoading: boolean
  performance: {
    cacheHitRate: number
    apiCalls: number
    totalCoins: number
  }
}

/**
 * Optimized hook for watchlist coins that:
 * 1. Uses Convex database as primary data source
 * 2. Falls back to API only when cache is stale
 * 3. Provides real-time updates through Convex
 * 4. Maintains same interface as useWatchlistCoins
 */
export function useOptimizedWatchlistCoins(coinIds: number[]): OptimizedWatchlistCoinsResult {
  const convex = useConvex()
  const { fetchWithRecovery } = useRateLimitRecovery()

  // Use React Query with Convex integration
  const { data: result, error, isLoading } = useQuery({
    queryKey: ['optimized-watchlist-coins', coinIds.sort().join(',')],
    queryFn: async () => {
      if (!coinIds.length) return { coins: [], performance: { cacheHits: 0, apiCalls: 0, totalCoins: 0 } }

      const startTime = Date.now()
      let cacheHits = 0
      let apiCalls = 0
      const coins: CoinMarketData[] = []
      const staleCoins: number[] = []

      // Check Convex cache for each coin
      const cachePromises = coinIds.map(async (coinId) => {
        try {
          const [cachedData, coinMetadata] = await Promise.all([
            convex.query(api.historicalData.getCurrentMarketData, { coinId }),
            convex.query(api.coins.getMetadataByCoinId, { coinId })
          ])
          
          if (cachedData.data && !cachedData.stale && coinMetadata) {
            // Fresh cached data available with metadata
            cacheHits++
            const coinData: CoinMarketData = {
              id: cachedData.data.coinId,
              name: coinMetadata.name,
              symbol: coinMetadata.symbol,
              slug: coinMetadata.slug,
              cmc_rank: cachedData.data.rank || 0,
              circulating_supply: cachedData.data.circulatingSupply || 0,
              max_supply: cachedData.data.maxSupply || null,
              quote: {
                USD: {
                  price: cachedData.data.price,
                  volume_24h: cachedData.data.volume24h,
                  market_cap: cachedData.data.marketCap,
                  percent_change_24h: cachedData.data.change24h || 0,
                  percent_change_1h: cachedData.data.change1h,
                  percent_change_7d: cachedData.data.change7d,
                  percent_change_30d: cachedData.data.change30d,
                  percent_change_60d: 0,
                  percent_change_90d: 0
                }
              }
            }
            return coinData
          } else {
            // Cache miss, stale data, or missing metadata
            staleCoins.push(coinId)
            return null
          }
        } catch (error) {
          console.warn(`Failed to get cached data for coin ${coinId}:`, error)
          staleCoins.push(coinId)
          return null
        }
      })

      const cachedResults = await Promise.all(cachePromises)
      coins.push(...cachedResults.filter(Boolean) as CoinMarketData[])

      // Fetch missing/stale coins from API
      if (staleCoins.length > 0) {
        try {
          apiCalls++
          const response = await fetchWithRecovery(`/api/coinmarketcap/quotes?ids=${staleCoins.join(',')}`)
          
          if (response.ok) {
            const apiData = await response.json()
            
            if (apiData.data) {
              // Process API response and cache the results
              const apiCoins = Object.values(apiData.data) as CoinMarketCapResponse[]
              
              for (const apiCoin of apiCoins) {
                const coinData: CoinMarketData = {
                  id: apiCoin.id,
                  name: apiCoin.name,
                  symbol: apiCoin.symbol,
                  slug: apiCoin.slug,
                  cmc_rank: apiCoin.cmc_rank || 0,
                  circulating_supply: apiCoin.circulating_supply || 0,
                  max_supply: apiCoin.max_supply ?? null,
                  quote: {
                    USD: {
                      price: apiCoin.quote?.USD?.price || 0,
                      volume_24h: apiCoin.quote?.USD?.volume_24h || 0,
                      market_cap: apiCoin.quote?.USD?.market_cap || 0,
                      percent_change_24h: apiCoin.quote?.USD?.percent_change_24h || 0,
                      percent_change_1h: apiCoin.quote?.USD?.percent_change_1h,
                      percent_change_7d: apiCoin.quote?.USD?.percent_change_7d,
                      percent_change_30d: apiCoin.quote?.USD?.percent_change_30d,
                      percent_change_60d: apiCoin.quote?.USD?.percent_change_60d,
                      percent_change_90d: apiCoin.quote?.USD?.percent_change_90d
                    }
                  }
                }
                
                coins.push(coinData)
                
                // Cache the fresh data in Convex (fire and forget)
                convex.mutation(api.historicalData.upsertCurrentMarketData, {
                  coinId: apiCoin.id,
                  price: apiCoin.quote?.USD?.price || 0,
                  volume24h: apiCoin.quote?.USD?.volume_24h || 0,
                  marketCap: apiCoin.quote?.USD?.market_cap || 0,
                  change1h: apiCoin.quote?.USD?.percent_change_1h,
                  change24h: apiCoin.quote?.USD?.percent_change_24h || 0,
                  change7d: apiCoin.quote?.USD?.percent_change_7d,
                  change30d: apiCoin.quote?.USD?.percent_change_30d,
                  rank: apiCoin.cmc_rank,
                  circulatingSupply: apiCoin.circulating_supply,
                  totalSupply: apiCoin.total_supply || undefined,
                  maxSupply: apiCoin.max_supply || undefined,
                  dataSource: 'coinmarketcap'
                }).catch(error => {
                  console.warn(`Failed to cache coin ${apiCoin.id}:`, error)
                })
              }
            }
          } else {
            console.warn('API request failed:', response.status)
            
            // Return stale cached data if API fails
            for (const coinId of staleCoins) {
              try {
                const [staleData, coinMetadata] = await Promise.all([
                  convex.query(api.historicalData.getCurrentMarketData, { coinId }),
                  convex.query(api.coins.getMetadataByCoinId, { coinId })
                ])
                if (staleData.data) {
                  const coinData: CoinMarketData = {
                    id: staleData.data.coinId,
                    name: coinMetadata?.name || `Coin ${coinId}`,
                    symbol: coinMetadata?.symbol || `C${coinId}`,
                    slug: coinMetadata?.slug || `coin-${coinId}`,
                    cmc_rank: staleData.data.rank || 0,
                    circulating_supply: staleData.data.circulatingSupply || 0,
                    max_supply: staleData.data.maxSupply || null,
                    quote: {
                      USD: {
                        price: staleData.data.price,
                        volume_24h: staleData.data.volume24h,
                        market_cap: staleData.data.marketCap,
                        percent_change_24h: staleData.data.change24h || 0,
                        percent_change_1h: staleData.data.change1h,
                        percent_change_7d: staleData.data.change7d,
                        percent_change_30d: staleData.data.change30d,
                        percent_change_60d: 0,
                        percent_change_90d: 0
                      }
                    }
                  }
                  coins.push(coinData)
                }
              } catch (error) {
                console.warn(`Failed to get stale data for coin ${coinId}:`, error)
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch from API:', error)
          
          // Try to return any available stale data
          for (const coinId of staleCoins) {
            try {
              const [staleData, coinMetadata] = await Promise.all([
                convex.query(api.historicalData.getCurrentMarketData, { coinId }),
                convex.query(api.coins.getMetadataByCoinId, { coinId })
              ])
              if (staleData.data) {
                const coinData: CoinMarketData = {
                  id: staleData.data.coinId,
                  name: coinMetadata?.name || `Coin ${coinId}`,
                  symbol: coinMetadata?.symbol || `C${coinId}`,
                  slug: coinMetadata?.slug || `coin-${coinId}`,
                  cmc_rank: staleData.data.rank || 0,
                  circulating_supply: staleData.data.circulatingSupply || 0,
                  max_supply: staleData.data.maxSupply || null,
                  quote: {
                    USD: {
                      price: staleData.data.price,
                      volume_24h: staleData.data.volume24h,
                      market_cap: staleData.data.marketCap,
                      percent_change_24h: staleData.data.change24h || 0,
                      percent_change_1h: staleData.data.change1h,
                      percent_change_7d: staleData.data.change7d,
                      percent_change_30d: staleData.data.change30d,
                      percent_change_60d: 0,
                      percent_change_90d: 0
                    }
                  }
                }
                coins.push(coinData)
              }
            } catch (error) {
              console.warn(`Failed to get stale data for coin ${coinId}:`, error)
            }
          }
        }
      }

      const endTime = Date.now()
      console.log(`🚀 Optimized watchlist fetch completed in ${endTime - startTime}ms:`, {
        totalCoins: coinIds.length,
        cacheHits,
        apiCalls,
        cacheHitRate: coinIds.length > 0 ? (cacheHits / coinIds.length) * 100 : 0
      })

      return {
        coins: coins.sort((a, b) => coinIds.indexOf(a.id) - coinIds.indexOf(b.id)), // Maintain order
        performance: {
          cacheHits,
          apiCalls,
          totalCoins: coinIds.length
        }
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: coinIds.length > 0,
  })

  const performance = useMemo(() => {
    if (!result) return { cacheHitRate: 0, apiCalls: 0, totalCoins: 0 }
    
    return {
      cacheHitRate: result.performance.totalCoins > 0 
        ? (result.performance.cacheHits / result.performance.totalCoins) * 100 
        : 0,
      apiCalls: result.performance.apiCalls,
      totalCoins: result.performance.totalCoins
    }
  }, [result])

  return {
    data: result?.coins,
    error: error as Error | null,
    isLoading,
    performance
  }
} 