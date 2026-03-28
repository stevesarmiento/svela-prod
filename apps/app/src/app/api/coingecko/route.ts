import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

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
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const coinId = searchParams.get("id");
    const list = searchParams.get("list");
    const includePlatform = searchParams.get("include_platform");
    const serverToken = getServerToken();

    // Handle coins list endpoint
    if (list === 'true') {
      const { include_platform: includePlatformFlag } = ListQuerySchema.parse({ include_platform: includePlatform });

      // DB-only: we always return the stored CoinGecko coin list.
      // `include_platform` is best-effort; platforms are present only if previously ingested.
      const coins = await convex.query(api.coins.getAllCoinGeckoCoins, {
        serverToken,
        limit: 1000,
      });

      return NextResponse.json({
        coins,
        meta: {
          total: coins.length,
          includePlatform: includePlatformFlag,
          source: "convex",
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
      const coins = await convex.query(api.coins.searchCoinGeckoCoins, {
        serverToken,
        query: validatedQuery.query,
        limit: 50,
      });

      return NextResponse.json({
        coins,
        meta: {
          total: coins.length,
          source: "convex",
        },
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      });
    }

    // Handle coin details endpoint
    if (coinId) {
      const validatedId = CoinIdSchema.parse({ id: coinId });

      const coin = await convex.query(api.coins.getCoinGeckoCoinById, {
        serverToken,
        coingeckoId: validatedId.id,
      });

      return NextResponse.json({
        coin,
        meta: {
          source: "convex",
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
    console.error("CoinGecko DB route error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read CoinGecko data from DB" },
      { status: 500 }
    );
  }
}