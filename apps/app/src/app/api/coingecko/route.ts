import { Effect } from "effect";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";

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

// Route-specific 400 contract: includes zod issue details.
function invalidParams(error: z.ZodError): Response {
  return NextResponse.json(
    { error: "Invalid parameters", details: error.errors },
    { status: 400 },
  );
}

export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const { searchParams } = new URL(request.url);
      const query = searchParams.get("query");
      const coinId = searchParams.get("id");
      const list = searchParams.get("list");
      const includePlatform = searchParams.get("include_platform");

      // Handle coins list endpoint
      if (list === 'true') {
        const listParsed = ListQuerySchema.safeParse({ include_platform: includePlatform });
        if (!listParsed.success) return invalidParams(listParsed.error);
        const { include_platform: includePlatformFlag } = listParsed.data;

        // DB-only: we always return the stored CoinGecko coin list.
        // `include_platform` is best-effort; platforms are present only if previously ingested.
        const coins = yield* convex.serverQuery(
          api.coins.getAllCoinGeckoCoins,
          { limit: 1000 },
          { label: "getAllCoinGeckoCoins" },
        );

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
        const queryParsed = SearchQuerySchema.safeParse({ query });
        if (!queryParsed.success) return invalidParams(queryParsed.error);
        const coins = yield* convex.serverQuery(
          api.coins.searchCoinGeckoCoins,
          { query: queryParsed.data.query, limit: 50 },
          { label: "searchCoinGeckoCoins" },
        );

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
        const idParsed = CoinIdSchema.safeParse({ id: coinId });
        if (!idParsed.success) return invalidParams(idParsed.error);

        const coin = yield* convex.serverQuery(
          api.coins.getCoinGeckoCoinById,
          { coingeckoId: idParsed.data.id },
          { label: "getCoinGeckoCoinById" },
        );

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

      return yield* Effect.fail(
        new RequestValidationError({
          message: "Missing required parameter. Use ?list=true for coins list, ?query=<search> for search, or ?id=<coin_id> for coin details",
        }),
      );
    }),
  { name: "coingecko-base", requireAuth: true },
);
