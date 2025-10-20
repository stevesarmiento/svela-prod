import type { SwapProvider, SwapParams, SwapQuote, SwapBuild } from '@armadura/sdk'

export interface JupiterQuoteResponse {
  outAmount: string
  priceImpactPct?: string
  routePlan?: Array<{ swapInfo?: { feeAmount?: string } }>
  slippageBps?: number
  [key: string]: unknown
}

export interface JupiterSwapResponse {
  swapTransaction: string
  [key: string]: unknown
}

export interface JupiterConfig {
  apiUrl?: string
  slippageBps?: number
  onlyDirectRoutes?: boolean
  excludeDexes?: string[]
  asLegacyTransaction?: boolean | 'auto'
  walletSupportsVersioned?: boolean
  maxAccounts?: number
  platformFeeBps?: number
  computeUnitPriceMicroLamports?: number
  dynamicSlippage?: boolean
  dynamicComputeUnitLimit?: boolean
  computeUnitLimit?: number
  timeoutMs?: number
  retries?: number
  debug?: boolean
  corsProxy?: boolean | string
}

export function createJupiter(config?: JupiterConfig): SwapProvider

export function getJupiterTokens(): Promise<Array<{ 
  address: string
  symbol: string
  decimals: number
  logoURI?: string 
}>>

