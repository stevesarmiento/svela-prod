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
import { hasDisconnect, getConnectorState } from '../types/connector'

/**
 * Configuration for the ArmaWebClient.
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
  transport?: Transport
  connector?: GenericConnectorClient | null
}

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
 * Core client for Arma SDK - manages wallet connections and state.
 * Connector is the single source of truth.
 */
export class ArmaWebClient {
  private listeners: Set<Listener> = new Set()
  private state: ArmaWebClientState
  private walletUnsubscribers: Array<() => void> = []
  private connector: GenericConnectorClient | null = null
  private cachedSnapshot: (ArmaWebClientState & {
    select: (walletName: string) => Promise<void>
    disconnect: () => Promise<void>
    selectAccount: (accountAddress: Address) => Promise<void>
  }) | null = null

  constructor(config: ArmaWebClientConfig) {
    const rpcUrl = config.rpcUrl || `https://api.${config.network || 'devnet'}.solana.com`
    const clusterInfo = getClusterInfo(rpcUrl)
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
    if (typeof window === 'undefined') return

    try {
      const providedConnector = this.state.config.connector
        
      if (!providedConnector) {
        console.warn('No connector provided to ArmaProvider')
        return
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

      syncFromConnector(getConnectorState(this.connector))
      const unsubscribe = this.connector.subscribe(syncFromConnector)
      this.walletUnsubscribers.push(unsubscribe)

    } catch (error) {
      console.error('Failed to initialize wallets:', error)
    }
  }

  getSnapshot(): ArmaWebClientState & {
    select: (walletName: string) => Promise<void>
    disconnect: () => Promise<void>
    selectAccount: (accountAddress: Address) => Promise<void>
  } {
    if (this.cachedSnapshot) {
      return this.cachedSnapshot
    }
    
    this.cachedSnapshot = {
      ...this.state,
      select: this.select.bind(this),
      disconnect: this.disconnect.bind(this),
      selectAccount: this.selectAccount.bind(this),
    }
    return this.cachedSnapshot
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async select(walletName: string): Promise<void> {
    if (!this.connector) {
      throw new Error('No connector available')
    }

    try {
      const connectorState = getConnectorState(this.connector)
      const wallet = connectorState.selectedWallet
      
      if (wallet && wallet.name === walletName) {
        if (this.connector.connect) {
          await this.connector.connect(wallet)
        }
        return
      }

      if (this.connector.select) {
        await this.connector.select(walletName)
      } else if (this.connector.connect) {
        await this.connector.connect({ name: walletName } as any)
      }
    } catch (error) {
      console.error('Failed to select wallet:', error)
      throw error
    }
  }

  async selectAccount(accountAddress: Address): Promise<void> {
    try {
      console.log('Selecting account:', accountAddress)
    } catch (error) {
      console.error('Failed to select account:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.connector && hasDisconnect(this.connector)) {
      await this.connector.disconnect()
    }
  }

  /** Update configuration without recreating the client */
  updateConfig(next: ArmaWebClientConfig): void {
    const rpcUrl = next.rpcUrl || `https://api.${next.network || 'mainnet'}.solana.com`
    const clusterInfo = getClusterInfo(rpcUrl)
    const prevRpcUrl = this.state.cluster.rpcUrl
    const prevConnector = this.state.config.connector
    
    const transport =
      next.transport ||
      this.state.config.transport ||
      createHttpTransport({ url: rpcUrl, timeoutMs: 15000, retry: { attempts: 2, strategy: 'exponential', baseDelayMs: 300, jitter: true } })

    this.state = {
      ...this.state,
      cluster: {
        ...clusterInfo,
        rpcUrl
      },
      config: {
        ...this.state.config,
        ...next,
        transport
      }
    }

    if (next.connector !== prevConnector) {
      this.connector = next.connector || null
      this.notify()
    } else if (rpcUrl !== prevRpcUrl) {
      this.notify()
    }
  }

  private notify(): void {
    this.cachedSnapshot = null
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

  destroy(): void {
    for (const unsubscribe of this.walletUnsubscribers) {
      try {
        unsubscribe()
      } catch (error) {
        console.warn('Error unsubscribing from wallet:', error)
      }
    }
    this.walletUnsubscribers = []
    this.listeners.clear()
    this.connector = null
    this.cachedSnapshot = null
  }
}