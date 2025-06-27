import { NextResponse } from 'next/server';
import { z } from 'zod';

const BASE_URLS = {
  v1: "https://pro-api.coinmarketcap.com/v1",
};
const API_KEY = process.env.COINMARKETCAP_API_KEY;

const idSchema = z.string().min(1);

async function fetchWithErrorHandling(url: string) {
  if (!API_KEY) {
    throw new Error('CoinMarketCap API key is not configured');
  }

  try {
    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': API_KEY,
        'Accept': 'application/json',
      },
      next: {
        revalidate: 300, // Cache for 5 minutes - header data changes less frequently
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.status?.error_message || `API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error("CoinMarketCap API error:", error);
    throw error;
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: Promise<string> } }
) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'CoinMarketCap API key is not configured' },
      { status: 500 }
    );
  }

  try {
    const id = await params.id;
    const validatedId = idSchema.parse(id);

    // Fetch only the essential info for header display
    const info = await fetchWithErrorHandling(
      `${BASE_URLS.v1}/cryptocurrency/info?id=${validatedId}`
    );

    if (!info?.data?.[validatedId]) {
      return NextResponse.json(
        { error: 'Coin not found' },
        { status: 404 }
      );
    }

    const coinInfo = info.data[validatedId];

    // Return minimal data for header
    const headerData = {
      id: validatedId,
      name: coinInfo.name,
      symbol: coinInfo.symbol,
      logoUrl: `https://s2.coinmarketcap.com/static/img/coins/64x64/${validatedId}.png`,
    };

    return NextResponse.json(headerData, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // Browser cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Error fetching coin header data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch coin header data' },
      { status: 500 }
    );
  }
}