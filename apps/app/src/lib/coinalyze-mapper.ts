// Create a dynamic mapper that converts slugs to Coinalyze symbols
export function slugToCoinalyzeSymbol(slug: string): string | null {
    // Common trading pairs and their Coinalyze equivalents
    const slugMappings: Record<string, string> = {
      'bitcoin': 'BTCUSDT_PERP.A',
      'ethereum': 'ETHUSDT_PERP.A',
      'tether': 'USDTUSDT_PERP.A',
      'bnb': 'BNBUSDT_PERP.A',
      'solana': 'SOLUSDT_PERP.A',
      'xrp': 'XRPUSDT_PERP.A',
      'dogecoin': 'DOGEUSDT_PERP.A',
      'cardano': 'ADAUSDT_PERP.A',
      'avalanche': 'AVAXUSDT_PERP.A',
      'polkadot': 'DOTUSDT_PERP.A',
      'chainlink': 'LINKUSDT_PERP.A',
      'polygon': 'MATICUSDT_PERP.A',
      'litecoin': 'LTCUSDT_PERP.A',
      'near': 'NEARUSDT_PERP.A',
      'uniswap': 'UNIUSDT_PERP.A',
      'cosmos': 'ATOMUSDT_PERP.A',
      'algorand': 'ALGOUSDT_PERP.A',
      'stellar': 'XLMUSDT_PERP.A',
      'fantom': 'FTMUSDT_PERP.A',
      'the-sandbox': 'SANDUSDT_PERP.A',
      'decentraland': 'MANAUSDT_PERP.A',
      'axie-infinity': 'AXSUSDT_PERP.A',
      'compound': 'COMPUSDT_PERP.A',
      'yearn-finance': 'YFIUSDT_PERP.A',
      'maker': 'MKRUSDT_PERP.A',
      'aave': 'AAVEUSDT_PERP.A',
      'curve-dao-token': 'CRVUSDT_PERP.A',
      'sushiswap': 'SUSHIUSDT_PERP.A',
    };
  
    return slugMappings[slug] || null;
  }
  
  // Alternative: generate symbol based on patterns
  export function generateCoinalyzeSymbol(symbol: string): string {
    // Most symbols follow the pattern: {SYMBOL}USDT_PERP.A
    return `${symbol.toUpperCase()}USDT_PERP.O`;
  }