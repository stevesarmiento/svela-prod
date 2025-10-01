// Re-export all providers for centralized access
// This allows: import { createJupiter, createKamino } from '@armadura/providers'

// Jupiter provider
export { 
  createJupiter,
  type JupiterConfig,
  type JupiterQuoteResponse,
  type JupiterSwapResponse,
  getJupiterTokens 
} from '@armadura/jupiter'

// Future providers will be added here:
// export { createKamino, type KaminoConfig } from '@arma/kamino'
// export { createRaydium, type RaydiumConfig } from '@arma/raydium'
// export { createOrcaWhirlpools, type OrcaConfig } from '@arma/orca'

// Import locally for internal use
import { createJupiter } from '@armadura/jupiter'

// Provider registry type for future extensibility
export interface ProviderRegistry {
  jupiter: ReturnType<typeof createJupiter>
  // kamino: ReturnType<typeof createKamino>
  // raydium: ReturnType<typeof createRaydium>
  // orca: ReturnType<typeof createOrcaWhirlpools>
}

// Helper type for all available provider names
export type ProviderName = keyof ProviderRegistry

// Helper to create multiple providers at once (future enhancement)
export interface CreateProvidersConfig {
  jupiter?: Parameters<typeof createJupiter>[0]
  // kamino?: Parameters<typeof createKamino>[0]
  // raydium?: Parameters<typeof createRaydium>[0]
  // orca?: Parameters<typeof createOrcaWhirlpools>[0]
}

export function createProviders(config: CreateProvidersConfig): Partial<ProviderRegistry> {
  const providers: Partial<ProviderRegistry> = {}
  
  if (config.jupiter) {
    providers.jupiter = createJupiter(config.jupiter)
  }
  
  // Future providers:
  // if (config.kamino) {
  //   providers.kamino = createKamino(config.kamino)
  // }
  
  return providers
}