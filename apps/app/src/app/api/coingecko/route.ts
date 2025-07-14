import { NextResponse } from "next/server";
import { z } from "zod";
import { getCoinsList, searchCoins, getCoinData, getRateLimitStatus } from "@/lib/coingecko";

// Validation schemas
const SearchQuerySchema = z.object({
  query: z.string().min(1).max(100),
});

const CoinIdSchema = z.object({
  id: z.string().min(1).max(100),
});

const ListQuerySchema = z.object({
  include_platform: z.string().optional().transform(val => val === 'true'),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const coinId = searchParams.get("id");
    const list = searchParams.get("list");
    const includePlatform = searchParams.get("include_platform");

    // Check rate limit status
    const rateLimitStatus = getRateLimitStatus();
    console.log('🚦 CoinGecko Rate Limit Status:', rateLimitStatus);

    // Handle coins list endpoint
    if (list === 'true') {
      const { include_platform: includePlatformFlag } = ListQuerySchema.parse({ include_platform: includePlatform });
      
      const coins = await getCoinsList(includePlatformFlag);
      
      return NextResponse.json({
        coins,
        meta: {
          total: coins.length,
          rateLimitStatus
        }
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60', // 5 minutes cache
        },
      });
    }

    // Handle search endpoint
    if (query) {
      const validatedQuery = SearchQuerySchema.parse({ query });
      const data = await searchCoins(validatedQuery.query);
      
      return NextResponse.json({
        ...data,
        meta: {
          total: data.coins.length,
          rateLimitStatus
        }
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      });
    }

    // Handle coin details endpoint
    if (coinId) {
      const validatedId = CoinIdSchema.parse({ id: coinId });
      const data = await getCoinData(validatedId.id);
      
      return NextResponse.json({
        ...data,
        meta: {
          rateLimitStatus
        }
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      });
    }

    return NextResponse.json(
      { error: "Missing required parameter. Use ?list=true for coins list, ?query=<search> for search, or ?id=<coin_id> for coin details" },
      { status: 400 }
    );

  } catch (error) {
    console.error("CoinGecko API route error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", details: error.errors },
        { status: 400 }
      );
    }

    // Handle rate limit errors
    if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
      return NextResponse.json(
        { error: error.message, rateLimitStatus: getRateLimitStatus() },
        { status: 429 }
      );
    }

    // Handle API key errors
    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch data from CoinGecko" },
      { status: 500 }
    );
  }
}