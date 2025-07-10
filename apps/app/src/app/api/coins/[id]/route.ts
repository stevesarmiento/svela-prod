import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';

interface HistoricalQuote {
  timestamp: string;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
      market_cap: number;
    };
  };
}

interface USDQuote {
  price: number;
  volume_24h: number;
  market_cap: number;
  percent_change_1h?: number;
  percent_change_24h?: number;
  percent_change_7d?: number;
  percent_change_30d?: number;
}

interface CurrentMarketData {
  quote: { USD: USDQuote };
  cmc_rank?: number;
  circulating_supply?: number;
  total_supply?: number;
  max_supply?: number;
}

interface HistoricalDataResponse {
  data: {
    id: number;
    name?: string;
    symbol?: string;
    is_active?: number;
    is_fiat?: number;
    quotes: HistoricalQuote[];
  };
  status: {
    error_code: number;
    error_message: string;
  };
}

const BASE_URLS = {
  v1: "https://pro-api.coinmarketcap.com/v1",
  v2: "https://pro-api.coinmarketcap.com/v2"
};
const API_KEY = process.env.COINMARKETCAP_API_KEY;

// Initialize Convex client for caching
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function cacheDataInConvex(
  coinId: string, 
  timeScale: string, 
  historicalData: HistoricalDataResponse, 
  currentData: CurrentMarketData
) {
  try {
    // Cache historical data if available
    if (historicalData?.data?.quotes && historicalData.data.quotes.length > 0) {
      const dataPoints = historicalData.data.quotes.map((quote: HistoricalQuote) => ({
        timestamp: new Date(quote.timestamp).getTime(),
        price: quote.quote.USD.price,
        volume: quote.quote.USD.volume_24h || 0,
        marketCap: quote.quote.USD.market_cap,
        open: quote.quote.USD.price,
        high: quote.quote.USD.price,
        low: quote.quote.USD.price,
        close: quote.quote.USD.price,
      }));

      await convex.mutation(api.historicalData.upsertHistoricalData, {
        coinId: Number(coinId),
        timeframe: timeScale,
        dataPoints,
        dataSource: "coinmarketcap"
      });

      console.log(`💾 Cached ${dataPoints.length} historical data points for coin ${coinId}`);
    }

    // Cache current market data if available
    if (currentData?.quote?.USD) {
      await convex.mutation(api.historicalData.upsertCurrentMarketData, {
        coinId: Number(coinId),
        price: currentData.quote.USD.price,
        volume24h: currentData.quote.USD.volume_24h || 0,
        marketCap: currentData.quote.USD.market_cap || 0,
        change1h: currentData.quote.USD.percent_change_1h || undefined,
        change24h: currentData.quote.USD.percent_change_24h,
        change7d: currentData.quote.USD.percent_change_7d || undefined,
        change30d: currentData.quote.USD.percent_change_30d || undefined,
        rank: currentData.cmc_rank || undefined,
        circulatingSupply: currentData.circulating_supply || undefined,
        totalSupply: currentData.total_supply || undefined,
        maxSupply: currentData.max_supply || undefined,
        dataSource: "coinmarketcap"
      });

      console.log(`💾 Cached current market data for coin ${coinId}`);
    }
  } catch (error) {
    // Don't fail the request if caching fails
    console.warn('Failed to cache data in Convex:', error);
  }
}

const idSchema = z.string().min(1);

async function fetchWithErrorHandling(url: string) {
  if (!API_KEY) {
    throw new Error('CoinMarketCap API key is not configured');
  }

  try {
    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': API_KEY,
        'Accept': 'application/json',
      },
      // Next.js specific caching
      next: {
        revalidate: 60,
      },
    } as RequestInit);

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.status?.error_message || `API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error("CoinMarketCap API error:", error);
    throw error;
  }
}

async function fetchHistoricalData(id: string, timeScale: string = '1d') {
  const now = new Date();
  
  // Define time ranges - corrected to match actual timeframe labels
  const timeRanges = {
    '1d': 2 * 24 * 60 * 60 * 1000,       // 48 hours (2 days for better context)
    '7d': 7 * 24 * 60 * 60 * 1000,       // 7 days  
    '30d': 30 * 24 * 60 * 60 * 1000,     // 30 days
    'max': 365 * 24 * 60 * 60 * 1000,    // 1 year (daily data access)
    '2y': 730 * 24 * 60 * 60 * 1000,     // 2 years (daily data access)
  };
  
  const timeRange = timeRanges[timeScale as keyof typeof timeRanges] || timeRanges['1d'];
  const timeStart = new Date(now.getTime() - timeRange).toISOString();
  const timeEnd = new Date(Math.min(now.getTime(), Date.now())).toISOString();
  
  // Validate date range
  if (new Date(timeStart) > new Date(timeEnd)) {
    throw new Error('Invalid date range: start date cannot be after end date');
  }

  if (new Date(timeEnd) > now) {
    throw new Error('Invalid date range: end date cannot be in the future');
  }

  const url = new URL(`${BASE_URLS.v2}/cryptocurrency/quotes/historical`);
  const params = {
    id,
    time_start: timeStart,
    time_end: timeEnd,
    interval: timeScale === '1d' ? '1h' : timeScale === '7d' ? '1h' : '1d', // hourly for 1d and 7d, daily for others
    count: timeScale === '1d' ? '48' : timeScale === '7d' ? '168' : timeScale === '30d' ? '30' : timeScale === 'max' ? '365' : '730',
    convert: 'USD',
    aux: 'price,volume,market_cap',
    skip_invalid: 'true'
  };

  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  try {
    const response = await fetchWithErrorHandling(url.toString());

    console.log('Historical Data Response:', {
      url: url.toString(),
      hasData: !!response.data,
      dataStructure: JSON.stringify(response.data, null, 2)
    });

    const coinData = response.data;

    if (!coinData?.quotes?.length) {
      console.error('No quotes found in response:', response);
      return {
        data: {
          id: Number(id),
          quotes: []
        },
        status: response.status || {
          error_code: 400,
          error_message: 'No historical quotes available'
        }
      };
    }

    return {
      data: {
        id: Number(id),
        name: coinData.name || '',
        symbol: coinData.symbol || '',
        is_active: coinData.is_active || 1,
        is_fiat: coinData.is_fiat || 0,
        quotes: coinData.quotes.map((quote: HistoricalQuote) => ({
          timestamp: quote.timestamp,
          quote: {
            USD: {
              price: quote.quote.USD.price,
              volume_24h: quote.quote.USD.volume_24h || 0,
              market_cap: quote.quote.USD.market_cap || 0
            }
          }
        }))
      },
      status: response.status || {
        error_code: 0,
        error_message: ''
      }
    };
  } catch (error) {
    console.error('Historical data fetch error:', error);
    return {
      data: {
        id: Number(id),
        quotes: []
      },
      status: {
        error_code: 500,
        error_message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

async function fetchOHLCVData(id: string, timeScale: string = '1d') {
  const now = new Date();
  
  // Define time ranges - corrected to match actual timeframe labels
  const timeConfigs = {
    '1d': { 
      days: 2, 
      timePeriod: 'hourly',
      interval: '1h',
      count: '48' // 48 hours (2 days of hourly data)
    },
    '7d': { 
      days: 7, 
      timePeriod: 'hourly',
      interval: '1h',
      count: '168' // 7 days * 24 hours
    },
    '30d': { 
      days: 30, 
      timePeriod: 'daily',
      interval: '1d',
      count: '30' // 30 days
    },
    'max': { 
      days: 365, 
      timePeriod: 'daily',
      interval: '1d',
      count: '365' // 1 year (daily data access)
    },
    '2y': { 
      days: 730, 
      timePeriod: 'daily',
      interval: '1d',
      count: '730' // 2 years (daily data access)
    },
  };
  
  const config = timeConfigs[timeScale as keyof typeof timeConfigs] || timeConfigs['1d'];
  const timeStart = new Date(now.getTime() - (config.days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
  const timeEnd = new Date().toISOString().split('T')[0];

  const url = new URL(`${BASE_URLS.v2}/cryptocurrency/ohlcv/historical`);
  const params = {
    id,
    time_start: timeStart,
    time_end: timeEnd,
    time_period: config.timePeriod,
    interval: config.interval,
    count: config.count,
    convert: 'USD',
    skip_invalid: 'true'
  };

  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  try {
    const response = await fetchWithErrorHandling(url.toString());

    console.log('OHLCV Data Response:', {
      url: url.toString(),
      hasData: !!response.data,
      dataStructure: JSON.stringify(response.data, null, 2)
    });

    return {
      data: response.data,
      status: response.status || {
        error_code: 0,
        error_message: ''
      }
    };
  } catch (error) {
    console.error('OHLCV data fetch error:', error);
    return {
      data: {
        id: Number(id),
        quotes: []
      },
      status: {
        error_code: 500,
        error_message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: Promise<string> } }
) {
  if (!API_KEY) {
    throw new Error('CoinMarketCap API key is not configured');
  }

  try {
    const { searchParams } = new URL(request.url);
    const timeScale = searchParams.get('timeScale') || '1d'; // Default to 1D view
    
    const id = await params.id;
    const validatedId = idSchema.parse(id);

    const [info, quotes, historical, ohlcv] = await Promise.all([
      fetchWithErrorHandling(
        `${BASE_URLS.v1}/cryptocurrency/info?id=${validatedId}`
      ),
      fetchWithErrorHandling(
        `${BASE_URLS.v1}/cryptocurrency/quotes/latest?id=${validatedId}`
      ),
      fetchHistoricalData(validatedId, timeScale).catch(error => {
        console.error('Historical data fetch failed:', error);
        return { 
          data: { 
            id: Number(validatedId), 
            quotes: [] 
          }, 
          status: { 
            error_code: 500, 
            error_message: 'Historical data fetch failed' 
          } 
        };
      }),
      fetchOHLCVData(validatedId, timeScale).catch(error => {
        console.error('OHLCV data fetch failed:', error);
        return { data: { quotes: [] } };
      })
    ]);

    if (!info?.data || !quotes?.data) {
      throw new Error('Incomplete coin data received');
    }

    const coinData = {
      id: validatedId,
      name: info.data[validatedId].name,
      symbol: info.data[validatedId].symbol,
      image: {
        small: `https://s2.coinmarketcap.com/static/img/coins/64x64/${validatedId}.png`
      },
      quote: quotes.data[validatedId].quote,
      market_data: {
        current_price: {
          usd: quotes.data[validatedId].quote.USD.price
        },
        price_change_percentage_24h: quotes.data[validatedId].quote.USD.percent_change_24h,
        market_cap: {
          usd: quotes.data[validatedId].quote.USD.market_cap
        }
      },
      cmc_rank: quotes.data[validatedId].cmc_rank,
      circulating_supply: quotes.data[validatedId].circulating_supply,
      max_supply: quotes.data[validatedId].max_supply || null,
      historical,
      ohlcv
    };

    // Cache the fetched data in Convex for future requests
    if (historical?.data?.quotes && quotes?.data?.[validatedId]) {
      await cacheDataInConvex(
        validatedId, 
        timeScale, 
        historical as HistoricalDataResponse, 
        quotes.data[validatedId] as CurrentMarketData
      );
    }

    return NextResponse.json(coinData);
  } catch (error) {
    console.error('Error fetching coin data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch coin data' },
      { status: 500 }
    );
  }
}