/**
 * Unified provider component that simplifies setup of both ConnectorKit and Armadura
 * 
 * Provides three usage modes:
 * 1. Full integration: ConnectorKit + Armadura
 * 2. Armadura standalone: Just Armadura (bring your own wallet UI)
 * 3. ConnectorKit standalone: Just ConnectorKit (no protocol features)
 */

'use client'

import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { CreateUnifiedConfigOptions } from '../config/unified-config'
import { createUnifiedConfig } from '../config/unified-config'
import { ArmaProvider } from '../core/arma-provider'
import type { Provider } from '../core/provider'

export interface UnifiedProviderProps {
  children: ReactNode
  
  /** Application name (required if using ConnectorKit) */
  appName?: string
  
  /** Application URL */
  appUrl?: string
  
  /** Network to connect to (single source of truth) */
  network?: string
  
  /** Custom RPC URL (overrides network default) */
  rpcUrl?: string
  
  /** Enable automatic wallet reconnection */
  autoConnect?: boolean
  
  /** Armadura protocol providers (swap, lending, etc.) */
  providers?: Provider[]
  
  /** 
   * Connector integration mode:
   * - 'auto': Auto-detect ConnectorKit (default if appName provided)
   * - 'manual': Manually pass connector (not yet implemented)
   * - 'none': Standalone Armadura (no ConnectorKit)
   */
  connectorMode?: 'auto' | 'manual' | 'none'
  
  /** Enable Mobile Wallet Adapter (requires ConnectorKit) */
  enableMobile?: boolean
  
  /** Enable debug logging */
  debug?: boolean
  
  /** React Query client (optional) */
  queryClient?: QueryClient
}

/**
 * Unified provider that configures both ConnectorKit and Armadura with a single config
 * 
 * @example
 * // Full integration with ConnectorKit
 * <UnifiedArmaProvider
 *   appName="My App"
 *   network="mainnet"
 *   enableMobile={true}
 *   providers={[createProvider({ swap: [createJupiter()] })]}
 * >
 *   {children}
 * </UnifiedArmaProvider>
 * 
 * @example
 * // Standalone Armadura (no wallet UI)
 * <UnifiedArmaProvider
 *   network="mainnet"
 *   connectorMode="none"
 *   providers={[createProvider({ swap: [createJupiter()] })]}
 * >
 *   {children}
 * </UnifiedArmaProvider>
 */
export function UnifiedArmaProvider({
  children,
  appName,
  appUrl,
  network,
  rpcUrl,
  autoConnect = true,
  providers,
  connectorMode,
  enableMobile = true,
  debug,
  queryClient,
}: UnifiedProviderProps) {
  // Determine connector mode
  const actualConnectorMode = connectorMode || (appName ? 'auto' : 'none')
  
  // Create unified config
  const configOptions: CreateUnifiedConfigOptions = {
    appName,
    appUrl,
    network,
    rpcUrl,
    autoConnect,
    providers,
    enableConnector: actualConnectorMode !== 'none',
    enableMobile,
    debug,
  }
  
  const config = createUnifiedConfig(configOptions)
  
  // If ConnectorKit is enabled, try to load it
  if (actualConnectorMode !== 'none' && config.connector) {
    try {
      // Try to dynamically import ConnectorKit
      // This allows the package to work without ConnectorKit installed
      const ConnectorKit = require('@connector-kit/connector')
      
      if (ConnectorKit?.AppProvider && ConnectorKit?.getDefaultConfig && ConnectorKit?.getDefaultMobileConfig) {
        const connectorConfig = ConnectorKit.getDefaultConfig({
          appName: config.connector.appName,
          appUrl: config.connector.appUrl,
          network: config.connector.network,
          enableMobile: config.connector.enableMobile,
          debug: config.connector.debug,
        })
        
        const mobileConfig = config.mobile ? ConnectorKit.getDefaultMobileConfig({
          appName: config.mobile.appName,
          appUrl: config.mobile.appUrl,
          network: config.mobile.network,
        }) : undefined
        
        return (
          <ConnectorKit.AppProvider connectorConfig={connectorConfig} mobile={mobileConfig}>
            <ArmaProvider 
              config={config.armadura} 
              queryClient={queryClient}
              useConnector="auto"
            >
              {children}
            </ArmaProvider>
          </ConnectorKit.AppProvider>
        )
      }
    } catch (error) {
      // ConnectorKit not available
      if (debug) {
        console.warn(
          '[Armadura] ConnectorKit integration requested but @connector-kit/connector is not installed. ' +
          'Install it with: bun add @connector-kit/connector'
        )
      }
    }
  }
  
  // Fallback: Standalone Armadura mode
  return (
    <ArmaProvider 
      config={config.armadura} 
      queryClient={queryClient}
      useConnector={null}
    >
      {children}
    </ArmaProvider>
  )
}

// Export with multiple names for convenience
export { UnifiedArmaProvider as ArmaduraProvider }
export { UnifiedArmaProvider as SolanaProvider }

