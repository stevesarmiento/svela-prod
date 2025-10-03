/**
 * Auto-detection utilities for ConnectorKit integration
 * 
 * Allows Armadura to automatically detect and use ConnectorKit when available,
 * without requiring manual wiring
 */

import { useState, useEffect, useSyncExternalStore, useMemo, useCallback } from 'react'
import type { GenericConnectorClient } from '../types/connector'

// Stable empty snapshot to prevent infinite re-renders
const EMPTY_SNAPSHOT = {}

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
 * Create a React hook that auto-detects ConnectorKit with retry logic
 * and properly subscribes to state changes using useSyncExternalStore
 * 
 * Handles timing issues where ConnectorKit might set __connectorClient 
 * in a useEffect after initial render, and ensures React re-renders when
 * ConnectorKit state changes
 * 
 * @example
 * const useAutoConnector = createAutoConnectorHook()
 * <ArmaProvider useConnector={useAutoConnector} />
 */
export function createAutoConnectorHook(): () => GenericConnectorClient | null {
  return function useAutoDetectedConnector(): GenericConnectorClient | null {
    // Only attempt detection on client-side
    if (typeof window === 'undefined') return null
    
    try {
      // Detect connector on mount with retry logic
      const [connectorClient, setConnectorClient] = useState(() => detectConnectorKit())
      
      // Poll for connector client if not found immediately
      useEffect(() => {
        if (!connectorClient) {
          let attempts = 0
          const maxAttempts = 20 // 2 seconds total (20 * 100ms)
          
          const tryDetect = () => {
            const detected = detectConnectorKit()
            if (detected) {
              setConnectorClient(detected)
              return true
            }
            return false
          }
          
          // Retry with intervals
          const interval = setInterval(() => {
            attempts++
            if (tryDetect() || attempts >= maxAttempts) {
              clearInterval(interval)
            }
          }, 100)
          
          return () => clearInterval(interval)
        }
      }, [connectorClient])
      
      // ✅ CRITICAL FIX: Call all hooks unconditionally (Rules of Hooks)
      // Subscribe to connector state if client exists
      const connectorState = useSyncExternalStore(
        useCallback((callback: () => void) => {
          if (!connectorClient?.subscribe) return () => {}
          return connectorClient.subscribe(callback)
        }, [connectorClient]),
        useCallback(() => {
          // Return stable reference to prevent infinite re-renders
          return connectorClient?.getSnapshot?.() ?? EMPTY_SNAPSHOT
        }, [connectorClient]),
        () => EMPTY_SNAPSHOT  // SSR snapshot must also be stable
      )
      
      // Return adapter that matches GenericConnectorClient interface
      // Re-create when state changes to trigger re-renders in consuming components
      const adapter = useMemo(() => {
        if (!connectorClient) return null
        
        return {
          getState: () => {
            const snapshot = connectorClient.getSnapshot?.() ?? {}
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
            if (!connectorClient?.subscribe) return () => {}
            return connectorClient.subscribe((state: any) => {
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
            if (wallet?.name && connectorClient?.select) {
              await connectorClient.select(wallet.name)
            }
          },
          disconnect: async () => {
            if (connectorClient?.disconnect) {
              await connectorClient.disconnect()
            }
          }
        }
      }, [connectorClient, connectorState]) // ✅ Re-create when state changes
      
      return adapter
    } catch (error) {
      console.error('[Armadura] Auto-detection error:', error)
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

