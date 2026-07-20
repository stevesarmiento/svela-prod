import type { CoinMarketData } from "@/types/coins";

/**
 * The row shape shared by `/api/internal/markets/top` and smart-screener
 * `rows` — one mapper for both (previously duplicated 3×).
 */
export interface ScreenerMarketRowLike {
  coingeckoId: string;
  symbol: string;
  name: string;
  image: string;
  currentPrice?: number;
  marketCap?: number;
  marketCapRank?: number;
  totalVolume?: number;
  priceChangePercentage24h?: number;
  updatedAt?: number;
}

/**
 * NULL-PRESERVING: missing upstream numerics stay null so "no data" is
 * distinguishable from a real zero. Formatters render null as "—"; aggregates
 * must EXCLUDE null, never treat it as 0.
 */
export function toCoinMarketData(row: ScreenerMarketRowLike): CoinMarketData {
  return {
    id: row.coingeckoId,
    name: row.name,
    symbol: row.symbol,
    slug: row.coingeckoId,
    image: row.image,
    sparkline7d: undefined,
    cmc_rank: row.marketCapRank ?? null,
    circulating_supply: 0,
    max_supply: null,
    quote: {
      USD: {
        price: row.currentPrice ?? null,
        volume_24h: row.totalVolume ?? null,
        market_cap: row.marketCap ?? null,
        percent_change_24h: row.priceChangePercentage24h ?? null,
        percent_change_1h: undefined,
        percent_change_7d: undefined,
        percent_change_30d: undefined,
        percent_change_60d: undefined,
        percent_change_90d: undefined,
      },
    },
    fundingRate: null,
  };
}
