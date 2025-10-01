/**
 * @armadura/sdk - MVP Export
 * 
 * Lean MVP bundle with only the hooks used in demo components.
 * Bundle size: ~15KB (vs 90KB for full package)
 * 
 * Used hooks based on demo component analysis:
 * - useBalance (used in all 3 demos)
 * - useAirdrop (used in standard-wallet-demo)
 * - useCluster (used in standard-wallet-demo)
 * - useWalletAddress (used in standard-wallet-demo)
 * - useTransaction (used in transaction-demo)
 * - useSwap (used in swap-demo) 
 * - useArmaClient (used in transaction-demo and swap-demo)
 */

// ===== CORE PROVIDERS =====
export { ArmaProvider } from './core/arma-provider'
export { useArmaClient } from './core/arma-client-provider'

// ===== TYPES =====
export type { 
  GenericConnectorClient, 
  GenericConnectorState, 
  GenericWallet, 
  GenericAccount,
  ConnectorHook
} from './types/connector'
export { hasDisconnect } from './types/connector'

// ===== COMPATIBILITY (DEPRECATED) =====
export { ArmaturaProvider } from './compat/armadura-provider'

// ===== ESSENTIAL HOOKS (MVP) =====
export { useBalance } from './hooks/use-balance'
export type { UseBalanceOptions, UseBalanceReturn } from './hooks/use-balance'

export { useAirdrop } from './hooks/use-airdrop'

export { useCluster } from './hooks/use-cluster'

export { useWalletAddress } from './hooks/use-wallet-address'

export { useTransaction } from './hooks/use-transaction'

export { useSwap } from './hooks/use-swap'

// ===== STANDARD WALLETS =====
export { useStandardWallets } from './hooks/use-standard-wallets'
export type { UseStandardWalletsOptions, UseStandardWalletsReturn, StandardWalletInfo } from './hooks/use-standard-wallets'

// ===== PROVIDER SYSTEM =====
export { createProvider } from './core/provider'
export type { Provider } from './core/provider'

// ===== CONFIGURATION =====
export type { SolanaConfig } from './config/create-config'

// ===== WEB CLIENT (ADVANCED) =====
export { ArmaWebClient } from './core/arma-web-client'
export type { ArmaWebClientConfig, ArmaWebClientState } from './core/arma-web-client'

// ===== LEGACY COMPATIBILITY =====
export { 
  useArmaConfig,
  useArmaWallet,
  useArmaConnection
} from './core/arma-provider'
