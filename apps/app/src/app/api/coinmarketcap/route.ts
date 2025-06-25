import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchWithErrorHandling } from './utils';

const BASE_URLS = {
  v1: "https://pro-api.coinmarketcap.com/v1",
  v2: "https://pro-api.coinmarketcap.com/v2"
};

const SearchQuerySchema = z.object({
  query: z.string().min(1)
});

interface CoinMapItem {
  id: number;
  name: string;
  symbol: string;
  rank: number;
}

interface CoinQuoteItem {
  id: number;
  name: string;
  symbol: string;
  cmc_rank: number;
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      market_cap: number;
      volume_24h: number;
    };
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");

    if (!query) {
      return NextResponse.json(
        { error: "Missing query parameter" },
        { status: 400 }
      );
    }

    const validatedQuery = SearchQuerySchema.parse({ query });
    
    // Step 1: Search through ALL coins using the map endpoint
    const mapData = await fetchWithErrorHandling(
      `${BASE_URLS.v1}/cryptocurrency/map?listing_status=active&start=1&limit=5000`
    );

    // Filter coins by name/symbol match
    const matchedCoins = (mapData.data as CoinMapItem[])
      ?.filter((coin) => 
        coin.name.toLowerCase().includes(validatedQuery.query.toLowerCase()) ||
        coin.symbol.toLowerCase().includes(validatedQuery.query.toLowerCase())
      )
      .sort((a, b) => (a.rank || 999999) - (b.rank || 999999))
      .slice(0, 20); // Limit to top 20 matches

    if (!matchedCoins?.length) {
      return NextResponse.json({ coins: [] });
    }

    // Step 2: Get pricing data for matched coins
    const coinIds = matchedCoins.map(coin => coin.id).join(',');
    const quotesData = await fetchWithErrorHandling(
      `${BASE_URLS.v1}/cryptocurrency/quotes/latest?id=${coinIds}&aux=cmc_rank`
    );

    // Step 3: Combine map data with pricing data
    const coinsWithPricing = matchedCoins.map(coin => {
      const priceData = quotesData.data[coin.id.toString()] as CoinQuoteItem;
      return {
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        cmc_rank: coin.rank,
        logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
        quote: priceData?.quote || {
          USD: {
            price: 0,
            percent_change_24h: 0,
            market_cap: 0,
            volume_24h: 0
          }
        }
      };
    });

    return NextResponse.json({
      coins: coinsWithPricing
    });
  } catch (error) {
    console.error('Error in search:', error);
    return NextResponse.json(
      { error: 'Failed to search coins' },
      { status: 500 }
    );
  }
}