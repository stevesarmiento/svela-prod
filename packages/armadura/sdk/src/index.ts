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

// ===== UNIFIED PROVIDER (RECOMMENDED) =====
export { 
  UnifiedArmaProvider,
  ArmaduraProvider,
  SolanaProvider
} from './react/unified-provider'
export type { UnifiedProviderProps } from './react/unified-provider'

// ===== TYPES =====
export type { 
  GenericConnectorClient, 
  GenericConnectorState, 
  GenericWallet, 
  GenericAccount,
  WalletAccount,
  ConnectorHook
} from './types/connector'
export { hasDisconnect, getConnectorState } from './types/connector'

// ===== COMPATIBILITY (DEPRECATED) =====
export { ArmaturaProvider } from './compat/armadura-provider'

// ===== ADAPTERS =====
export { ConnectorKitAdapter, createConnectorKitAdapter } from './adapters/connector-kit-adapter'

// ===== AUTO-DETECTION =====
export { 
  detectConnectorKit,
  createAutoConnectorHook,
  isConnectorKitAvailable
} from './compat/connector-detection'

// ===== ESSENTIAL HOOKS (MVP) =====
export { useBalance } from './hooks/use-balance'
export type { UseBalanceOptions, UseBalanceReturn } from './hooks/use-balance'

export { useAirdrop } from './hooks/use-airdrop'
export type { UseAirdropReturn } from './hooks/use-airdrop'

export { useCluster } from './hooks/use-cluster'
export type { UseClusterReturn } from './hooks/use-cluster'

export { useEnhancedCluster } from './hooks/use-enhanced-cluster'

export { 
  EnhancedClusterProvider,
  createSolanaDevnet,
  createSolanaMainnet,
  createSolanaTestnet
} from './context/enhanced-cluster-provider'
export type { EnhancedClusterConfig } from './context/enhanced-cluster-provider'

export { 
  WalletUiClusterDropdown,
  useWalletUiCluster,
  type SolanaCluster
} from '@wallet-ui/react'

export { useWalletAddress } from './hooks/use-wallet-address'
export type { UseWalletAddressReturn } from './hooks/use-wallet-address'

export { useTransaction } from './hooks/use-transaction'
export type { UseTransactionOptions, UseTransactionReturn } from './hooks/use-transaction'

export { useSwap } from './hooks/use-swap'
export type { UseSwapOptions, UseSwapReturn } from './hooks/use-swap'

// ===== STANDARD WALLETS =====
export { useStandardWallets } from './hooks/use-standard-wallets'
export type { UseStandardWalletsOptions, UseStandardWalletsReturn, StandardWalletInfo } from './hooks/use-standard-wallets'

// ===== PROVIDER SYSTEM =====
export { createProvider } from './core/provider'
export type { 
  Provider,
  SwapProvider, 
  SwapParams, 
  SwapQuote, 
  SwapBuild,
  PrebuiltTransaction 
} from './core/provider'

// ===== CONFIGURATION =====
export type { SolanaConfig } from './config/create-config'

// ===== UNIFIED CONFIGURATION =====
export { 
  createUnifiedConfig,
  createArmaConfig
} from './config/unified-config'
export type {
  ArmaConfigOptions,
  ConnectorConfigOptions,
  MobileConfigOptions,
  UnifiedConfig,
  CreateUnifiedConfigOptions
} from './config/unified-config'

// ===== NETWORK UTILITIES =====
export {
  normalizeNetwork,
  toRpcNetwork,
  toClusterId,
  getDefaultRpcUrl,
  isMainnet,
  isDevnet,
  isTestnet,
  isLocalnet
} from './utils/network'
export type {
  SolanaNetwork,
  SolanaNetworkRpc,
  SolanaClusterId
} from './utils/network'

// ===== WEB CLIENT (ADVANCED) =====
export { ArmaWebClient } from './core/arma-web-client'
export type { ArmaWebClientConfig, ArmaWebClientState } from './core/arma-web-client'

// ===== LEGACY COMPATIBILITY =====
export { 
  useArmaConfig,
  useArmaWallet,
  useArmaConnection
} from './core/arma-provider'

// ===== UTILITIES =====
export { address } from '@solana/kit'
export type { Address } from '@solana/kit'
