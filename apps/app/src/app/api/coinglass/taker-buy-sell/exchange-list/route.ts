import { Effect } from "effect";
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";
import { resolveCoinglassSymbol } from "@/lib/effect/server/vendors/coinglass";

export const dynamic = "force-dynamic";

export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const convex = yield* ConvexService;

      const searchParams = request.nextUrl.searchParams;
      const rawSymbol = (searchParams.get("symbol") || "").trim();
      const range = (searchParams.get("range") || "24h").trim();

      if (!rawSymbol) {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Symbol parameter is required" }),
        );
      }

      const resolved = yield* resolveCoinglassSymbol(convex, rawSymbol);
      if (resolved instanceof Response) return resolved;
      const { symbol, coinInfo } = resolved;

      // Support check and snapshot read are independent — run them concurrently
      // instead of paying two sequential Convex round trips.
      const [isSupported, snapshot] = yield* Effect.all(
        [
          convex.serverQuery(
            api.coins.isCoinglassSupported,
            { symbol },
            { label: "isCoinglassSupported" },
          ),
          convex.serverQuery(
            api.coinglassReads.getTakerBuySellExchangeListSnapshot,
            { symbol, range },
            { label: "getTakerBuySellExchangeListSnapshot" },
          ),
        ],
        { concurrency: 2 },
      );
      if (!isSupported) {
        return NextResponse.json(
          {
            success: false,
            error: `Symbol ${symbol} is not supported by CoinGlass`,
            inputSymbol: rawSymbol,
          },
          { status: 400 },
        );
      }

      if (!snapshot.data || snapshot.stale) {
        yield* convex.warmup(
          api.coinglassWarmup.requestTakerBuySellExchangeListSnapshotRefresh,
          { symbol, range },
          "coinglass-taker-exchange:requestTakerBuySellExchangeListSnapshotRefresh",
        );
      }

      return NextResponse.json(
        {
          success: true,
          data: snapshot.data
            ? {
                symbol: snapshot.data.symbol,
                overall: snapshot.data.overall,
                exchanges: snapshot.data.exchanges,
              }
            : {
                symbol,
                overall: {
                  buyRatio: 0,
                  sellRatio: 0,
                  buyVolumeUsd: 0,
                  sellVolumeUsd: 0,
                  totalVolumeUsd: 0,
                },
                exchanges: [],
              },
          range,
          symbol,
          originalInput: rawSymbol,
          coinInfo,
          lastUpdated: new Date(snapshot.lastUpdated || 0).toISOString(),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        },
      );
    }),
  { name: "coinglass-taker-exchange" },
);
