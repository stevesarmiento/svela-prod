import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";

export const POST = effectRoute(
  (req) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const body = yield* Effect.promise(
        () => req.json().catch(() => null) as Promise<unknown>,
      );
      const { query, limit = 20 } = (body ?? {}) as {
        query?: unknown;
        limit?: unknown;
      };

      if (!query) {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Query parameter is required" }),
        );
      }

      // Use CoinGecko search instead of legacy CoinMarketCap search
      const coins = yield* convex.serverQuery(
        api.coins.searchCoinGeckoCoins,
        { query: query.toString(), limit: Number(limit) },
        { label: "searchCoinGeckoCoins" },
      );

      // Transform to match expected interface (coinId -> coingeckoId)
      const transformedCoins = coins.map(coin => ({
        coinId: coin.coingeckoId, // Use CoinGecko ID as coinId
        name: coin.name,
        symbol: coin.symbol
      }));

      return NextResponse.json(transformedCoins);
    }),
  { name: "convex-search-coins" },
);
