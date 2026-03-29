// Token symbol to mint address mappings for Solana
export const TOKEN_MAPPINGS: Record<string, { 
  mint: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
}> = {
  // Native SOL
  'sol': {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
  },
  'solana': {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
  },
  
  // Stablecoins
  'usdc': {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  },
  'usdt': {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
  },
  'tether': {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
  },
  
  // Popular tokens
  'bonk': {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I'
  },
  'wif': {
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    symbol: 'WIF',
    name: 'dogwifhat',
    decimals: 6,
    logoURI: 'https://bafkreibk3covs5ltyqxa272zw3kv6z7cu5s5tihvdvzhg2p2zaqrxk7ahm.ipfs.nftstorage.link'
  },
  'dogwifhat': {
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    symbol: 'WIF',
    name: 'dogwifhat',
    decimals: 6,
    logoURI: 'https://bafkreibk3covs5ltyqxa272zw3kv6z7cu5s5tihvdvzhg2p2zaqrxk7ahm.ipfs.nftstorage.link'
  },
  'jup': {
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
    logoURI: 'https://static.jup.ag/jup/icon.png'
  },
  'jupiter': {
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
    logoURI: 'https://static.jup.ag/jup/icon.png'
  },
  'ray': {
    mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    symbol: 'RAY',
    name: 'Raydium',
    decimals: 6,
    logoURI: 'https://raydium.io/logo/raydium-logo-coin.svg'
  },
  'raydium': {
    mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    symbol: 'RAY',
    name: 'Raydium',
    decimals: 6,
    logoURI: 'https://raydium.io/logo/raydium-logo-coin.svg'
  },
  'orca': {
    mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
    symbol: 'ORCA',
    name: 'Orca',
    decimals: 6,
    logoURI: 'https://www.orca.so/static/media/token_logo.a8f9cd0c.svg'
  },
  'jito': {
    mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    symbol: 'JITO',
    name: 'Jito',
    decimals: 9,
    logoURI: 'https://storage.googleapis.com/token-metadata/JitoSOL-256.png'
  },
  'jitoSOL': {
    mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    symbol: 'JITO',
    name: 'Jito Staked SOL',
    decimals: 9,
    logoURI: 'https://storage.googleapis.com/token-metadata/JitoSOL-256.png'
  },
  'msol': {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade staked SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png'
  },
  'marinade': {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade staked SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png'
  }
}

/**
 * Normalize token symbol to mint address
 */
export function normalizeTokenSymbol(symbol: string): string {
  const normalized = symbol.toLowerCase().trim()
  const tokenInfo = TOKEN_MAPPINGS[normalized]
  
  if (tokenInfo) {
    return tokenInfo.mint
  }
  
  // If it's already a mint address (base58, ~44 chars), return as-is
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbol)) {
    return symbol
  }
  
  // Return the original symbol if not found - let the caller handle validation
  return symbol
}

/**
 * Get token info by symbol or mint
 */
export function getTokenInfo(symbolOrMint: string) {
  const normalized = symbolOrMint.toLowerCase().trim()
  
  // Check if it's a known symbol
  const tokenInfo = TOKEN_MAPPINGS[normalized]
  if (tokenInfo) {
    return tokenInfo
  }
  
  // Check if it's a mint address and find the corresponding token
  for (const info of Object.values(TOKEN_MAPPINGS)) {
    if (info.mint === symbolOrMint) {
      return info
    }
  }
  
  return null
}

/**
 * Get display name for a token
 */
export function getTokenDisplayName(symbolOrMint: string): string {
  const tokenInfo = getTokenInfo(symbolOrMint)
  return tokenInfo ? tokenInfo.symbol : symbolOrMint.toUpperCase()
}

/**
 * Get token decimals
 */
export function getTokenDecimals(symbolOrMint: string): number {
  const tokenInfo = getTokenInfo(symbolOrMint)
  return tokenInfo ? tokenInfo.decimals : 6 // Default to 6 decimals
}

/**
 * Format amount based on token decimals
 */
export function formatTokenAmount(amount: number, symbolOrMint: string): bigint {
  const decimals = getTokenDecimals(symbolOrMint)
  return BigInt(Math.floor(amount * 10 ** decimals))
}

/**
 * Parse amount from token units
 */
export function parseTokenAmount(amount: bigint, symbolOrMint: string): number {
  const decimals = getTokenDecimals(symbolOrMint)
  return Number(amount) / 10 ** decimals
}
