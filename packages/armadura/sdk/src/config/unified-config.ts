/**
 * Unified configuration for Armadura SDK
 * 
 * Provides a single config interface that can be used with or without ConnectorKit
 */

import type { Provider } from '../core/provider'
import type { SolanaNetwork, SolanaNetworkRpc } from '../utils/network'
import { normalizeNetwork, toRpcNetwork, getDefaultRpcUrl } from '../utils/network'

/**
 * Base configuration options for Armadura
 */
export interface ArmaConfigOptions {
  /** Network to connect to (accepts both 'mainnet' and 'mainnet-beta' formats) */
  network?: SolanaNetwork | SolanaNetworkRpc | string
  
  /** Custom RPC URL (overrides network default) */
  rpcUrl?: string
  
  /** Enable automatic wallet reconnection on page load */
  autoConnect?: boolean
  
  /** Armadura protocol providers (swap, lending, etc.) */
  providers?: Provider[]
  
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Configuration for ConnectorKit integration
 */
export interface ConnectorConfigOptions {
  /** Application name shown in wallet connection prompts */
  appName: string
  
  /** Application URL for wallet connection metadata */
  appUrl?: string
  
  /** Network to connect to (auto-translated to ConnectorKit format) */
  network?: SolanaNetwork | SolanaNetworkRpc | string
  
  /** Enable Mobile Wallet Adapter support */
  enableMobile?: boolean
  
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Mobile Wallet Adapter configuration
 */
export interface MobileConfigOptions {
  /** Application name */
  appName: string
  
  /** Application URL */
  appUrl?: string
  
  /** Network to connect to */
  network?: SolanaNetwork | SolanaNetworkRpc | string
}

/**
 * Complete unified configuration
 */
export interface UnifiedConfig {
  /** Armadura configuration */
  armadura: {
    network: SolanaNetwork
    rpcUrl: string
    autoConnect?: boolean
    providers?: Provider[]
    debug?: boolean
  }
  
  /** ConnectorKit configuration (optional) */
  connector?: {
    appName: string
    appUrl?: string
    network: SolanaNetworkRpc
    enableMobile?: boolean
    debug?: boolean
  }
  
  /** Mobile Wallet Adapter configuration (optional) */
  mobile?: {
    appName: string
    appUrl?: string
    network: SolanaNetworkRpc
  }
}

/**
 * Options for creating a unified configuration
 */
export interface CreateUnifiedConfigOptions {
  /** Application name (used for ConnectorKit if enabled) */
  appName?: string
  
  /** Application URL (used for ConnectorKit if enabled) */
  appUrl?: string
  
  /** Network to connect to (single source of truth) */
  network?: SolanaNetwork | SolanaNetworkRpc | string
  
  /** Custom RPC URL (overrides network default) */
  rpcUrl?: string
  
  /** Enable automatic wallet reconnection on page load */
  autoConnect?: boolean
  
  /** Armadura protocol providers (swap, lending, etc.) */
  providers?: Provider[]
  
  /** Enable ConnectorKit integration (requires appName) */
  enableConnector?: boolean
  
  /** Enable Mobile Wallet Adapter support (requires ConnectorKit) */
  enableMobile?: boolean
  
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Create a unified configuration that works across Armadura and ConnectorKit
 * 
 * @example
 * // Standalone Armadura (no wallet UI)
 * const config = createUnifiedConfig({
 *   network: 'mainnet',
 *   providers: [createProvider({ swap: [createJupiter()] })]
 * })
 * 
 * @example
 * // With ConnectorKit integration
 * const config = createUnifiedConfig({
 *   appName: 'My App',
 *   network: 'mainnet',
 *   enableConnector: true,
 *   enableMobile: true,
 *   providers: [createProvider({ swap: [createJupiter()] })]
 * })
 */
export function createUnifiedConfig(options: CreateUnifiedConfigOptions): UnifiedConfig {
  // Normalize network name (mainnet, devnet, testnet, localnet)
  const network = normalizeNetwork(options.network)
  
  // Get RPC URL (custom or default)
  const rpcUrl = options.rpcUrl || getDefaultRpcUrl(network)
  
  // Build Armadura config
  const armadura = {
    network,
    rpcUrl,
    autoConnect: options.autoConnect,
    providers: options.providers,
    debug: options.debug,
  }
  
  // Build ConnectorKit config if enabled
  const connector = options.enableConnector && options.appName ? {
    appName: options.appName,
    appUrl: options.appUrl,
    network: toRpcNetwork(network),
    enableMobile: options.enableMobile,
    debug: options.debug,
  } : undefined
  
  // Build Mobile config if enabled
  const mobile = options.enableConnector && options.enableMobile && options.appName ? {
    appName: options.appName,
    appUrl: options.appUrl,
    network: toRpcNetwork(network),
  } : undefined
  
  return {
    armadura,
    connector,
    mobile,
  }
}

/**
 * Create Armadura-only configuration (no ConnectorKit)
 * 
 * @example
 * const config = createArmaConfig({
 *   network: 'mainnet',
 *   providers: [createProvider({ swap: [createJupiter()] })]
 * })
 */
export function createArmaConfig(options: ArmaConfigOptions) {
  const network = normalizeNetwork(options.network)
  const rpcUrl = options.rpcUrl || getDefaultRpcUrl(network)
  
  return {
    network,
    rpcUrl,
    autoConnect: options.autoConnect,
    providers: options.providers,
    debug: options.debug,
  }
}

