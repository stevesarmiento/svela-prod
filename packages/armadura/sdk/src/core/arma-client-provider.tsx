'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { QueryClient, QueryClientProvider, type QueryClient as RQClient } from '@tanstack/react-query'
import { ArmaWebClient, type ArmaWebClientConfig } from './arma-web-client'
import type { Address } from '@solana/kit'

// The context now only holds the client instance.
const ArmaClientContext = createContext<ArmaWebClient | null>(null)
ArmaClientContext.displayName = 'ArmaClientContext'

export interface ArmaClientSnapshot extends ReturnType<ArmaWebClient['getSnapshot']> {
  select: (walletName: string) => Promise<void>
  disconnect: () => Promise<void>
  selectAccount: (accountAddress: Address) => Promise<void>
}

export interface ArmaClientProviderProps {
  children: ReactNode
  config: ArmaWebClientConfig
  queryClient?: RQClient
}

/**
 * Provides an instance of ArmaWebClient to its children.
 * This is the root of the new, performant provider architecture.
 */
export function ArmaClientProvider({ children, config, queryClient }: ArmaClientProviderProps) {
  const qc = useMemo(() => queryClient ?? new QueryClient(), [queryClient])
  const clientRef = useRef<ArmaWebClient | null>(null)

  if (clientRef.current == null) {
    clientRef.current = new ArmaWebClient(config)
  }

  // Apply config updates without recreating the client instance
  useEffect(() => {
    clientRef.current?.updateConfig?.(config)
  }, [config, config.connector])

  // Cleanup wallet listeners on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.destroy?.()
    }
  }, [])

  return (
    <QueryClientProvider client={qc}>
      <ArmaClientContext.Provider value={clientRef.current}>
        {children}
      </ArmaClientContext.Provider>
    </QueryClientProvider>
  )
}

/**
 * The core hook for accessing the ArmaWebClient state.
 *
 * This hook uses useSyncExternalStore to subscribe to the ArmaWebClient's
 * state, ensuring that components only re-render when the state they
 * depend on actually changes. This is a significant performance
 * improvement over the previous context-based approach.
 */
export function useArmaClient(): ArmaClientSnapshot
export function useArmaClient<T>(selector: (s: ReturnType<ArmaWebClient['getSnapshot']>) => T): T
export function useArmaClient<T = ReturnType<ArmaWebClient['getSnapshot']>>(selector?: (s: ReturnType<ArmaWebClient['getSnapshot']>) => T) {
  const client = useContext(ArmaClientContext)

  if (!client) {
    throw new Error('useArmaClient must be used within an ArmaClientProvider')
  }

  const state = useSyncExternalStore(
    (onStoreChange) => client.subscribe(onStoreChange),
    () => client.getSnapshot(),
    () => client.getSnapshot()
  )

  if (selector) {
    return selector(state) as unknown as T
  }

  const snapshot: ArmaClientSnapshot = {
    ...state,
    select: client.select.bind(client),
    disconnect: client.disconnect.bind(client),
    selectAccount: client.selectAccount.bind(client),
  }
  return snapshot as unknown as T
}