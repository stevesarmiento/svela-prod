/**
 * CoinGlass API utilities and helpers
 */

const BASE_URL = "https://open-api-v4.coinglass.com/api";
const API_KEY = process.env.CG_API_KEY || process.env['CG-API-KEY'];

interface CoinglassResponse<T> {
  code: string;
  msg: string;
  data: T;
}

export async function fetchCoinglassData<T>(endpoint: string): Promise<T> {
  if (!API_KEY) {
    throw new Error('CoinGlass API key is not configured');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'CG-API-KEY': API_KEY,
      'Content-Type': 'application/json',
    },
    next: {
      revalidate: 300, // 5 minutes cache
    },
  });

  if (!response.ok) {
    throw new Error(`CoinGlass API error: ${response.status}`);
  }

  const data: CoinglassResponse<T> = await response.json();
  
  if (data.code !== "0") {
    throw new Error(`CoinGlass API error: ${data.msg}`);
  }

  return data.data;
}

export async function getSupportedCoins(): Promise<string[]> {
  return fetchCoinglassData<string[]>('/futures/supported-coins');
}

// Helper to check if a symbol is supported by CoinGlass
export function isCoinglassSymbolSupported(symbol: string, supportedCoins: string[]): boolean {
  return supportedCoins.includes(symbol.toUpperCase());
}

// Map common symbol variations to CoinGlass format
export function normalizeCoinglassSymbol(symbol: string): string {
  const symbolMap: Record<string, string> = {
    'WBTC': 'BTC',
    'WETH': 'ETH',
    'USDT': 'USDT',
    'USDC': 'USDC',
  };
  
  const normalized = symbol.toUpperCase();
  return symbolMap[normalized] || normalized;
}