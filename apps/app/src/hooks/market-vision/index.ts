'use client'

import { useMemo } from 'react'
import type { MarketVisionBConfig, MarketVisionBResult, OHLCVDataPoint } from './market-vision-config'
import { DEFAULT_MARKET_VISION_CONFIG } from './market-vision-config'
import { computeMarketVisionB } from './market-vision-compute'

export function useMarketVisionB(
  data: OHLCVDataPoint[],
  config?: Partial<MarketVisionBConfig>
): MarketVisionBResult {
  return useMemo(() => computeMarketVisionB(data, config), [data, config])
}

// Pure computation (no React) — use this from workers, tests, or server code.
export { computeMarketVisionB } from './market-vision-compute'

export type {
  MarketVisionBConfig,
  MarketVisionBResult,
  MarketVisionDivergences,
  MarketVisionEvents,
  MarketVisionEventPoint,
  MarketVisionPairedDivergence,
} from './market-vision-config'
export { DEFAULT_MARKET_VISION_CONFIG as defaultMarketVisionBConfig }

// Tolerance-pairing divergence engine (shared by RSI/WT/Stoch divergences)
export {
  findPairedDivergences,
  DEFAULT_DIVERGENCE_ENGINE_CONFIG,
  type DivergenceEngineConfig,
  type DivergenceType,
  type PairedDivergence,
} from './divergence-engine'

// Export RSI divergence detection functionality
export {
  getRSIDivergences,
  getAllRSIDivergences,
  type DivergencePoint,
  calculateStochasticIndicator,
  type StochasticConfig,
  type StochasticResult
} from './stochastic'

// Export Bollinger Bands functionality
export {
  calculateBollingerBands,
  type BollingerBandsConfig,
  type BollingerBandsResult,
  DEFAULT_BB_COLORS
} from './bollinger-bands'

// Export BBWP functionality
export {
  calculateBBWP,
  type BBWPConfig,
  type BBWPResult,
  DEFAULT_BBWP_CONFIG,
} from './bbwp'
