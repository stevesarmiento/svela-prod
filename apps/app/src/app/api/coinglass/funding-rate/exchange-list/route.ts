import { Effect } from "effect";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import { ConvexService } from "@/lib/effect/server/convex";
import { effectRoute } from "@/lib/effect/server/route";
import { UpstreamHttp } from "@/lib/effect/server/upstream-http";
import {
  COINGLASS_BASE_URL,
  coinglassHeaders,
  resolveCoinglassSymbol,
  unwrapCoinglassEnvelope,
} from "@/lib/effect/server/vendors/coinglass";

const API_KEY = process.env.CG_API_KEY || process.env["CG-API-KEY"];

// Validation schema for funding rate data - fields optional to handle incomplete data
const FundingRateItemSchema = z.object({
  exchange: z.string(),
  funding_rate_interval: z.number().optional(),
  funding_rate: z.number().optional(),
  next_funding_time: z.number().optional(),
});

const FundingRateDataSchema = z.object({
  symbol: z.string(),
  stablecoin_margin_list: z.array(FundingRateItemSchema),
  token_margin_list: z.array(FundingRateItemSchema),
});

const FundingRateListSchema = z.array(FundingRateDataSchema);

interface ResolvedCoin {
  actualSymbol: string;
  coinInfo: {
    symbol: string;
    name: string;
    coinId: number;
    isSupported: boolean;
  } | null;
}

function completeRates(
  rates: ReadonlyArray<z.infer<typeof FundingRateItemSchema>>,
) {
  return rates
    .filter(
      (rate) =>
        rate.funding_rate_interval !== undefined &&
        rate.funding_rate !== undefined &&
        rate.next_funding_time !== undefined,
    )
    .map((rate) => ({
      exchange: rate.exchange,
      fundingRateInterval: rate.funding_rate_interval as number,
      fundingRate: rate.funding_rate as number,
      nextFundingTime: rate.next_funding_time as number,
    }));
}

export const GET = effectRoute(
  (req) =>
    Effect.gen(function* () {
      const symbolOrId = req.nextUrl.searchParams.get("symbol") || "BTC";
      const convex = yield* ConvexService;

      // Resolve the input (numeric coin id or symbol) to a CoinGlass symbol.
      const resolvedSymbol = yield* resolveCoinglassSymbol(convex, symbolOrId, {
        // Route-specific contract: 400 with a supportedCoins sample.
        coinIdNotFound: (coinId) =>
          convex
            .serverQuery(
              api.coins.getCoinglassSupportedCoinsList,
              {},
              { label: "getCoinglassSupportedCoinsList" },
            )
            .pipe(
              Effect.map((supportedCoins) =>
                NextResponse.json(
                  {
                    success: false,
                    error: `Coin with ID ${coinId} not found or not supported by CoinGlass`,
                    supportedCoins: supportedCoins.slice(0, 10),
                    coinId,
                  },
                  { status: 400 },
                ),
              ),
            ),
      });
      if (resolvedSymbol instanceof Response) return resolvedSymbol;

      let resolved: ResolvedCoin;
      if (resolvedSymbol.record) {
        // Historical contract: the raw record (incl. `originalSymbol`) passes
        // through to the response's coinInfo.
        resolved = {
          actualSymbol: resolvedSymbol.symbol,
          coinInfo: resolvedSymbol.record,
        };
      } else {
        const symbol = resolvedSymbol.symbol;
        const [isSupported, coin] = yield* Effect.all(
          [
            convex.serverQuery(
              api.coins.isCoinglassSupported,
              { symbol },
              { label: "isCoinglassSupported" },
            ),
            convex.serverQuery(
              api.coins.getCoinBySymbol,
              { symbol },
              { label: "getCoinBySymbol" },
            ),
          ],
          { concurrency: 2 },
        );
        if (!isSupported) {
          return NextResponse.json(
            {
              success: false,
              error: `Symbol ${symbolOrId} is not supported by CoinGlass`,
              inputSymbol: symbolOrId,
            },
            { status: 400 },
          );
        }
        resolved = {
          actualSymbol: symbol,
          coinInfo: coin
            ? {
                symbol,
                name: coin.name,
                coinId: coin.coinId,
                isSupported: true,
              }
            : null,
        };
      }

      if (!API_KEY) {
        // Route-specific 503 body: clients rely on the empty-data envelope.
        return NextResponse.json(
          {
            success: false,
            error:
              "CoinGlass API key is not configured. Please set CG_API_KEY or CG-API-KEY in your environment.",
            data: [],
            symbol: resolved.actualSymbol,
            originalInput: symbolOrId,
            coinInfo: resolved.coinInfo,
            lastUpdated: new Date().toISOString(),
          },
          { status: 503 },
        );
      }

      const http = yield* UpstreamHttp;
      const rows = yield* http.requestJson({
        vendor: "coinglass",
        endpoint: `${COINGLASS_BASE_URL}/futures/funding-rate/exchange-list?symbol=${resolved.actualSymbol}`,
        decode: (data) =>
          FundingRateListSchema.parse(unwrapCoinglassEnvelope(data)),
        init: {
          headers: coinglassHeaders(API_KEY),
          // Cache for 20 seconds (matches API update frequency)
          next: { revalidate: 20 },
        },
      });

      const transformedData = rows.map((item) => ({
        symbol: item.symbol,
        stablecoinMarginList: completeRates(item.stablecoin_margin_list),
        tokenMarginList: completeRates(item.token_margin_list),
      }));

      return NextResponse.json(
        {
          success: true,
          data: transformedData,
          symbol: resolved.actualSymbol,
          originalInput: symbolOrId,
          coinInfo: resolved.coinInfo,
          lastUpdated: new Date().toISOString(),
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=20, stale-while-revalidate=10",
          },
        },
      );
    }),
  { name: "coinglass-funding-rate" },
);
