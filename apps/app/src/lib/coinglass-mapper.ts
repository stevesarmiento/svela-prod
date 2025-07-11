export function coinIdToCoinglassSymbol(coinId: number): string | null {
    const coinIdMappings: Record<number, string> = {
      1: 'BTC',      // Bitcoin
      1027: 'ETH',   // Ethereum  
      825: 'USDT',   // Tether
      1839: 'BNB',   // BNB
      5426: 'SOL',   // Solana
      52: 'XRP',     // XRP
      74: 'DOGE',    // Dogecoin
      2010: 'ADA',   // Cardano
      5805: 'AVAX',  // Avalanche
      6636: 'DOT',   // Polkadot
      1975: 'LINK',  // Chainlink
      3890: 'MATIC', // Polygon
      2: 'LTC',      // Litecoin
      6535: 'NEAR',  // NEAR Protocol
      7083: 'UNI',   // Uniswap
      3794: 'ATOM',  // Cosmos
      4030: 'ALGO',  // Algorand
      512: 'XLM',    // Stellar
      3513: 'FTM',   // Fantom
      6210: 'SAND',  // The Sandbox
      1966: 'MANA',  // Decentraland
      6783: 'AXS',   // Axie Infinity
      5692: 'COMP',  // Compound
      5864: 'YFI',   // Yearn.Finance
      1518: 'MKR',   // Maker
      7278: 'AAVE',  // Aave
      6538: 'CRV',   // Curve DAO Token
      6758: 'SUSHI', // SushiSwap
    };
  
    return coinIdMappings[coinId] || null;
  }
  
  // Generate symbol based on metadata or coin data
  export function generateCoinglassSymbol(symbol: string): string {
    // Most CoinGlass symbols are just the uppercase symbol
    return symbol.toUpperCase();
  }
  
  // Normalize symbol variations
  export function normalizeCoinglassSymbol(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'WBTC': 'BTC',
      'WETH': 'ETH',
      'STETH': 'ETH',
      'USDC': 'USDC',
      'USDT': 'USDT',
      'DAI': 'DAI',
    };
    
    const normalized = symbol.toUpperCase();
    return symbolMap[normalized] || normalized;
  }