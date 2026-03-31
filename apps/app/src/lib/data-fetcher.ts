// HistoricalData type removed - using direct data structures

interface CoinQuote {
  price: number;
  percent_change_24h: number;
  market_cap: number;
  volume_24h: number;
}

interface DetailedCoin {
  id: number;
  name: string;
  symbol: string;
  cmc_rank: number;
  quote: {
    USD: CoinQuote;
  };
  historical?: {
    data?: {
      prices?: Array<[number, number]>;
    };
  };
}

interface SimpleCoin {
  name: string;
  symbol: string;
  price: number;
  change_24h: number;
}

interface MarketCoin {
  name: string;
  symbol: string;
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
    };
  };
}

interface DataContext {
  type: 'coins' | 'market' | 'none';
  data?: DetailedCoin | SimpleCoin[] | MarketCoin[];
  summary?: string;
}

interface QueryIntent {
  type: 'coin' | 'market' | 'comparison' | 'none';
  coins: string[];
  timeframe?: string;
  intent: string;
}

interface CoinSearchResult {
  coinId: number;
  name: string;
  symbol: string;
}

// Dynamic coin lookup using Convex database
async function searchCoinInDatabase(query: string): Promise<{id: number, name: string, symbol: string}[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/convex/search-coins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 })
    });
    
    if (!response.ok) {
      console.error('Failed to search coins in database');
      return [];
    }
    
    const coins: CoinSearchResult[] = await response.json();
    return coins.map((coin) => ({
      id: coin.coinId,
      name: coin.name.toLowerCase(),
      symbol: coin.symbol.toLowerCase()
    }));
  } catch (error) {
    console.error('Error searching coins in database:', error);
    return [];
  }
}

async function parseUserIntent(userMessage: string): Promise<QueryIntent> {
  const systemPrompt = `You are a cryptocurrency query parser. Extract structured information from user queries.

You have access to a comprehensive database of cryptocurrencies. Extract coin names or symbols from the user's message.

Respond with JSON only:
{
  "type": "coin" | "market" | "comparison" | "none",
  "coins": ["coin_name_or_symbol"],
  "timeframe": "24h" | "7d" | "30d" | null,
  "intent": "brief description of what user wants"
}

Examples:
"What's Bitcoin doing?" → {"type": "coin", "coins": ["bitcoin"], "timeframe": null, "intent": "current price and performance"}
"Compare BTC and ETH performance" → {"type": "comparison", "coins": ["BTC", "ETH"], "timeframe": null, "intent": "compare two cryptocurrencies"}
"Show me DOGE price" → {"type": "coin", "coins": ["DOGE"], "timeframe": null, "intent": "current price and performance"}
"Show me the crypto market leaders" → {"type": "market", "coins": [], "timeframe": null, "intent": "top cryptocurrencies by market cap"}`;

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/parse-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: userMessage,
        systemPrompt 
      })
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Intent parsing error:', error);
    return { type: 'none', coins: [], intent: 'failed to parse' };
  }
}

export async function detectAndFetchData(userMessage: string): Promise<DataContext> {
  // Use AI to parse user intent
  const intent = await parseUserIntent(userMessage);
  
  if (intent.type === 'none') {
    return { type: 'none' };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  try {
    if (intent.type === 'coin' && intent.coins.length > 0) {
      // Search for coins in database
      const coinSearchPromises = intent.coins.map(coin => searchCoinInDatabase(coin));
      const coinSearchResults = await Promise.all(coinSearchPromises);
      const coinIds = coinSearchResults.flat().map(coin => coin.id.toString());
      
      if (coinIds.length === 1) {
        const response = await fetch(`${baseUrl}/api/coins/${coinIds[0]}`);
        const coinData: DetailedCoin = await response.json();
        
        if (!coinData.id) {
          coinData.id = Number.parseInt(coinIds[0] || '0');
        }
        
        return {
          type: 'coins',
          data: coinData,
          summary: `${intent.intent}: ${coinData.name} is trading at $${coinData.quote?.USD?.price?.toLocaleString()} (${coinData.quote?.USD?.percent_change_24h?.toFixed(2)}% 24h)`
        };
      }if (coinIds.length > 1) {
        const response = await fetch(`${baseUrl}/api/coinmarketcap/quotes?ids=${coinIds.join(',')}`);
        const quotesData: { data: Record<string, DetailedCoin> } = await response.json();
        
        const coins: SimpleCoin[] = Object.values(quotesData.data).map((coin: DetailedCoin) => ({
          name: coin.name,
          symbol: coin.symbol,
          price: coin.quote.USD.price,
          change_24h: coin.quote.USD.percent_change_24h
        }));
        
        return {
          type: 'coins',
          data: coins,
          summary: `${intent.intent}: ${coins.map(c => `${c.name}: $${c.price.toLocaleString()}`).join(', ')}`
        };
      }
    }
    
    if (intent.type === 'market') {
      const response = await fetch(`${baseUrl}/api/coinmarketcap/top`);
      const marketData: { coins: MarketCoin[] } = await response.json();
      
      return {
        type: 'market',
        data: marketData.coins.slice(0, 10),
        summary: `${intent.intent}: ${marketData.coins.slice(0, 5).map(c => `${c.name}: $${c.quote.USD.price.toLocaleString()}`).join(', ')}`
      };
    }
    
  } catch (error) {
    console.error('Data fetching error:', error);
  }
  
  return { type: 'none' };
}

export function formatDataForLLM(context: DataContext): string {
  if (context.type === 'none' || !context.data) {
    return '';
  }
  
  let formatted = '\n\n**LIVE DATA CONTEXT:**\n';
  
  if (context.type === 'coins') {
    if (Array.isArray(context.data)) {
      // Multiple coins
      formatted += (context.data as SimpleCoin[]).map((coin: SimpleCoin) => 
        `${coin.name} (${coin.symbol}): $${coin.price?.toLocaleString()} (${coin.change_24h?.toFixed(2)}% 24h)`
      ).join('\n');
    } else {
      // Single coin detailed data
      const coin = context.data as DetailedCoin;
      formatted += `${coin.name} (${coin.symbol}):
- Current Price: $${coin.quote?.USD?.price?.toLocaleString()}
- 24h Change: ${coin.quote?.USD?.percent_change_24h?.toFixed(2)}%
- Market Cap: $${coin.quote?.USD?.market_cap?.toLocaleString()}
- 24h Volume: $${coin.quote?.USD?.volume_24h?.toLocaleString()}
- Rank: #${coin.cmc_rank}`;
    }
  } else if (context.type === 'market') {
    formatted += 'Top Cryptocurrencies:\n';
    formatted += (context.data as MarketCoin[]).slice(0, 10).map((coin: MarketCoin, index: number) => 
      `${index + 1}. ${coin.name} (${coin.symbol}): $${coin.quote.USD.price.toLocaleString()} (${coin.quote.USD.percent_change_24h.toFixed(2)}% 24h)`
    ).join('\n');
  }
  
  formatted += '\n\nUse this live data to provide accurate, up-to-date information in your response.\n\n';
  
  return formatted;
}
