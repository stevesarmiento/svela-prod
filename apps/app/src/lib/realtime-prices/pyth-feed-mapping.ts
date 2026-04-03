export type PythPriceSource = "pyth";

export interface PythFeedMapping {
  coingeckoId: string;
  source: PythPriceSource;
  /**
   * Hermes price feed id (hex, no 0x prefix).
   * Example for SOL/USD: ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
   */
  hermesFeedId: string;
}

/**
 * Curated mapping: CoinGecko ID -> Pyth feed id.
 * Expand iteratively as coverage grows.
 */
const PYTH_FEED_MAPPINGS: Record<string, PythFeedMapping> = {
  bitcoin: {
    coingeckoId: "bitcoin",
    source: "pyth",
    hermesFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  },
  ethereum: {
    coingeckoId: "ethereum",
    source: "pyth",
    hermesFeedId: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  },
  solana: {
    coingeckoId: "solana",
    source: "pyth",
    hermesFeedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  },
} as const;

export function getPythFeedMapping(coingeckoId: string): PythFeedMapping | null {
  const key = coingeckoId.trim();
  if (!key) return null;
  return PYTH_FEED_MAPPINGS[key] ?? null;
}

