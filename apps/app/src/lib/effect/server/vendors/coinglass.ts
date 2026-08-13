import { z } from "zod";

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
