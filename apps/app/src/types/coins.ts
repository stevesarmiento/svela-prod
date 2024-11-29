// For CoinGecko API responses (used in watchlist)
export interface CoinData {
  id: number
  name: string
  symbol: string
  slug: string
  image: {
    small: string
  }
  market_data: {
    current_price: {
      usd: number
    }
    price_change_percentage_24h: number
    market_cap: {
      usd: number
    }
  }
}

export interface CoinMarketData {
  id: number
  name: string
  symbol: string
  slug: string
  cmc_rank: number
  circulating_supply: number
  max_supply: number | null
  quote: {
    USD: {
      price: number
      volume_24h: number
      market_cap: number
      percent_change_24h: number
    }
  }
  historical?: HistoricalData;
}

export interface HistoricalQuote {
  timestamp: string;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
      market_cap: number;
      circulating_supply: number;
      total_supply: number;
      timestamp: string;
    }
  }
}

export interface HistoricalData {
  data: {
    id: number;
    name: string;
    symbol: string;
    is_active: number;
    is_fiat: number;
    quotes: HistoricalQuote[];
  };
  status: {
    timestamp: string;
    error_code: number;
    error_message: string;
    elapsed: number;
    credit_count: number;
    notice: string;
  };
}

export interface Coin {
  id: number;
  name: string;
  symbol: string;
  cmc_rank: number;
  logo: string;
  slug: string;
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      market_cap: number;
      volume_24h: number;
    };
  };
}

export interface CoinDetail extends Coin {
  description: string;
  logo: string;
  urls: {
    website: string[];
    technical_doc: string[];
    explorer: string[];
  };
  circulating_supply: number;
  max_supply: number | null;
  historical?: HistoricalData;
}