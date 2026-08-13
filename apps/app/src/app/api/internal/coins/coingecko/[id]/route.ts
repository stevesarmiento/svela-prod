import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { effectRoute } from "@/lib/effect/server/route";

export const GET = effectRoute<{ params: Promise<{ id: string }> }>(
  (_req, ctx) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const { id } = yield* Effect.promise(() => ctx.params);
      const coin = yield* convex.serverQuery(
        api.coins.getCoinGeckoCoinById,
        { coingeckoId: id },
        { label: "getCoinGeckoCoinById" },
      );

      return NextResponse.json(coin);
    }),
  { name: "internal-coin-by-id" },
);
