import { NextResponse } from 'next/server';
import { fetchWithErrorHandling, BASE_URL } from '../utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json(
        { error: 'Missing ids parameter' },
        { status: 400 }
      );
    }

    const data = await fetchWithErrorHandling(
      `${BASE_URL}/cryptocurrency/quotes/latest?id=${ids}&aux=num_market_pairs,cmc_rank,date_added,tags,platform,max_supply,circulating_supply,total_supply,market_cap_by_total_supply,volume_24h_reported,volume_7d,volume_30d`
    );

    // Debug: Log what percentage change fields are actually returned
    if (data?.data) {
      const firstCoin = Object.values(data.data)[0] as {
        id: number;
        symbol: string;
        quote?: {
          USD?: Record<string, unknown>;
        };
      };
      if (firstCoin?.quote?.USD) {
        console.log('📊 Available percentage change fields:', {
          coinId: firstCoin.id,
          symbol: firstCoin.symbol,
          percentageFields: Object.keys(firstCoin.quote.USD).filter(key => key.includes('percent_change'))
        });
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in quotes endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quotes' },
      { status: 500 }
    );
  }
}