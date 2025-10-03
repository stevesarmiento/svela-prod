/**
 * Network/Cluster normalization utilities
 * 
 * Handles translation between different naming conventions:
 * - Armadura: 'mainnet' | 'devnet' | 'testnet' | 'localnet'
 * - ConnectorKit: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet'
 * - wallet-ui: 'solana:mainnet' | 'solana:devnet' | 'solana:testnet' | 'solana:localnet'
 */

/**
 * Unified network types that work across all systems
 */
export type SolanaNetwork = 'mainnet' | 'devnet' | 'testnet' | 'localnet'
export type SolanaNetworkRpc = 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet'
export type SolanaClusterId = `solana:${SolanaNetwork}`

/**
 * Normalize network name to standard format (mainnet, devnet, testnet, localnet)
 */
export function normalizeNetwork(network: string | undefined): SolanaNetwork {
  const normalized = (network || 'mainnet').toLowerCase().replace('mainnet-beta', 'mainnet').replace('solana:', '')
  
  switch (normalized) {
    case 'mainnet':
    case 'mainnet-beta':
      return 'mainnet'
    case 'devnet':
      return 'devnet'
    case 'testnet':
      return 'testnet'
    case 'localnet':
    case 'localhost':
      return 'localnet'
    default:
      return 'mainnet'
  }
}

/**
 * Convert network to RPC-compatible format (mainnet-beta, devnet, testnet, localnet)
 */
export function toRpcNetwork(network: string | undefined): SolanaNetworkRpc {
  const normalized = normalizeNetwork(network)
  return normalized === 'mainnet' ? 'mainnet-beta' : normalized
}

/**
 * Convert network to wallet-ui cluster ID format (solana:mainnet, etc.)
 */
export function toClusterId(network: string | undefined): SolanaClusterId {
  const normalized = normalizeNetwork(network)
  return `solana:${normalized}` as SolanaClusterId
}

/**
 * Get default RPC URL for a network
 */
export function getDefaultRpcUrl(network: string | undefined): string {
  const normalized = normalizeNetwork(network)
  
  switch (normalized) {
    case 'mainnet':
      return 'https://api.mainnet-beta.solana.com'
    case 'devnet':
      return 'https://api.devnet.solana.com'
    case 'testnet':
      return 'https://api.testnet.solana.com'
    case 'localnet':
      return 'http://localhost:8899'
    default:
      return 'https://api.mainnet-beta.solana.com'
  }
}

/**
 * Check if a URL or network string represents mainnet
 */
export function isMainnet(networkOrUrl: string | undefined): boolean {
  if (!networkOrUrl) return false
  const lower = networkOrUrl.toLowerCase()
  return lower.includes('mainnet') || lower === 'solana:mainnet'
}

/**
 * Check if a URL or network string represents devnet
 */
export function isDevnet(networkOrUrl: string | undefined): boolean {
  if (!networkOrUrl) return false
  const lower = networkOrUrl.toLowerCase()
  return lower.includes('devnet') || lower === 'solana:devnet'
}

/**
 * Check if a URL or network string represents testnet
 */
export function isTestnet(networkOrUrl: string | undefined): boolean {
  if (!networkOrUrl) return false
  const lower = networkOrUrl.toLowerCase()
  return lower.includes('testnet') || lower === 'solana:testnet'
}

/**
 * Check if a URL or network string represents localnet
 */
export function isLocalnet(networkOrUrl: string | undefined): boolean {
  if (!networkOrUrl) return false
  const lower = networkOrUrl.toLowerCase()
  return lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('localnet') || lower === 'solana:localnet'
}

