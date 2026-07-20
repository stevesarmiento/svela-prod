// For CoinGecko API responses (used in watchlist)
export interface CoinData {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  image: {
    small: string;
  };
  market_data: {
    current_price: {
      usd: number;
    };
    total_volume: {
      usd: number;
    };
    price_change_percentage_24h: number;
    market_cap: {
      usd: number;
    };
    total_supply: number | null;
    circulating_supply: number;
    max_supply: number | null;
  };
}

export interface CoinMarketData {
  id: string; // CoinGecko ID
  name: string;
  symbol: string;
  slug: string;
  image?: string; // CoinGecko image URL
  sparkline7d?: ReadonlyArray<number>;
  /** Market cap rank; null = unranked/unknown (never coalesce to 0). */
  cmc_rank: number | null;
  circulating_supply: number;
  max_supply: number | null;
  quote: {
    USD: {
      /**
       * null = no data (render "—", exclude from aggregates).
       * Never coalesce missing values to 0 — a $0 price and "no price yet"
       * are different facts and filters/P&L must not conflate them.
       */
      price: number | null;
      volume_24h: number | null;
      market_cap: number | null;
      percent_change_24h: number | null;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
      percent_change_60d?: number;
      percent_change_90d?: number;
    };
  };
  fundingRate?: number | null;
}

// Legacy CoinMarketCap types removed - use CoinMarketData for current data needs

export interface LiquidationData {
  symbol: string;
  side: "long" | "short";
  price: number;
  quantity: number;
  liquidation_price: number;
  time: number;
  usd_value?: number;
}

export interface LiquidationResponse {
  data: LiquidationData[];
  status: {
    error_code: number;
    error_message: string;
  };
}

// Legacy CoinMarketCap OHLCV types removed - use CoinGecko market chart data instead
