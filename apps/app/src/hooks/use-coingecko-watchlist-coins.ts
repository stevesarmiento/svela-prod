'use client'

import { useQuery } from '@tanstack/react-query'

interface CoinGeckoWatchlistCoin {
  id: string; // CoinGecko string ID
  name: string;
  symbol: string;
  slug: string;
  image: string; // CoinGecko image URL
  cmc_rank: number;
  circulating_supply: number;
  max_supply: number | null;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
      market_cap: number;
      percent_change_24h: number;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
    };
  };
}

/**
 * Pure CoinGecko hook for watchlist coins - replaces useOptimizedWatchlistCoins
 */
export function useCoinGeckoWatchlistCoins(coinIds: string[]) {
  const { data: coins, isLoading, error } = useQuery({
    queryKey: ['coingecko-watchlist-coins', coinIds.join(',')],
    queryFn: async (): Promise<CoinGeckoWatchlistCoin[]> => {
      if (!coinIds.length) {
        console.log('🚫 CoinGecko watchlist hook: No coin IDs provided')
        return [];
      }
      
      console.log('🎯 Fetching CoinGecko watchlist data:', coinIds);
      const response = await fetch(`/api/coingecko/quotes?ids=${coinIds.join(',')}`);
      if (!response.ok) {
        console.warn('❌ Failed to fetch CoinGecko watchlist data:', response.status);
        return [];
      }
      
      const data = await response.json();
      console.log('🔍 CoinGecko Watchlist API Response:', data);
      
             if (data.data) {
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const transformedCoins = Object.values(data.data).map((coin: any) => ({
          id: coin.id, // CoinGecko string ID
          name: coin.name,
          symbol: coin.symbol,
          slug: coin.id, // Use CoinGecko ID as slug
          image: coin.image || '', // CoinGecko image URL
          cmc_rank: coin.market_cap_rank || 0,
          circulating_supply: 0, // CoinGecko quotes don't include this
          max_supply: null,
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
        }));
        
        console.log('✅ CoinGecko transformed coins:', transformedCoins.length, 'coins');
        return transformedCoins;
      }
      
      console.warn('⚠️ CoinGecko API returned no data for:', coinIds);
      return [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: coinIds.length > 0,
  });

  return {
    data: coins,
    isLoading,
    error: error as Error | null,
    performance: { cacheHitRate: 0, apiCalls: 1, totalCoins: coinIds.length }
  };
} 