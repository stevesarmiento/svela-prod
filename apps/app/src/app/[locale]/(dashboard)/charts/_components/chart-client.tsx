'use client'

import { Suspense, useCallback, useEffect, useState, useMemo } from 'react'
import { MultiPriceChartLightweight } from "./multi-line-lightweight"
import { ChartTable } from "./chart-table"
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import type { 
  CoinMarketData 
} from '@/types/coins'
import { toast } from "@v1/ui/use-toast"
import { Spinner } from "@v1/ui/spinner"

// Extended interface with optimistic state
interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

function ChartsContent() {
  const { watchlist, isInitialized } = useWatchlist()
  const [coinsData, setCoinsData] = useState<Map<number, OptimisticCoinMarketData>>(new Map())
  const [activeTimeScale, setActiveTimeScale] = useState<string>("max")

  // Create optimistic coins when watchlist changes
  const optimisticCoins = useMemo(() => {
    if (!isInitialized) return [];
    
    const coins = watchlist.map(coinId => {
      const existingCoin = coinsData.get(coinId);
      
      // If we have real data, use it
      if (existingCoin && !existingCoin.isOptimistic) {
        return existingCoin;
      }
      
      // Otherwise, return optimistic placeholder
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
            market_cap: 0,
            volume_24h: 0,
            volume_change_24h: 0,
            market_cap_dominance: 0,
            fully_diluted_market_cap: 0
          }
        },
        isOptimistic: true,
        // Add empty historical data structure
        historical: {
          status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
          data: {
            id: coinId,
            name: "Loading...",
            symbol: "...",
            is_active: 1,
            is_fiat: 0,
            quotes: []
          }
        },
        ohlcv: {
          status: { error_code: 0, error_message: "", timestamp: "", elapsed: 0, credit_count: 0, notice: "" },
          data: {
            quotes: []
          }
        }
      } as unknown as OptimisticCoinMarketData;
    });

    // Sort coins: real coins by rank, optimistic coins at the end
    return coins.sort((a, b) => {
      // If both are optimistic, maintain watchlist order
      if (a.isOptimistic && b.isOptimistic) return 0;
      
      // Optimistic coins go to the end
      if (a.isOptimistic) return 1;
      if (b.isOptimistic) return -1;
      
      // Sort real coins by rank
      return (a.cmc_rank || 999999) - (b.cmc_rank || 999999);
    });
  }, [watchlist, coinsData, isInitialized]);

  const fetchCoinData = useCallback(async (coinIds: number[]) => {
    if (!coinIds.length) return;
  
    try {
      const [quotesResponse, historicalResponse] = await Promise.all([
        fetch(`/api/coinmarketcap/quotes?ids=${coinIds.join(',')}`, {
          cache: 'no-store'
        }),
        fetch(`/api/coinmarketcap/historical?ids=${coinIds.join(',')}`, {
          cache: 'no-store'
        })
      ])
    
      if (!quotesResponse.ok || !historicalResponse.ok) {
        throw new Error(`API error: ${quotesResponse.status} ${historicalResponse.status}`)
      }
    
      const [quotesData, historicalData] = await Promise.all([
        quotesResponse.json(),
        historicalResponse.json()
      ])
    
      if (quotesData.data) {
        const coinsArray = Object.values(quotesData.data) as CoinMarketData[]
        
        // Update coins data with real data
        setCoinsData(prev => {
          const newMap = new Map(prev);
          
          coinsArray.forEach(coin => {
            const historical = historicalData.data[coin.id] || historicalData.data[coin.id.toString()]
            const realCoin: OptimisticCoinMarketData = {
              ...coin,
              historical,
              isOptimistic: false
            };
            newMap.set(coin.id, realCoin);
          });
          
          return newMap;
        });
      }
    } catch (error) {
      console.error('Error fetching coin data:', error)
      toast({
        title: "Error",
        description: "Failed to fetch coin data",
        variant: "destructive",
      })
    }
  }, [])

  // Fetch data when watchlist changes or time scale changes
  useEffect(() => {
    if (!isInitialized || !watchlist.length) {
      return;
    }

    const coinsToFetch = watchlist;
    
    if (coinsToFetch.length > 0) {
      fetchCoinData(coinsToFetch);
    }
  }, [watchlist, isInitialized, fetchCoinData, activeTimeScale])

  // Clean up removed coins
  useEffect(() => {
    if (!isInitialized) return;
    
    setCoinsData(prev => {
      const newMap = new Map();
      const currentIds = new Set(watchlist);
      
      prev.forEach((coin, id) => {
        if (currentIds.has(id)) {
          newMap.set(id, coin);
        }
      });
      
      return newMap;
    });
  }, [watchlist, isInitialized]);

  // Show empty state if no watchlist items AND initialized
  if (isInitialized && watchlist.length === 0) {
    return (
      <div className="space-y-6 w-full z-0 p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-lg font-medium mb-2">No coins in watchlist</h3>
            <p className="text-muted-foreground mb-4">
              Add some coins to your watchlist to see charts
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Always show the UI with optimistic data (even during initialization)
  return (
    <div className="space-y-6 w-full z-0 p-8">
      <div className="space-y-14">
        <MultiPriceChartLightweight 
          coins={optimisticCoins} 
          activeTimeScale={activeTimeScale}
          setActiveTimeScale={setActiveTimeScale}
        />
        <ChartTable 
          coins={optimisticCoins} 
          activeTimeScale={activeTimeScale}
        />
      </div>
    </div>
  )
}

export function ChartsClient() {
  return (
    <Suspense fallback={
      <div className="space-y-6 w-full z-0 p-8">
        <div className="space-y-14">
          <div className="grid grid-cols-12 gap-0 rounded-[13px] bg-zinc-950/50 border border-zinc-800/20 overflow-hidden p-1">
            <div className="flex flex-col col-span-3 p-6 pt-2 space-y-2" />
            <div className="col-span-9 border border-zinc-800/30 rounded-[13px] overflow-hidden">
              <div className="h-[400px] flex items-center justify-center">
                <Spinner size={24} />
              </div>
            </div>
          </div>
          <div className="space-y-4" />
        </div>
      </div>
    }>
      <ChartsContent />
    </Suspense>
  )
}