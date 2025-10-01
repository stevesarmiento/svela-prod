/**
 * Generic connector interfaces that any wallet connector implementation can satisfy.
 * This allows the SDK to work with different connector packages (e.g., @armadura/connector, @connector-kit/connector, etc.)
 */

/**
 * Generic wallet interface that any wallet implementation should satisfy
 * Compatible with Wallet Standard format
 */
export interface GenericWallet {
  name: string
  version: string
  icon?: string
  chains?: string[]
  features?: Record<string, any>
  accounts?: any[]
  [key: string]: any
}

/**
 * Generic account interface
 */
export interface GenericAccount {
  address: string
  raw?: any
  [key: string]: any
}

/**
 * Generic connector state interface
 */
export interface GenericConnectorState {
  connected: boolean
  connecting: boolean
  selectedWallet: GenericWallet | null
  selectedAccount: string | null
  accounts: GenericAccount[]
  [key: string]: any
}

/**
 * Generic connector client interface that any connector implementation should satisfy
 * Supports both getState() and getSnapshot() patterns
 */
export interface GenericConnectorClient {
  getState?(): GenericConnectorState
  getSnapshot?(): GenericConnectorState
  subscribe(callback: (state: GenericConnectorState) => void): () => void
  connect?(wallet?: GenericWallet): Promise<void>
  disconnect?(): Promise<void>
  select?(walletName: string): Promise<void>
  [key: string]: any
}

/**
 * Type guard to check if disconnect method exists
 */
export function hasDisconnect(connector: GenericConnectorClient): connector is GenericConnectorClient & { disconnect(): Promise<void> } {
  return typeof connector.disconnect === 'function'
}

/**
 * Get state from connector using either getState() or getSnapshot()
 */
export function getConnectorState(connector: GenericConnectorClient): GenericConnectorState {
  if (connector.getState) {
    return connector.getState()
  }
  if (connector.getSnapshot) {
    return connector.getSnapshot()
  }
  throw new Error('Connector must implement either getState() or getSnapshot()')
}

/**
 * Hook interface for connector clients
 */
export interface ConnectorHook {
  (): GenericConnectorClient | null
}
