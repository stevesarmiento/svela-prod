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
    const data = await fetchWithErrorHandling(
      `${BASE_URLS.v1}/cryptocurrency/listings/latest?start=1&limit=100&sort=market_cap&sort_dir=desc&aux=cmc_rank`
    );

    const filteredCoins = data.data
      .map((coin: any) => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        cmc_rank: coin.cmc_rank,
        logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
        quote: coin.quote
      }))
      .filter((coin: any) => 
        coin.name.toLowerCase().includes(validatedQuery.query.toLowerCase()) ||
        coin.symbol.toLowerCase().includes(validatedQuery.query.toLowerCase())
      );

    return NextResponse.json({
      coins: filteredCoins.slice(0, 10)
    });
  } catch (error) {
    console.error('Error in search:', error);
    return NextResponse.json(
      { error: 'Failed to search coins' },
      { status: 500 }
    );
  }
}