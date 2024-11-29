import { NextResponse } from 'next/server';
import { z } from 'zod';

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

async function fetchHistoricalData(id: string) {
    const now = new Date();
    
    // Validate that we're not requesting future dates
    const timeEnd = new Date(Math.min(now.getTime(), Date.now())).toISOString();
    const timeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
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
      interval: '24h',
      count: '30',
      convert: 'USD',
      aux: 'price,volume,market_cap',
      skip_invalid: 'true'
    };
  
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
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
          quotes: coinData.quotes.map((quote: any) => ({
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

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
  ) {
    if (!API_KEY) {
      throw new Error('CoinMarketCap API key is not configured');
    }
  
    try {
      const validatedId = idSchema.parse(params.id);
  
      const [info, quotes, historical] = await Promise.all([
        fetchWithErrorHandling(
          `${BASE_URLS.v1}/cryptocurrency/info?id=${validatedId}`
        ),
        fetchWithErrorHandling(
          `${BASE_URLS.v1}/cryptocurrency/quotes/latest?id=${validatedId}`
        ),
        fetchHistoricalData(validatedId).catch(error => {
          console.error('Historical data fetch failed:', error);
          return { quotes: [] };
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
        historical
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