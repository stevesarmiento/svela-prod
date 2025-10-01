/**
 * Adapter for @connector-kit/connector to make it compatible with @armadura/sdk
 * 
 * This adapter bridges the API differences between connector-kit and the generic connector interface
 */

import type { GenericConnectorClient, GenericConnectorState } from '../types/connector'

/**
 * Adapter that wraps @connector-kit/connector's ConnectorClient to match the GenericConnectorClient interface
 */
export class ConnectorKitAdapter implements GenericConnectorClient {
  constructor(private connectorKitClient: any) {}

  getState(): GenericConnectorState {
    // connector-kit uses getSnapshot() instead of getState()
    const snapshot = this.connectorKitClient.getSnapshot()
    
    return {
      connected: snapshot.connected,
      connecting: snapshot.connecting,
      selectedWallet: snapshot.selectedWallet,
      selectedAccount: snapshot.selectedAccount,
      accounts: snapshot.accounts,
      // Pass through any additional properties
      ...snapshot
    }
  }

  subscribe(callback: (state: GenericConnectorState) => void): () => void {
    // connector-kit's subscribe method expects a function that receives the raw state
    return this.connectorKitClient.subscribe((state: any) => {
      // Transform the state to match our generic interface
      const genericState: GenericConnectorState = {
        connected: state.connected,
        connecting: state.connecting,
        selectedWallet: state.selectedWallet,
        selectedAccount: state.selectedAccount,
        accounts: state.accounts,
        ...state
      }
      callback(genericState)
    })
  }

  async connect(wallet?: any): Promise<void> {
    if (wallet?.name && this.connectorKitClient.select) {
      await this.connectorKitClient.select(wallet.name)
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectorKitClient.disconnect) {
      await this.connectorKitClient.disconnect()
    }
  }
}

/**
 * Creates an adapted connector hook for @connector-kit/connector
 * 
 * Usage:
 * ```tsx
 * import { ArmaProvider } from '@armadura/sdk'
 * import { createConnectorKitAdapter } from '@armadura/sdk/adapters/connector-kit-adapter'
 * import { useConnectorClient } from '@connector-kit/connector'
 * 
 * const useAdaptedConnector = createConnectorKitAdapter(useConnectorClient)
 * 
 * <ArmaProvider config={config} useConnector={useAdaptedConnector}>
 *   {children}
 * </ArmaProvider>
 * ```
 */
export function createConnectorKitAdapter(useConnectorClient: () => any): () => GenericConnectorClient | null {
  // Return a stable hook function
  return function useAdaptedConnector(): GenericConnectorClient | null {
    const client = useConnectorClient()
    if (!client) return null
    
    // Use React.useMemo to avoid creating new adapter instances on every render
    const { useMemo } = require('react')
    return useMemo(() => new ConnectorKitAdapter(client), [client])
  }
}
