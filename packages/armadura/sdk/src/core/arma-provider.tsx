'use client'

import React from 'react'
import type { ReactNode } from 'react'
import { ArmaClientProvider, useArmaClient } from './arma-client-provider'
import type { ConnectorHook } from '../types/connector'
import type { ArmaWebClientConfig } from './arma-web-client'
import type { SolanaConfig } from '../config/create-config'
import type { QueryClient } from '@tanstack/react-query'

export type ArmaProviderProps = {
  children: ReactNode
  config: ArmaWebClientConfig | SolanaConfig
  queryClient?: QueryClient
  useConnector: ConnectorHook
}

/**
 * The primary ArmaProvider.
 *
 * This component now wraps the ArmaClientProvider, which contains the new
 * performant state management logic. The hooks exported from this file
 * are now compatibility wrappers around the new useArmaClient hook.
 * 
 * @param useConnector - Hook that returns a connector client (e.g., useConnectorClient from @armadura/connector or @connector-kit/connector)
 */
export function ArmaProvider({ children, config, queryClient, useConnector }: ArmaProviderProps) {
  const connector = useConnector()
  const merged: ArmaWebClientConfig = { ...config, connector } as ArmaWebClientConfig
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
