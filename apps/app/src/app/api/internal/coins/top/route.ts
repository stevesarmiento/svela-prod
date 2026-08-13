import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { effectRoute } from "@/lib/effect/server/route";

export const GET = effectRoute(
  (req) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const limitParam = req.nextUrl.searchParams.get("limit");
      const limit = limitParam ? Number(limitParam) : undefined;

      const coins = yield* convex.serverQuery(
        api.coins.getTopCoinGeckoCoins,
        { limit },
        { label: "getTopCoinGeckoCoins" },
      );

      return NextResponse.json(coins);
    }),
  { name: "internal-coins-top" },
);
