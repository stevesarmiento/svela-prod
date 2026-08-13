import type { FunctionReturnType } from "convex/server";
import { Effect } from "effect";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import type { ConvexServiceShape } from "../convex";
import type { ConvexQueryError, ConvexTimeoutError } from "../errors";

export const COINGLASS_BASE_URL = "https://open-api-v4.coinglass.com/api";

export function coinglassHeaders(apiKey: string): HeadersInit {
  return {
    "CG-API-KEY": apiKey,
    "Content-Type": "application/json",
  };
}

const CoinglassEnvelopeSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: z.unknown(),
});

/**
 * Validates the CoinGlass `{code, msg, data}` envelope and unwraps `data`.
 * Throws on `code !== "0"` — inside a `decode` callback this surfaces as an
 * `UpstreamDecodeError` (an upstream-reported failure, mapped to 502).
 */
export function unwrapCoinglassEnvelope(raw: unknown): unknown {
  const envelope = CoinglassEnvelopeSchema.parse(raw);
  if (envelope.code !== "0") {
    throw new Error(`CoinGlass API error: ${envelope.msg ?? "Unknown error"}`);
  }
  return envelope.data;
}

export interface CoinglassCoinInfo {
  symbol: string;
  name: string;
  coinId: number;
  isSupported: boolean;
}

export interface ResolvedCoinglassSymbol {
  /** CoinGlass base symbol, uppercased. */
  symbol: string;
  /** Narrow 4-field coin info (numeric-id inputs only; null for symbol inputs). */
  coinInfo: CoinglassCoinInfo | null;
  /**
   * Raw Convex record for routes whose historical contract passes the record
   * through verbatim (it carries an extra `originalSymbol` field).
   */
  record: FunctionReturnType<typeof api.coins.getCoinglassSymbolByCoinId>;
}

function isProbablyCoinGeckoId(value: string): boolean {
  return value.includes("-") || value.toLowerCase() === value;
}

/**
 * Resolves user input (numeric coin id, CoinGecko id, or ticker symbol) into
 * a CoinGlass base symbol — the symbol-resolution block previously duplicated
 * across the CoinGlass routes.
 *
 * Numeric ids that can't be resolved return a 400 Response directly; routes
 * with richer historical 400 bodies (extra `coinId` / `supportedCoins`
 * fields) supply `coinIdNotFound` to keep those contracts byte-identical.
 */
export function resolveCoinglassSymbol(
  convex: ConvexServiceShape,
  symbolOrId: string,
  opts?: {
    coinIdNotFound?: (
      coinId: number,
    ) => Effect.Effect<Response, ConvexQueryError | ConvexTimeoutError>;
  },
): Effect.Effect<
  ResolvedCoinglassSymbol | Response,
  ConvexQueryError | ConvexTimeoutError
> {
  return Effect.gen(function* () {
    const numericCoinId = Number.parseInt(symbolOrId, 10);
    if (!Number.isNaN(numericCoinId)) {
      const resolved = yield* convex.serverQuery(
        api.coins.getCoinglassSymbolByCoinId,
        { coinId: numericCoinId },
        { label: "getCoinglassSymbolByCoinId" },
      );
      if (!resolved) {
        if (opts?.coinIdNotFound) {
          return yield* opts.coinIdNotFound(numericCoinId);
        }
        return NextResponse.json(
          {
            success: false,
            error: `Coin with ID ${numericCoinId} not found or not supported by CoinGlass`,
          },
          { status: 400 },
        );
      }
      const symbol = resolved.symbol.toUpperCase();
      return {
        symbol,
        coinInfo: {
          symbol,
          name: resolved.name,
          coinId: resolved.coinId,
          isSupported: resolved.isSupported,
        },
        record: resolved,
      };
    }

    let symbol = symbolOrId.toUpperCase();
    if (isProbablyCoinGeckoId(symbolOrId)) {
      const coin = yield* convex.serverQuery(
        api.coins.getCoinGeckoCoinById,
        { coingeckoId: symbolOrId.toLowerCase() },
        { label: "getCoinGeckoCoinById" },
      );
      if (coin) symbol = coin.symbol.toUpperCase();
    }
    return { symbol, coinInfo: null, record: null };
  });
}
