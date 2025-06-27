import { NextResponse } from 'next/server';
import { fetchWithErrorHandling } from '../utils';
import type { HistoricalData } from '@/types/coins';

const BASE_URL = 'https://pro-api.coinmarketcap.com/v2'

const IntervalMap = {
  '7d': { interval: '1h', days: 30, count: 720 },      // 30 days of hourly data (1D view)
  '30d': { interval: '24h', days: 180, count: 180 },     // 90 days of daily data (1W view)
  'max': { interval: '24h', days: 365, count: 365 },   // 1 year of daily data (1Y view)
  '2y': { interval: '24h', days: 730, count: 730 }     // 2 years of daily data (2Y view)
} as const

interface CoinHistoricalData {
  name: string;
  symbol: string;
  quotes: Array<{
    timestamp: string;
    quote: {
      USD: {
        price: number;
        volume_24h?: number;
        market_cap?: number;
        timestamp: string;
      }
    }
  }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');
    const timeScale = searchParams.get('timeScale') || '7d'; // Changed from 'timeframe' to 'timeScale' and default to '7d'

    if (!ids) {
      return NextResponse.json(
        { error: 'Missing ids parameter' },
        { status: 400 }
      );
    }

    // Get interval config based on timeScale
    const config = IntervalMap[timeScale as keyof typeof IntervalMap] || IntervalMap['7d'];

    const now = new Date();
    const timeEnd = new Date(Math.min(now.getTime(), Date.now())).toISOString();
    const timeStart = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000).toISOString();

    const url = new URL(`${BASE_URL}/cryptocurrency/quotes/historical`);
    const params = {
      id: ids,
      time_start: timeStart,
      time_end: timeEnd,
      interval: config.interval,
      count: config.count.toString(),
      convert: 'USD',
      aux: 'price',
      skip_invalid: 'true'
    };

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await fetchWithErrorHandling(url.toString());

    console.log('CoinMarketCap Raw Response:', JSON.stringify(response, null, 2));

    // Handle different response structures for single vs multiple coins
    let transformedData: Record<string, { data: HistoricalData['data'] }> = {};

    if (response.data) {
      // Check if it's a single coin response (different structure)
      if (response.data.quotes && Array.isArray(response.data.quotes)) {
        // Single coin response - the data is directly in response.data
        const coinId = ids; // Use the requested ID
        transformedData[coinId] = {
          data: {
            id: Number(coinId),
            name: response.data.name || '',
            symbol: response.data.symbol || '',
            is_active: 1,
            is_fiat: 0,
            quotes: response.data.quotes
          }
        };
      } else {
        // Multiple coins response - use existing logic
        transformedData = Object.entries(response.data as Record<string, CoinHistoricalData>).reduce(
          (acc, [id, data]) => {
            acc[id] = {
              data: {
                id: Number(id),
                name: data.name,
                symbol: data.symbol,
                is_active: 1,
                is_fiat: 0,
                quotes: data.quotes || []
              }
            };
            return acc;
          }, {} as Record<string, { data: HistoricalData['data'] }>
        );
      }
    }

    console.log('Final transformed data:', transformedData);

    return NextResponse.json({
      data: transformedData,
      status: {
        error_code: 0,
        error_message: ''
      }
    });
  } catch (error) {
    console.error('Error in historical endpoint:', error);
    return NextResponse.json(
      { 
        data: {},
        status: {
          error_code: 500,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
}