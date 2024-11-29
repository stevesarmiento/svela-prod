import { ratelimit } from "@v1/kv/ratelimit";
import { NextResponse } from "next/server";
import { z } from "zod";

const BASE_URL = "https://api.coingecko.com/api/v3";
const API_KEY = process.env.COINGECKO_API_KEY;

// Validation schemas
const SearchQuerySchema = z.object({
  query: z.string().min(1).max(100),
});

const CoinIdSchema = z.object({
  id: z.string().min(1).max(100),
});

const CoinDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  market_cap_rank: z.number(),
  image: z.object({
    large: z.string(),
    small: z.string(),
    thumb: z.string(),
  }),
  description: z.object({
    en: z.string(),
  }),
  market_data: z.object({
    current_price: z.record(z.number()),
    market_cap: z.record(z.number()),
    total_volume: z.record(z.number()), 
    price_change_percentage_24h: z.number(),
    volume_24h: z.record(z.number()),   
    high_24h: z.record(z.number()),
    low_24h: z.record(z.number()),
    ath: z.record(z.number()),
    ath_change_percentage: z.record(z.number()),
    circulating_supply: z.number(),
    max_supply: z.number().nullable(),
    sparkline_7d: z.object({
      price: z.array(z.number()),
    }),
  }),
});

async function fetchWithErrorHandling(url: string) {
  if (!API_KEY) {
    throw new Error('CoinGecko API key is not configured');
  }

  try {
    const response = await fetch(url, {
      headers: {
        'x-cg-demo-api-key': API_KEY,
      },
      next: {
        revalidate: 60,
      },
    });

    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("CoinGecko API error:", error);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const coinId = searchParams.get("id");

    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const { success } = await ratelimit.limit(`${ip}-coingecko`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    // Handle search endpoint
    if (query) {
      const validatedQuery = SearchQuerySchema.parse({ query });
      const data = await fetchWithErrorHandling(
        `${BASE_URL}/search?query=${encodeURIComponent(validatedQuery.query)}`
      );
      
      if (!data?.coins) {
        throw new Error('Invalid response format from CoinGecko API');
      }

      return NextResponse.json({
        coins: data.coins.slice(0, 100)
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      });
    }

    // Handle coin details endpoint
    if (coinId) {
      const validatedId = CoinIdSchema.parse({ id: coinId });
      const data = await fetchWithErrorHandling(
        `${BASE_URL}/coins/${validatedId.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`
      );
      
      const validatedData = CoinDetailSchema.parse(data);
      
      return NextResponse.json(validatedData, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      });
    }

    return NextResponse.json(
      { error: "Missing query or id parameter" },
      { status: 400 }
    );

  } catch (error) {
    console.error("CoinGecko route error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch data from CoinGecko" },
      { status: 500 }
    );
  }
}