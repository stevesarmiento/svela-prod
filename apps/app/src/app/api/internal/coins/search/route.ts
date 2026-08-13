import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { effectRoute } from "@/lib/effect/server/route";

export const GET = effectRoute(
  (req) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const query = req.nextUrl.searchParams.get("query") ?? "";
      const limitParam = req.nextUrl.searchParams.get("limit");
      const limit = limitParam ? Number(limitParam) : undefined;

      if (!query.trim()) {
        return NextResponse.json([], { status: 200 });
      }

      const coins = yield* convex.serverQuery(
        api.coins.searchCoinGeckoCoins,
        { query: query.trim(), limit },
        { label: "searchCoinGeckoCoins" },
      );

      return NextResponse.json(coins);
    }),
  { name: "internal-coins-search" },
);
