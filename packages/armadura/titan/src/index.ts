import type { Address, Lamports, Instruction as SolanaInstruction } from '@solana/kit'
import { TitanClient, type TitanClientConfig } from './client.js'
import type {
  SwapQuoteRequest,
  SwapQuotes,
  SwapRoute,
  Instruction,
  Pubkey,
} from './types.js'

// Re-declare SDK types locally to avoid build issues
// TODO: Import from '@armadura/sdk' once TypeScript resolution is fixed
export interface SwapQuote {
  provider: string
  inputMint: Address
  outputMint: Address
  inputAmount: Lamports
  outputAmount: Lamports
  priceImpact: number
  fees: Lamports
  route?: any
  effectiveSlippageBps?: number
}

export interface SwapParams {
  inputMint: Address
  outputMint: Address
  amount: Lamports
  slippageBps?: number
}

export interface PrebuiltTransaction {
  wireTransaction: Uint8Array
}

export type SwapBuild =
  | { kind: 'instructions'; instructions: SolanaInstruction[] }
  | { kind: 'prebuilt'; transaction: PrebuiltTransaction }

export interface SwapProvider {
  name: string
  quote(params: SwapParams): Promise<SwapQuote>
  build(params: { quote: SwapQuote; userPublicKey: string; capabilities?: { walletSupportsVersioned?: boolean } }): Promise<SwapBuild>
  isTokenSupported(mint: Address): boolean
}

export interface TitanConfig extends Omit<TitanClientConfig, 'apiKey'> {
  apiKey?: string
  slippageBps?: number
  intervalMs?: number
  numQuotes?: number
  onlyDirectRoutes?: boolean
  excludeDexes?: string[]
  providers?: string[]
  addSizeConstraint?: boolean
  sizeConstraint?: number
  accountsLimitTotal?: number
  accountsLimitWritable?: number
  closeInputTokenAccount?: boolean
  createOutputTokenAccount?: boolean
  feeBps?: number
  quoteTimeoutMs?: number
  strategy?: 'best-price' | 'lowest-fees' | 'fastest'
}

export * from './types.js'
export { TitanClient } from './client.js'

/**
 * Convert Titan Pubkey (Uint8Array) to base58 Address string
 */
function pubkeyToAddress(pubkey: Pubkey): Address {
  // For now, convert to hex string as placeholder
  // In production, you'd use @solana/web3.js PublicKey.toBase58()
  return Buffer.from(pubkey).toString('base64') as Address
}

/**
 * Convert base58 Address string to Titan Pubkey (Uint8Array)
 */
function addressToPubkey(address: string): Pubkey {
  // For now, convert from hex
  // In production, you'd use @solana/web3.js PublicKey.toBytes()
  return Buffer.from(address, 'base64')
}

/**
 * Convert Titan Instruction to Solana Instruction
 */
function convertInstruction(titanIx: Instruction): SolanaInstruction {
  return {
    programAddress: pubkeyToAddress(titanIx.p),
    accounts: titanIx.a.map((acc) => ({
      address: pubkeyToAddress(acc.p),
      role: acc.w
        ? (acc.s ? 3 : 2)  // AccountRole.WRITABLE_SIGNER : WRITABLE
        : (acc.s ? 1 : 0), // AccountRole.READONLY_SIGNER : READONLY
    })),
    data: titanIx.d,
  } as SolanaInstruction
}

/**
 * Select best quote from multiple providers
 */
function selectBestQuote(
  quotes: Record<string, SwapRoute>,
  strategy: TitanConfig['strategy'] = 'best-price'
): { provider: string; route: SwapRoute } | null {
  const entries = Object.entries(quotes)
  if (entries.length === 0) return null

  let best = entries[0]
  if (!best) return null

  for (const entry of entries.slice(1)) {
    const [, route] = entry
    const [, bestRoute] = best

    switch (strategy) {
      case 'best-price':
        if (route.outAmount > bestRoute.outAmount) {
          best = entry
        }
        break
      case 'lowest-fees': {
        const routeFees = route.steps.reduce((sum: number, s) => sum + (s.feeAmount || 0), 0)
        const bestFees = bestRoute.steps.reduce((sum: number, s) => sum + (s.feeAmount || 0), 0)
        if (routeFees < bestFees) {
          best = entry
        }
        break
      }
      case 'fastest':
        if ((route.timeTakenNs || Infinity) < (bestRoute.timeTakenNs || Infinity)) {
          best = entry
        }
        break
    }
  }

  return { provider: best[0], route: best[1] }
}

export function createTitan(config: TitanConfig = {}): SwapProvider {
  // Quote cache to store latest quotes
  let latestQuotes: SwapQuotes | null = null
  let currentStreamId: number | null = null

  return {
    name: 'titan',

    async quote(params: SwapParams): Promise<SwapQuote> {
      console.log('[Titan] quote() called with params:', params)
      const slippageBps = params.slippageBps ?? config.slippageBps ?? 50

      // Use REST API endpoint instead of direct WebSocket connection
      console.log('[Titan] Fetching quote via REST API...')

      try {
        const response = await fetch('/api/titan/quote', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            amount: params.amount.toString(),
            slippageBps,
            userPublicKey: '11111111111111111111111111111111',
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `API request failed: ${response.status}`)
        }

        const quotes = await response.json() as SwapQuotes
        console.log('[Titan] Received quotes from API:', Object.keys(quotes.quotes))
        latestQuotes = quotes

        // Select best quote based on strategy
        const bestQuote = selectBestQuote(quotes.quotes, config.strategy)

        if (!bestQuote) {
          throw new Error('No quotes available')
        }

        const { provider, route } = bestQuote

        // Calculate total fees
        const totalFees = route.steps.reduce(
          (sum: bigint, step) => sum + BigInt(step.feeAmount || 0),
          BigInt(0)
        )

        // Calculate price impact (estimate from slippage)
        const priceImpact = route.slippageBps / 100 // Convert bps to percentage

        return {
          provider: `titan:${provider}`,
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          inputAmount: params.amount,
          outputAmount: BigInt(route.outAmount) as Lamports,
          priceImpact,
          fees: totalFees as Lamports,
          route: { quotes, selectedProvider: provider, selectedRoute: route },
          effectiveSlippageBps: route.slippageBps,
        }
      } catch (error) {
        console.error('[Titan] Quote fetch failed:', error)
        throw error
      }
    },

    async build({ quote, userPublicKey, capabilities }: { quote: SwapQuote; userPublicKey: string; capabilities?: { walletSupportsVersioned?: boolean } }): Promise<SwapBuild> {
      const routeData = quote.route as {
        quotes: SwapQuotes
        selectedProvider: string
        selectedRoute: SwapRoute
      }

      const route = routeData.selectedRoute

      // If provider returned a prebuilt transaction, use it
      if (route.transaction) {
        return {
          kind: 'prebuilt',
          transaction: {
            wireTransaction: route.transaction,
          },
        }
      }

      // Otherwise, convert instructions
      if (route.instructions && route.instructions.length > 0) {
        const instructions = route.instructions.map(convertInstruction)

        return {
          kind: 'instructions',
          instructions,
        }
      }

      throw new Error('No transaction or instructions provided by Titan')
    },

    isTokenSupported(mint: Address): boolean {
      // Titan supports a wide range of tokens
      // Could implement venue/token list check here if needed
      return true
    },
  }
}

/**
 * Public helper to get Titan venue information
 */
export async function getTitanVenues(apiKey?: string): Promise<string[]> {
  const key = apiKey || process.env.TITAN_API_KEY
  if (!key) {
    throw new Error('Titan API key is required')
  }

  const client = new TitanClient({ apiKey: key })

  try {
    const response = await client.request<{ GetVenues: { labels: string[] } }>({
      GetVenues: { includeProgramIds: false },
    })

    if ('GetVenues' in response) {
      return response.GetVenues.labels
    }

    return []
  } finally {
    client.close()
  }
}

/**
 * Public helper to get Titan provider information
 */
export async function getTitanProviders(apiKey?: string): Promise<Array<{
  id: string
  name: string
  kind: string
}>> {
  const key = apiKey || process.env.TITAN_API_KEY
  if (!key) {
    throw new Error('Titan API key is required')
  }

  const client = new TitanClient({ apiKey: key })

  try {
    const response = await client.request<{ ListProviders: Array<{ id: string; name: string; kind: string }> }>({
      ListProviders: { includeIcons: false },
    })

    if ('ListProviders' in response) {
      return response.ListProviders
    }

    return []
  } finally {
    client.close()
  }
}
