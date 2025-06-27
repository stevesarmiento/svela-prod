import { NextResponse } from 'next/server';
import { z } from 'zod';

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

const BASE_URLS = {
  v1: "https://pro-api.coinmarketcap.com/v1",
  v2: "https://pro-api.coinmarketcap.com/v2"
};
const API_KEY = process.env.COINMARKETCAP_API_KEY;

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
      next: {
        revalidate: 60,
      },
    });

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

async function fetchHistoricalData(id: string, timeScale: string = '7d') {
  const now = new Date();
  
  // Define time ranges - show 60-90 days of context for all timeframes
  const timeRanges = {
    '7d': 90 * 24 * 60 * 60 * 1000,      // 90 days for weekly view  
    '30d': 90 * 24 * 60 * 60 * 1000,     // 90 days for monthly view
    'max': 365 * 24 * 60 * 60 * 1000,    // 365 days for yearly view
    '2y': 730 * 24 * 60 * 60 * 1000,     // 730 days for 2-year view
  };
  
  const timeRange = timeRanges[timeScale as keyof typeof timeRanges] || timeRanges['7d'];
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
    interval: timeScale === '7d' ? '1h' : '24h', // Hourly for 7d, daily for others
    count: timeScale === '7d' ? '2160' : '90', // 90 days * 24 hours = 2160 for hourly, 90 for daily
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

async function fetchOHLCVData(id: string, timeScale: string = '7d') {
  const now = new Date();
  
  // Define time ranges - 60-90 days context with different granularities
  const timeConfigs = {
    '7d': { 
      days: 30, 
      timePeriod: 'hourly',
      interval: '1h',
      count: '720' // 30 days * 24 hours
    },
    '30d': { 
      days: 180, 
      timePeriod: 'daily',
      interval: '1d',
      count: '180' // 90 days of daily data
    },
    'max': { 
      days: 365, 
      timePeriod: 'daily',
      interval: '1d',
      count: '365' // 1 year
    },
    '2y': { 
      days: 730, 
      timePeriod: 'daily',
      interval: '1d',
      count: '730' // 2 years
    },
  };
  
  const config = timeConfigs[timeScale as keyof typeof timeConfigs] || timeConfigs['7d'];
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
    const timeScale = searchParams.get('timeScale') || '7d';
    
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
        return { quotes: [] };
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

    return NextResponse.json(coinData);
  } catch (error) {
    console.error('Error fetching coin data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch coin data' },
      { status: 500 }
    );
  }
}