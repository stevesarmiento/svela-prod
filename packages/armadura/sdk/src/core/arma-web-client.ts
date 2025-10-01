'use client'

import { type Address } from '@solana/kit'
import { getClusterInfo, type ClusterInfo } from '../utils/cluster'
import type { Transport } from '../transports/types'
import { createHttpTransport } from '../transports/http'
import type { Provider } from './provider'
import {
  WalletStandardKitSigner,
  type StandardWalletInfo,
} from '../hooks/use-standard-wallets'
import type { GenericConnectorClient, GenericConnectorState } from '../types/connector'
import { hasDisconnect } from '../types/connector'

// Connector is the single source of truth; no Arma-managed persistence

/**
 * Configuration for the ArmaWebClient.
 * This extends the configuration available in the ArmaProvider.
 */
export interface ArmaWebClientConfig {
  providers?: Provider[]
  network?: 'mainnet' | 'devnet' | 'testnet'
  rpcUrl?: string
  commitment?: 'processed' | 'confirmed' | 'finalized'
  autoConnect?: boolean
  debug?: boolean
  storage?: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
    removeItem: (key: string) => void
  }
  /** Pluggable transport for all RPC requests used by hooks/components */
  transport?: Transport
  /** Optional shared connector instance to unify wallet state with external providers */
  connector?: GenericConnectorClient | null
}

/**
 * The state managed by the ArmaWebClient.
 * This is the single source of truth for the UI.
 */
export interface ArmaWebClientState {
  config: ArmaWebClientConfig
  cluster: ClusterInfo
  wallet: {
    connected: boolean
    connecting: boolean
    selectedWallet: StandardWalletInfo | null
    selectedAccount: Address | null
    accounts: StandardWalletInfo[]
    wallets: StandardWalletInfo[]
    signer: any | null
  }
}

type Listener = (state: ArmaWebClientState) => void

/**
 * The ArmaWebClient is the core client that manages wallet connections, RPC connections, and other low-level state.
 * It is initialized once per app and used by the ArmaProvider to provide a React context.
 *
 * This class provides subscription support, configuration, and all the essential methods
 * needed by the Arma hooks ecosystem.
 *
 * Key Features:
 * - **Subscription-based state management**: Efficient re-rendering via useSyncExternalStore
 * - **Connector integration**: Works with any connector implementation via generic interfaces
 * - **Transport abstraction**: Pluggable RPC transport layer
 * - **Automatic wallet discovery and account management**
 * - **Persistent storage integration for user preferences**
 */
export class ArmaWebClient {
  private listeners: Set<Listener> = new Set()
  private state: ArmaWebClientState
  private walletUnsubscribers: Array<() => void> = []
  private connector: GenericConnectorClient | null = null

  constructor(config: ArmaWebClientConfig) {
    const rpcUrl = config.rpcUrl || `https://api.${config.network || 'devnet'}.solana.com`
    const clusterInfo = getClusterInfo(rpcUrl)
    // Default transport if none provided
    const transport = config.transport || createHttpTransport({ url: rpcUrl })
    
    this.state = {
      config: {
        ...config,
        transport,
        rpcUrl,
      },
      cluster: clusterInfo,
      wallet: {
        connected: false,
        connecting: false,
        selectedWallet: null,
        selectedAccount: null,
        accounts: [],
        wallets: [],
        signer: null,
      },
    }

    this.initializeWallets()
  }

  private initializeWallets() {
    // Skip wallet initialization during SSR to prevent hydration mismatches
    if (typeof window === 'undefined') {
      return;
    }

    try {
      // Prefer externally provided connector (from app-level provider) when available
      const providedConnector = this.state.config.connector
      if (!providedConnector) {
        throw new Error('ArmaProvider requires a connector implementation. Pass a useConnector hook that returns a connector client (e.g., useConnectorClient from @armadura/connector or @connector-kit/connector).')
      }
      this.connector = providedConnector

      const syncFromConnector = (s: GenericConnectorState) => {
        const selectedWallet = s.selectedWallet
        const connected = s.connected
        const connecting = s.connecting
        const selectedAccount = s.selectedAccount
        const accounts = s.accounts

        let signer: any = null
        let address: Address | null = null
        if (connected && selectedWallet && selectedAccount) {
          const rawAccount = (accounts as Array<{ address: string; raw: any }>).find((a) => a.address === selectedAccount)?.raw
          if (rawAccount) {
            // Type assertion: GenericWallet is compatible with Wallet Standard format
            signer = new WalletStandardKitSigner(rawAccount, selectedWallet as any)
            address = rawAccount.address as Address
          }
        }

        this.state = {
          ...this.state,
          wallet: {
            ...this.state.wallet,
            connected,
            connecting,
            selectedWallet: selectedWallet as any,
            selectedAccount: address,
            signer,
          }
        }
        this.notify()
      }

      // Initial sync
      syncFromConnector(this.connector.getState())

      // Subscribe to changes
      const unsubscribe = this.connector.subscribe(syncFromConnector)
      this.walletUnsubscribers.push(unsubscribe)

    } catch (error) {
      console.error('Failed to initialize wallets:', error)
      // Continue without wallet functionality
    }
  }

  /**
   * Get a snapshot of the current state for React components.
   */
  getSnapshot(): ArmaWebClientState & {
    select: (walletName: string) => Promise<void>
    disconnect: () => Promise<void>
    selectAccount: (accountAddress: Address) => Promise<void>
  } {
    return {
      ...this.state,
      select: this.select.bind(this),
      disconnect: this.disconnect.bind(this),
      selectAccount: this.selectAccount.bind(this),
    }
  }

  /**
   * Subscribe to state changes.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Select and connect to a wallet.
   */
  async select(walletName: string): Promise<void> {
    if (!this.connector) {
      throw new Error('No connector available')
    }

    try {
      const connectorState = this.connector.getState()
      const wallet = connectorState.selectedWallet
      
      if (wallet && wallet.name === walletName) {
        // Already selected, just connect if needed
        if (this.connector.connect) {
          await this.connector.connect(wallet)
        }
        return
      }

      // Find wallet and connect
      if (this.connector.connect) {
        await this.connector.connect({ name: walletName } as any)
      }
    } catch (error) {
      console.error('Failed to select wallet:', error)
      throw error
    }
  }

  /**
   * Select a specific account from the connected wallet.
   */
  async selectAccount(accountAddress: Address): Promise<void> {
    try {
      // Account selection logic would depend on connector implementation
      // This is a placeholder for the interface
      console.log('Selecting account:', accountAddress)
    } catch (error) {
      console.error('Failed to select account:', error)
      throw error
    }
  }

  /**
   * Disconnect from the current wallet.
   */
  async disconnect(): Promise<void> {
    if (this.connector && hasDisconnect(this.connector)) {
      await this.connector.disconnect()
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.state))
  }

  private getStorage(): ArmaWebClientConfig['storage'] | null {
    if (this.state.config.storage) return this.state.config.storage
    if (typeof window !== 'undefined' && window.localStorage) {
      return {
        getItem: (k: string) => window.localStorage.getItem(k),
        setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
        removeItem: (k: string) => window.localStorage.removeItem(k),
      }
    }
    return null
  }

  /**
   * Destroy the client and clean up resources.
   */
  destroy(): void {
    // Clean up wallet subscriptions
    for (const unsubscribe of this.walletUnsubscribers) {
      try {
        unsubscribe()
      } catch (error) {
        console.warn('Error unsubscribing from wallet:', error)
      }
    }
    this.walletUnsubscribers = []

    // Clear listeners
    this.listeners.clear()

    // Reset state
    this.connector = null
  }
}
