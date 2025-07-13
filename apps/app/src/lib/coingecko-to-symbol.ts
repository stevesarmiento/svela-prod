/**
 * Maps CoinGecko IDs to symbols expected by Coinglass APIs
 * @param coingeckoId - The CoinGecko ID (e.g., "bitcoin", "ethereum")
 * @returns The symbol for Coinglass APIs (e.g., "BTC", "ETH") or null if not supported
 */
export function coinGeckoIdToSymbol(coingeckoId: string): string | null {
  const coinGeckoToSymbolMap: Record<string, string> = {
    // Major cryptocurrencies
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'tether': 'USDT',
    'binancecoin': 'BNB',
    'solana': 'SOL',
    'ripple': 'XRP',
    'dogecoin': 'DOGE',
    'cardano': 'ADA',
    'avalanche-2': 'AVAX',
    'polkadot': 'DOT',
    'chainlink': 'LINK',
    'polygon': 'MATIC',
    'litecoin': 'LTC',
    'near': 'NEAR',
    'uniswap': 'UNI',
    'cosmos': 'ATOM',
    'algorand': 'ALGO',
    'stellar': 'XLM',
    'fantom': 'FTM',
    'the-sandbox': 'SAND',
    'decentraland': 'MANA',
    'axie-infinity': 'AXS',
    'compound-governance-token': 'COMP',
    'yearn-finance': 'YFI',
    'maker': 'MKR',
    'aave': 'AAVE',
    'curve-dao-token': 'CRV',
    'sushi': 'SUSHI',
    'matic-network': 'MATIC',
    'internet-computer': 'ICP',
    'filecoin': 'FIL',
    'hedera-hashgraph': 'HBAR',
    'vechain': 'VET',
    'elrond-erd-2': 'EGLD',
    'theta-token': 'THETA',
    'monero': 'XMR',
    'ethereum-classic': 'ETC',
    'tezos': 'XTZ',
    'eos': 'EOS',
    'bitcoin-cash': 'BCH',
    'bitcoin-sv': 'BSV',
    'zcash': 'ZEC',
    'dash': 'DASH',
    'neo': 'NEO',
    'iota': 'MIOTA',
    'waves': 'WAVES',
    'lisk': 'LSK',
    'stratis': 'STRAX',
    'qtum': 'QTUM',
    'ren': 'REN',
    'compound': 'COMP',
  }

  return coinGeckoToSymbolMap[coingeckoId] || null
}

/**
 * Fallback function that tries to extract symbol from CoinGecko ID
 * @param coingeckoId - The CoinGecko ID
 * @returns A best-guess symbol or the original ID uppercased
 */
export function coinGeckoIdToSymbolFallback(coingeckoId: string): string {
  // First try the mapping
  const symbol = coinGeckoIdToSymbol(coingeckoId)
  if (symbol) return symbol

  // Fallback: handle common patterns
  if (coingeckoId.includes('-')) {
    // For IDs like "bitcoin-cash", try the first part
    const firstPart = coingeckoId.split('-')[0]
    if (firstPart && firstPart.length <= 5) {
      return firstPart.toUpperCase()
    }
  }

  // Final fallback: return uppercase version if short enough
  if (coingeckoId.length <= 5) {
    return coingeckoId.toUpperCase()
  }

  // Default to BTC for unsupported coins
  return 'BTC'
} 