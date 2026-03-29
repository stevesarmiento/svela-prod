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
    total_volume: {
      usd: number
    }
    price_change_percentage_24h: number
    market_cap: {
      usd: number
    }
    total_supply: number | null
    circulating_supply: number
    max_supply: number | null
  }
}

export interface CoinMarketData {
  id: string // CoinGecko ID
  name: string
  symbol: string
  slug: string
  image?: string // CoinGecko image URL
  sparkline7d?: ReadonlyArray<number>
  cmc_rank: number // Market cap rank (using cmc_rank for backward compatibility)
  circulating_supply: number
  max_supply: number | null
  quote: {
    USD: {
      price: number
      volume_24h: number
      market_cap: number
      percent_change_24h: number
      percent_change_1h?: number
      percent_change_7d?: number
      percent_change_30d?: number
      percent_change_60d?: number
      percent_change_90d?: number
    }
  }
  fundingRate?: number | null
}

// Legacy CoinMarketCap types removed - use CoinMarketData for current data needs

export interface LiquidationData {
  symbol: string
  side: 'long' | 'short'
  price: number
  quantity: number
  liquidation_price: number
  time: number
  usd_value?: number
}

export interface LiquidationResponse {
  data: LiquidationData[]
  status: {
    error_code: number
    error_message: string
  }
}

// Legacy CoinMarketCap OHLCV types removed - use CoinGecko market chart data instead