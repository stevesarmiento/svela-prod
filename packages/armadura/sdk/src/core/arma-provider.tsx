'use client'

import React from 'react'
import type { ReactNode } from 'react'
import { ArmaClientProvider, useArmaClient } from './arma-client-provider'
import type { ConnectorHook } from '../types/connector'
import type { ArmaWebClientConfig } from './arma-web-client'
import type { SolanaConfig } from '../config/create-config'
import type { QueryClient } from '@tanstack/react-query'
import { EnhancedClusterProvider, type EnhancedClusterConfig } from '../context/enhanced-cluster-provider'
import { createAutoConnectorHook, isConnectorKitAvailable } from '../compat/connector-detection'

export type ArmaProviderProps = {
  children: ReactNode
  config: ArmaWebClientConfig | SolanaConfig
  queryClient?: QueryClient
  /** 
   * Connector hook for wallet integration
   * - Pass a hook (e.g., useConnectorClient) to use specific connector
   * - Set to 'auto' to auto-detect ConnectorKit
   * - Set to null or undefined to run standalone (no wallet UI)
   */
  useConnector?: ConnectorHook | 'auto' | null
  /** Enhanced cluster configuration using wallet-ui */
  enhancedCluster?: EnhancedClusterConfig
}

/**
 * The primary ArmaProvider.
 *
 * Supports three modes:
 * 1. Manual connector: Pass useConnector hook (e.g., useConnectorClient)
 * 2. Auto-detect: Set useConnector='auto' to auto-detect ConnectorKit
 * 3. Standalone: Set useConnector=null or undefined for custom wallet UI
 */
export function ArmaProvider({ children, config, queryClient, useConnector, enhancedCluster }: ArmaProviderProps) {
  // Determine which connector hook to use
  const actualConnectorHook = React.useMemo(() => {
    if (useConnector === 'auto') {
      // Auto-detect mode
      return createAutoConnectorHook()
    }
    if (useConnector === null || useConnector === undefined) {
      // Standalone mode - no connector
      return () => null
    }
    // Manual mode - use provided hook
    return useConnector
  }, [useConnector])
  
  const connector = actualConnectorHook()
  
  // Warn if auto-detect mode is requested but ConnectorKit is not available
  React.useEffect(() => {
    if (useConnector === 'auto' && !isConnectorKitAvailable()) {
      console.warn(
        '[Armadura] Auto-detect mode requested but ConnectorKit is not available. ' +
        'Make sure to wrap your app with ConnectorProvider from @connector-kit/connector.'
      )
    }
  }, [useConnector])
  
  const merged: ArmaWebClientConfig = { ...config, connector } as ArmaWebClientConfig
  
  if (enhancedCluster) {
    const enhancedConfig = {
      ...enhancedCluster,
      network: enhancedCluster.network || merged.network || 'mainnet',
      rpcUrl: enhancedCluster.rpcUrl || merged.rpcUrl
    }
    
    return (
      <EnhancedClusterProvider config={enhancedConfig}>
        <ArmaClientProvider config={merged} queryClient={queryClient}>
          {children}
        </ArmaClientProvider>
      </EnhancedClusterProvider>
    )
  }
  
  return (
    <ArmaClientProvider config={merged} queryClient={queryClient}>
      {children}
    </ArmaClientProvider>
  )
}

// ===== BACKWARD COMPATIBLE HOOKS =====

/**
 * A compatibility wrapper for the old useArmaConfig hook.
 *
 * @deprecated Use useArmaClient instead.
 */
export function useArmaConfig() {
  const client = useArmaClient()
  return client.config
}

/**
 * A compatibility wrapper for the old useArmaWallet hook.
 *
 * @deprecated Use useArmaClient instead.
 */
export function useArmaWallet() {
  const client = useArmaClient()
  return client.wallet
}

/**
 * A compatibility wrapper for the old useArmaConnection hook.
 *
 * @deprecated Use useArmaClient instead.
 */
export function useArmaConnection() {
  const client = useArmaClient()
  // Return cluster info as connection-like object for backward compatibility
  return client.cluster
}

// Re-export the primary hook
export { useArmaClient }