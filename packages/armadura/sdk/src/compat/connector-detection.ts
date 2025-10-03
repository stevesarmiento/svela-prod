/**
 * Auto-detection utilities for ConnectorKit integration
 * 
 * Allows Armadura to automatically detect and use ConnectorKit when available,
 * without requiring manual wiring
 */

import type { GenericConnectorClient } from '../types/connector'

/**
 * Detect if ConnectorKit is available in the current environment
 * Returns the connector client if found, null otherwise
 */
export function detectConnectorKit(): any | null {
  if (typeof window === 'undefined') return null
  
  try {
    // Check for global ConnectorKit client
    const globalClient = (window as any).__connectorClient
    if (globalClient) {
      return globalClient
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Create a React hook that auto-detects ConnectorKit
 * Returns null if ConnectorKit is not available
 * 
 * @example
 * const useAutoConnector = createAutoConnectorHook()
 * <ArmaProvider useConnector={useAutoConnector} />
 */
export function createAutoConnectorHook(): () => GenericConnectorClient | null {
  return function useAutoConnector(): GenericConnectorClient | null {
    // Only attempt detection on client-side
    if (typeof window === 'undefined') return null
    
    try {
      // Dynamic import to avoid bundling React if not needed
      const { useState, useEffect, useSyncExternalStore } = require('react')
      
      const [client] = useState(() => detectConnectorKit())
      
      if (!client) return null
      
      // Subscribe to ConnectorKit state changes
      const state = useSyncExternalStore(
        (callback: () => void) => {
          if (!client?.subscribe) return () => {}
          return client.subscribe(callback)
        },
        () => client?.getSnapshot?.() ?? null,
        () => client?.getSnapshot?.() ?? null
      )
      
      // Return null if not connected or no state
      if (!state) return null
      
      // Wrap in adapter format
      return {
        getState: () => {
          const snapshot = client.getSnapshot?.() ?? {}
          return {
            connected: snapshot.connected ?? false,
            connecting: snapshot.connecting ?? false,
            selectedWallet: snapshot.selectedWallet ?? null,
            selectedAccount: snapshot.selectedAccount ?? null,
            accounts: snapshot.accounts ?? [],
            ...snapshot
          }
        },
        subscribe: (callback: (state: any) => void) => {
          if (!client?.subscribe) return () => {}
          return client.subscribe((state: any) => {
            const genericState = {
              connected: state.connected ?? false,
              connecting: state.connecting ?? false,
              selectedWallet: state.selectedWallet ?? null,
              selectedAccount: state.selectedAccount ?? null,
              accounts: state.accounts ?? [],
              ...state
            }
            callback(genericState)
          })
        },
        connect: async (wallet?: any) => {
          if (wallet?.name && client?.select) {
            await client.select(wallet.name)
          }
        },
        disconnect: async () => {
          if (client?.disconnect) {
            await client.disconnect()
          }
        }
      }
    } catch {
      return null
    }
  }
}

/**
 * Check if ConnectorKit is available and properly configured
 */
export function isConnectorKitAvailable(): boolean {
  return detectConnectorKit() !== null
}

