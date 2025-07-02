'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { useWatchlist } from "../app/[locale]/(dashboard)/watchlist/_components/watchlist-context"
import type { CoinMarketData } from '@/types/coins'
import { toast } from "@v1/ui/use-toast"
import { useQuery } from '@tanstack/react-query'
import { useTokenData } from './use-token-data'
import type { OHLCVQuote } from '@/types/coins'
import type { Time } from 'lightweight-charts'

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

interface HistoricalQuote {
  timestamp: string;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
    };
  };
}

interface OHLCVDataPoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export function useChartsData() {
  const { 
    watchlist, 
    isInitialized,
    selectedGroup,
    selectedGroupCoins
  } = useWatchlist()
  const [coinsData, setCoinsData] = useState<Map<number, OptimisticCoinMarketData>>(new Map())
  const [activeTimeScale, setActiveTimeScale] = useState<string>("7d")
  
  // Use selected group coins if available, otherwise fall back to legacy watchlist
  const currentWatchlist = selectedGroup ? selectedGroupCoins : watchlist
  
  // Debug logging
  console.log('useChartsData - selectedGroup:', selectedGroup?.name, 'coins:', selectedGroupCoins.length)
  console.log('useChartsData - legacy watchlist coins:', watchlist.length)
  console.log('useChartsData - currentWatchlist coins:', currentWatchlist.length)

  const fetchCoinData = useCallback(async (coinIds: number[]) => {
    if (!coinIds.length) return;
  
    try {
      const [quotesResponse, historicalResponse] = await Promise.all([
        fetch(`/api/coinmarketcap/quotes?ids=${coinIds.join(',')}`, {
          cache: 'no-store'
        }),
        fetch(`/api/coinmarketcap/historical?ids=${coinIds.join(',')}&timeScale=${activeTimeScale}`, {
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
  }, [activeTimeScale])

  // Create optimistic coins when watchlist changes
  const optimisticCoins = useMemo(() => {
    if (!isInitialized) return [];
    
    const coins = currentWatchlist.map(coinId => {
      const existingCoin = coinsData.get(coinId);
      
      if (existingCoin && !existingCoin.isOptimistic) {
        return existingCoin;
      }
      
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

    return coins.sort((a, b) => {
      if (a.isOptimistic && b.isOptimistic) return 0;
      if (a.isOptimistic) return 1;
      if (b.isOptimistic) return -1;
      return (a.cmc_rank || 999999) - (b.cmc_rank || 999999);
    });
  }, [currentWatchlist, coinsData, isInitialized]);

  // Fetch data when watchlist or time scale changes
  useEffect(() => {
    if (!isInitialized || !currentWatchlist.length) return;
    fetchCoinData(currentWatchlist);
  }, [currentWatchlist, isInitialized, fetchCoinData, activeTimeScale])

  // Clean up removed coins
  useEffect(() => {
    if (!isInitialized) return;
    
    setCoinsData(prev => {
      const newMap = new Map();
      const currentIds = new Set(currentWatchlist);
      
      prev.forEach((coin, id) => {
        if (currentIds.has(id)) {
          newMap.set(id, coin);
        }
      });
      
      return newMap;
    });
  }, [currentWatchlist, isInitialized]);

  return {
    optimisticCoins,
    activeTimeScale,
    setActiveTimeScale,
    isInitialized,
    hasWatchlistItems: currentWatchlist.length > 0,
    isLoading: !isInitialized,
    selectedGroup // Also return selected group info for display
  }
}

export function useChartData(coinId: string, activeTimeScale: string, initialData: CoinMarketData['quote']['USD']) {
  const { data: tokenData } = useTokenData(coinId)

  const { data: chartDataResponse, isLoading } = useQuery({
    queryKey: ['coin-chart-data', coinId, activeTimeScale],
    queryFn: async () => {
      const response = await fetch(`/api/coins/${coinId}?timeScale=${activeTimeScale}`)
      if (!response.ok) throw new Error('Failed to fetch chart data')
      return response.json()
    },
    staleTime: 30 * 1000,
    refetchInterval: 2 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  })

  const { chartData, volumeData, ohlcvData } = useMemo(() => {
    const dataSource = chartDataResponse || tokenData?.fullData

    // Try OHLCV first - return both line chart data AND proper OHLCV data
    if (dataSource?.ohlcv?.data?.quotes?.length) {
      const ohlcvQuotes = dataSource.ohlcv.data.quotes as OHLCVQuote[];
      
      const pricePoints = ohlcvQuotes.map(quote => ({
        time: (new Date(quote.time_close).getTime() / 1000) as Time,
        value: quote.quote.USD.close
      }));

      const volumePoints = ohlcvQuotes.map(quote => ({
        time: (new Date(quote.time_close).getTime() / 1000) as Time,
        value: quote.quote.USD.volume,
        color: '#ffffff40'
      }));

      // Proper OHLCV data for candlestick charts
      const ohlcvPoints: OHLCVDataPoint[] = ohlcvQuotes.map(quote => ({
        time: (new Date(quote.time_close).getTime() / 1000) as Time,
        open: quote.quote.USD.open,
        high: quote.quote.USD.high,
        low: quote.quote.USD.low,
        close: quote.quote.USD.close,
        volume: quote.quote.USD.volume
      }));

      return { 
        chartData: pricePoints, 
        volumeData: volumePoints, 
        ohlcvData: ohlcvPoints 
      };
    }
    
    // Fallback to historical data
    if (dataSource?.historical?.data?.quotes?.length) {
      const pricePoints = dataSource.historical.data.quotes.map((quote: HistoricalQuote) => ({
        time: (new Date(quote.timestamp).getTime() / 1000) as Time,
        value: quote.quote.USD.price
      }));

      const volumePoints = dataSource.historical.data.quotes.map((quote: HistoricalQuote) => ({
        time: (new Date(quote.timestamp).getTime() / 1000) as Time,
        value: quote.quote.USD.volume_24h || 0,
        color: '#ffffff40'
      }));

      // Create approximate OHLCV from historical data
      const ohlcvPoints: OHLCVDataPoint[] = dataSource.historical.data.quotes.map((quote: HistoricalQuote) => {
        const price = quote.quote.USD.price;
        return {
          time: (new Date(quote.timestamp).getTime() / 1000) as Time,
          open: price,
          high: price * 1.005, // Small approximation
          low: price * 0.995,
          close: price,
          volume: quote.quote.USD.volume_24h || 0
        };
      });

      return { 
        chartData: pricePoints, 
        volumeData: volumePoints, 
        ohlcvData: ohlcvPoints 
      };
    }

    // Generate fallback data
    const fallbackData = Array.from({ length: 30 }, (_, i) => {
      const time = ((Date.now() - (30 - i) * 24 * 60 * 60 * 1000) / 1000) as Time;
      const price = initialData.price * (0.95 + Math.random() * 0.1);
      const volume = initialData.volume_24h * (0.5 + Math.random() * 1.5);
      
      return {
        price: { time, value: price },
        volume: { time, value: volume, color: '#ffffff40' },
        ohlcv: {
          time,
          open: price,
          high: price * 1.01,
          low: price * 0.99,
          close: price,
          volume
        }
      };
    });
    
    fallbackData.push({
      price: { time: (Date.now() / 1000) as Time, value: initialData.price },
      volume: { time: (Date.now() / 1000) as Time, value: initialData.volume_24h, color: '#ffffff40' },
      ohlcv: {
        time: (Date.now() / 1000) as Time,
        open: initialData.price,
        high: initialData.price * 1.01,
        low: initialData.price * 0.99,
        close: initialData.price,
        volume: initialData.volume_24h
      }
    });

    return {
      chartData: fallbackData.map(d => d.price),
      volumeData: fallbackData.map(d => d.volume),
      ohlcvData: fallbackData.map(d => d.ohlcv)
    };
  }, [chartDataResponse, tokenData?.fullData, initialData]);

  return { chartData, volumeData, ohlcvData, isLoading, tokenData }
}