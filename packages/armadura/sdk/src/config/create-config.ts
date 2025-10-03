// MVP configuration - simplified version for demo components
export interface SolanaConfig {
  cluster?: string
  network?: 'mainnet' | 'devnet' | 'testnet' | 'localnet'
  rpcUrl?: string
  commitment?: string
  providers?: any[]
  autoConnect?: boolean
  debug?: boolean
}

export function createSolanaConfig(config: Partial<SolanaConfig> = {}): SolanaConfig {
  return {
    cluster: config.cluster || config.network || 'devnet',
    network: config.network || 'devnet',
    rpcUrl: config.rpcUrl || 'https://api.devnet.solana.com',
    commitment: config.commitment || 'confirmed',
    providers: config.providers,
    autoConnect: config.autoConnect,
    debug: config.debug,
  }
}
