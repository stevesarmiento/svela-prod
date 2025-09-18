// Shared types for chat components to avoid duplicates

export interface PriceCardData {
  coingeckoId: string;
  name: string;
  symbol: string;
  currentPrice: number;
  priceChangePercentage24h: number;
  marketCap?: number;
  totalVolume?: number;
  marketCapRank?: number;
  image?: string;
  historical?: {
    data?: {
      prices?: Array<[number, number]>; // CoinGecko format: [timestamp, price]
    };
  };
}

export interface ComparisonChartData {
  coins: Array<{
    coingeckoId: string;
    name: string;
    symbol: string;
    currentPrice: number;
    priceChangePercentage24h: number;
    marketCap: number;
    totalVolume: number;
    marketCapRank: number;
    image?: string;
    historical?: {
      timeframe: string;
      prices: Array<{
        timestamp: number;
        price: number;
      }>;
      volumes?: Array<{
        timestamp: number;
        volume: number;
      }>;
    };
  }>;
  timeframe: string;
  chartType?: string;
}

export interface ComponentData {
  type: 'price_card' | 'comparison_chart';
  data: PriceCardData | ComparisonChartData;
}
