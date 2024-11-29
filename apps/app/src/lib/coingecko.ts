interface Coin {
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number;
    thumb: string;
    large: string;
  }
  
  interface CoinDetail {
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
  
  export async function searchCoins(query: string): Promise<Coin[]> {
    try {
      const response = await fetch(`/api/coingecko?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        const error = await response.json();
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a moment.');
        }
        if (response.status === 503) {
          throw new Error('CoinGecko API is temporarily unavailable.');
        }
        throw new Error(error.error || 'Failed to search coins');
      }
      
      const data = await response.json();
      return data.coins || [];
    } catch (error) {
      console.error('Search coins error:', error);
      throw error;
    }
  }
  
  export async function getCoinData(id: string): Promise<CoinDetail> {
    try {
      const response = await fetch(`/api/coingecko?id=${encodeURIComponent(id)}`);
      const contentType = response.headers.get('content-type');
      
      if (!response.ok) {
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch coin data');
        } else {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to fetch coin data');
        }
      }
      
      return response.json();
    } catch (error) {
      console.error('Get coin data error:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch coin data');
    }
  }