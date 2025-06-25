import { NextResponse } from 'next/server';
import { fetchWithErrorHandling } from '../utils';
import type { HistoricalData } from '@/types/coins';

const BASE_URL = 'https://pro-api.coinmarketcap.com/v2'

const IntervalMap = {
  // '1h': { interval: '1h', days: 30, count: 48 },      // 30 days of hourly data
  // '4h': { interval: '4h', days: 30, count: 42 },      // 30 days of 4h data  
  '1d': { interval: '24h', days: 30, count: 30 },    // 30 days of daily data
  '7d': { interval: '24h', days: 90, count: 90 },    // 90 days of daily data
  'max': { interval: '24h', days: 365, count: 365 }  // 1 year of daily data
} as const

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');
    const timeframe = searchParams.get('timeframe') || 'max';

    if (!ids) {
      return NextResponse.json(
        { error: 'Missing ids parameter' },
        { status: 400 }
      );
    }

    // Get interval config based on timeframe
    const config = IntervalMap[timeframe as keyof typeof IntervalMap] || IntervalMap.max;

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

    // Transform the response to match the expected format
    const transformedData = Object.entries(response.data as Record<string, { 
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
        }>
    }>).reduce<Record<string, { data: HistoricalData['data'] }>>(
        (acc, [id, data]) => {
            acc[id] = {
                data: {
                    id: Number(id),
                    name: data.name,
                    symbol: data.symbol,
                    is_active: 1,
                    is_fiat: 0,
                    quotes: data.quotes
                }
            };
            return acc;
        }, {});

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