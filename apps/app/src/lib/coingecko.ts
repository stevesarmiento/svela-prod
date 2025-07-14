// CoinGecko Pro API utility with rate limiting
const BASE_URL = "https://pro-api.coingecko.com/api/v3";
const API_KEY = process.env.X_CG_PRO_API_KEY;

// Rate limiting for 500 requests per minute
const RATE_LIMIT = {
  maxRequests: 500,
  windowMs: 60 * 1000, // 1 minute
  requests: [] as number[],
};

// CoinGecko API interfaces
export interface CoinGeckoListItem {
  id: string;
  symbol: string;
  name: string;
  platforms?: Record<string, string>;
}

export interface CoinGeckoDetail {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
  image: {
    large: string;
    small: string;
    thumb: string;
  };
  description: {
    en: string;
  };
  market_data: {
    current_price: {
      usd: number;
      [key: string]: number;
    };
    market_cap: {
      usd: number;
      [key: string]: number;
    };
    total_volume: {
      usd: number;
      [key: string]: number;
    };
    price_change_percentage_24h: number;
    high_24h: {
      usd: number;
      [key: string]: number;
    };
    low_24h: {
      usd: number;
      [key: string]: number;
    };
    ath: {
      usd: number;
      [key: string]: number;
    };
    ath_change_percentage: {
      usd: number;
      [key: string]: number;
    };
    circulating_supply: number;
    max_supply: number | null;
    sparkline_7d: {
      price: number[];
    };
  };
}

// Rate limiting helper
function checkRateLimit(): boolean {
  const now = Date.now();
  
  // Remove old requests outside the window
  RATE_LIMIT.requests = RATE_LIMIT.requests.filter(
    timestamp => now - timestamp < RATE_LIMIT.windowMs
  );
  
  // Check if we're under the limit
  if (RATE_LIMIT.requests.length >= RATE_LIMIT.maxRequests) {
    return false;
  }
  
  // Add current request
  RATE_LIMIT.requests.push(now);
  return true;
}

// Get time until rate limit resets
function getRateLimitResetTime(): number {
  if (RATE_LIMIT.requests.length === 0) return 0;
  
  const oldestRequest = Math.min(...RATE_LIMIT.requests);
  const resetTime = oldestRequest + RATE_LIMIT.windowMs;
  return Math.max(0, resetTime - Date.now());
}

// Core API fetch function with error handling
async function fetchWithErrorHandling(url: string): Promise<unknown> {
  if (!API_KEY) {
    throw new Error('CoinGecko Pro API key is not configured. Please set X_CG_PRO_API_KEY in your environment.');
  }

  // Check rate limit
  if (!checkRateLimit()) {
    const resetTimeMs = getRateLimitResetTime();
    throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(resetTimeMs / 1000)} seconds before making another request.`);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'x-cg-pro-api-key': API_KEY,
        'Accept': 'application/json',
      },
      next: {
        revalidate: 60,
      },
    });

    if (!response.ok) {
      // Handle specific error codes
      if (response.status === 429) {
        throw new Error('CoinGecko API rate limit exceeded. Please try again later.');
      }
      if (response.status === 401) {
        throw new Error('Invalid CoinGecko API key. Please check your X_CG_PRO_API_KEY.');
      }
      if (response.status === 503) {
        throw new Error('CoinGecko API is temporarily unavailable.');
      }
      
      // Try to get error message from response
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || `CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ CoinGecko API success: ${url}`);
    return data;
  } catch (error) {
    console.error('❌ CoinGecko API error:', error);
    throw error;
  }
}

// Get all supported coins list
export async function getCoinsList(includePlatform = false): Promise<CoinGeckoListItem[]> {
  try {
    const url = `${BASE_URL}/coins/list${includePlatform ? '?include_platform=true' : ''}`;
    const data = await fetchWithErrorHandling(url) as CoinGeckoListItem[];
    
    console.log(`📋 Fetched ${data.length} coins from CoinGecko`);
    return data;
  } catch (error) {
    console.error('Failed to fetch coins list:', error);
    throw error;
  }
}

// Search coins by query
export async function searchCoins(query: string): Promise<{ coins: CoinGeckoListItem[] }> {
  try {
    const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;
    const data = await fetchWithErrorHandling(url) as { coins: CoinGeckoListItem[] };
    
    if (!data?.coins) {
      throw new Error('Invalid response format from CoinGecko search API');
    }
    
    return data;
  } catch (error) {
    console.error('Search coins error:', error);
    throw error;
  }
}

// Get detailed coin data
export async function getCoinData(id: string): Promise<CoinGeckoDetail> {
  try {
    const url = `${BASE_URL}/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`;
    const data = await fetchWithErrorHandling(url) as CoinGeckoDetail;
    
    return data;
  } catch (error) {
    console.error('Get coin data error:', error);
    throw error;
  }
}

// Get market data for multiple coins
export async function getCoinsMarketData(
  ids: string[], 
  vsCurrency = 'usd',
  order = 'market_cap_desc',
  perPage = 250,
  page = 1,
  sparkline = false,
  priceChangePercentage = '24h'
): Promise<unknown[]> {
  try {
    const params = new URLSearchParams({
      ids: ids.join(','),
      vs_currency: vsCurrency,
      order,
      per_page: perPage.toString(),
      page: page.toString(),
      sparkline: sparkline.toString(),
      price_change_percentage: priceChangePercentage,
    });
    
    const url = `${BASE_URL}/coins/markets?${params}`;
    const data = await fetchWithErrorHandling(url) as unknown[];
    
    return data;
  } catch (error) {
    console.error('Get coins market data error:', error);
    throw error;
  }
}

// Get historical market data for a coin
export async function getCoinHistory(
  id: string,
  vsCurrency = 'usd',
  days: string | number = 7,
  interval?: string
): Promise<{
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}> {
  try {
    const params = new URLSearchParams({
      vs_currency: vsCurrency,
      days: days.toString(),
    });
    
    if (interval) {
      params.append('interval', interval);
    }
    
    const url = `${BASE_URL}/coins/${id}/market_chart?${params}`;
    const data = await fetchWithErrorHandling(url) as {
      prices: [number, number][];
      market_caps: [number, number][];
      total_volumes: [number, number][];
    };
    
    return data;
  } catch (error) {
    console.error('Get coin history error:', error);
    throw error;
  }
}

// 🆕 NEW: Get market chart data for a coin and cache in Convex
export async function getCoinMarketChart(
  id: string,
  vsCurrency = 'usd',
  days: string | number = 7,
  interval?: string
): Promise<{
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
  transformed: {
    prices: { time: number; value: number }[];
    volumes: { time: number; value: number }[];
    market_caps: { time: number; value: number }[];
  };
}> {
  try {
    console.log(`🎯 Fetching CoinGecko market chart: ${id} (${days} days)`);
    
    const params = new URLSearchParams({
      vs_currency: vsCurrency,
      days: days.toString(),
    });
    
    if (interval) {
      params.append('interval', interval);
    }
    
    const url = `${BASE_URL}/coins/${id}/market_chart?${params}`;
    const data = await fetchWithErrorHandling(url) as {
      prices: [number, number][];
      market_caps: [number, number][];
      total_volumes: [number, number][];
    };
    
    // Transform to chart-friendly format
    const transformed = {
      prices: data.prices.map(([timestamp, price]) => ({
        time: Math.floor(timestamp / 1000), // Convert to seconds
        value: price
      })),
      volumes: data.total_volumes.map(([timestamp, volume]) => ({
        time: Math.floor(timestamp / 1000),
        value: volume
      })),
      market_caps: data.market_caps.map(([timestamp, market_cap]) => ({
        time: Math.floor(timestamp / 1000),
        value: market_cap
      }))
    };
    
    console.log(`✅ CoinGecko market chart fetched: ${transformed.prices.length} data points`);
    
    return {
      ...data,
      transformed
    };
  } catch (error) {
    console.error('Get coin market chart error:', error);
    throw error;
  }
}

// Get current rate limit status
export function getRateLimitStatus() {
  const now = Date.now();
  const activeRequests = RATE_LIMIT.requests.filter(
    timestamp => now - timestamp < RATE_LIMIT.windowMs
  );
  
  return {
    requestsUsed: activeRequests.length,
    requestsRemaining: RATE_LIMIT.maxRequests - activeRequests.length,
    resetTimeMs: getRateLimitResetTime(),
    resetTimeSeconds: Math.ceil(getRateLimitResetTime() / 1000),
  };
}

// Legacy interfaces for backward compatibility
export interface Coin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
  thumb: string;
  large: string;
}

export interface CoinDetail {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
  image: {
    large: string;
    small: string;
    thumb: string;
  };
  description: {
    en: string;
  };
  market_data: {
    current_price: {
      usd: number;
      [key: string]: number;
    };
    market_cap: {
      usd: number;
      [key: string]: number;
    };
    total_volume: {
      usd: number;
      [key: string]: number;
    };
    price_change_percentage_24h: number;
    high_24h: {
      usd: number;
      [key: string]: number;
    };
    low_24h: {
      usd: number;
      [key: string]: number;
    };
    ath: {
      usd: number;
      [key: string]: number;
    };
    ath_change_percentage: {
      usd: number;
      [key: string]: number;
    };
    circulating_supply: number;
    max_supply: number | null;
    sparkline_7d: {
      price: number[];
    };
  };
}