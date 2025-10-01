'use client'

import React from 'react'
import type { ReactNode } from 'react'
import { ArmaClientProvider, useArmaClient } from './arma-client-provider'
import { useConnectorClient } from '@arma/connector'
import type { ArmaWebClientConfig } from './arma-web-client'
import type { SolanaConfig } from '../config/create-config'
import type { QueryClient } from '@tanstack/react-query'

export type ArmaProviderProps = {
  children: ReactNode
  config: ArmaWebClientConfig | SolanaConfig
  queryClient?: QueryClient
}

/**
 * The primary ArmaProvider.
 *
 * This component now wraps the ArmaClientProvider, which contains the new
 * performant state management logic. The hooks exported from this file
 * are now compatibility wrappers around the new useArmaClient hook.
 */
export function ArmaProvider({ children, config, queryClient }: ArmaProviderProps) {
  const connector = useConnectorClient()
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
export function useArmaConfig(): ArmaWebClientConfig {
  const { config } = useArmaClient()
  return config
}

/**
 * A compatibility wrapper for the old useWallet hook.
 *
 * @deprecated Use useArmaClient instead.
 */
export function useWallet() {
  const { wallet, select, disconnect } = useArmaClient()
  return { ...wallet, select, disconnect, connect: select }
}

/**
 * A compatibility wrapper for the old useNetwork hook.
 *
 * @deprecated Use useArmaClient instead.
 */
export function useNetwork() {
  const { network } = useArmaClient()
  return network
}

/**
 * A compatibility wrapper for the old useArma hook.
 *
 * @deprecated Use useArmaClient instead.
 */
export function useArma() {
  return useArmaClient()
}
