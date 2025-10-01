import type { ConnectorConfig } from '../lib/connector-client'

export interface DefaultConfigOptions {
  /** Application name shown in wallet connection prompts */
  appName: string
  /** Application URL for wallet connection metadata */
  appUrl?: string
  /** Enable automatic wallet reconnection on page load */
  autoConnect?: boolean
  /** Enable debug logging */
  debug?: boolean
  /** Solana network to connect to */
  network?: 'mainnet-beta' | 'devnet' | 'testnet'
  /** Enable Mobile Wallet Adapter support */
  enableMobile?: boolean
  /** Custom storage implementation */
  storage?: ConnectorConfig['storage']
}

/**
 * Creates a default connector configuration with sensible defaults for Solana applications
 */
export function getDefaultConfig(options: DefaultConfigOptions): ConnectorConfig {
  const {
    appName,
    appUrl,
    autoConnect = true,
    debug,
    network = 'mainnet-beta',
    enableMobile = true,
    storage,
  } = options

  // Default to localStorage if available
  const defaultStorage: ConnectorConfig['storage'] = typeof window !== 'undefined' ? {
    getItem: (key: string) => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    setItem: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // Silently fail
      }
    },
    removeItem: (key: string) => {
      try {
        localStorage.removeItem(key)
      } catch {
        // Silently fail
      }
    },
  } : undefined

  return {
    autoConnect,
    debug: debug ?? (process.env.NODE_ENV === 'development'),
    storage: storage ?? defaultStorage,
  }
}

/**
 * Default Mobile Wallet Adapter configuration for Solana applications
 */
export function getDefaultMobileConfig(options: {
  appName: string
  appUrl?: string
  network?: 'mainnet-beta' | 'devnet' | 'testnet'
}) {
  return {
    appIdentity: {
      name: options.appName,
      uri: options.appUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000'),
      icon: `${options.appUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000')}/favicon.ico`,
    },
  }
}
