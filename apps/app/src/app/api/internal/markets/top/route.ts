import { Effect } from "effect";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { effectRoute } from "@/lib/effect/server/route";

function parseLimit(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get("limit");
  if (!raw) return 250;
  const limit = Number(raw);
  if (!Number.isFinite(limit)) return 250;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

export const GET = effectRoute(
  (req) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const limit = parseLimit(req);

      const rows = yield* convex.serverQuery(
        api.coingeckoMarkets.getTopMarketDataByRank,
        { limit },
        { label: "getTopMarketDataByRank" },
      );

      return NextResponse.json(rows, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
        },
      });
    }),
  { name: "internal-markets-top" },
);
