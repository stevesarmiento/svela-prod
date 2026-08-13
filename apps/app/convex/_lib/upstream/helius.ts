/**
 * Loose zod schemas for the Helius fields portfolioJobs consumes.
 *
 * DAS (getAssetsByOwner): nested fields are `.catch()`-tolerant because the
 * old code optional-chained through them; per-asset validation happens at the
 * call site (safeParse each item, skip failures). Wallet balances stay strict
 * per element on purpose: silently skipping/emptying malformed balance rows
 * would feed partial data into wallet reconciliation (which deletes coins),
 * where the old code crashed the sync instead — a validation throw preserves
 * that blast radius while making the drift greppable.
 */

import { z } from "zod";
import { parseUpstream } from "./parse";

const SOURCE = "helius";

const dasPriceInfoSchema = z
  .object({ total_price: z.number().nullish().catch(null) })
  .nullish()
  .catch(null);

const dasTokenInfoSchema = z
  .object({ price_info: dasPriceInfoSchema })
  .nullish()
  .catch(null);

export const heliusDasAssetSchema = z.object({
  interface: z.string().nullish().catch(null),
  id: z.string().nullish().catch(null),
  token_info: dasTokenInfoSchema,
});
export type HeliusDasAsset = z.infer<typeof heliusDasAssetSchema>;

export const heliusDasAssetsByOwnerResponseSchema = z.object({
  result: z
    .object({
      // Items are validated one-by-one at the call site.
      items: z.array(z.unknown()).nullish().catch(null),
      nativeBalance: z
        .object({
          lamports: z.number().nullish().catch(null),
          total_price: z.number().nullish().catch(null),
        })
        .nullish()
        .catch(null),
    })
    .nullish()
    .catch(null),
});
export type HeliusDasAssetsByOwnerResponse = z.infer<
  typeof heliusDasAssetsByOwnerResponseSchema
>;

export function parseHeliusDasAssetsByOwnerResponse(
  value: unknown,
): HeliusDasAssetsByOwnerResponse {
  return parseUpstream({
    source: SOURCE,
    schema: heliusDasAssetsByOwnerResponseSchema,
    value,
  });
}

export const heliusBalancesResponseSchema = z.object({
  balances: z.array(z.object({ mint: z.string() })).nullish(),
});
export type HeliusBalancesResponse = z.infer<
  typeof heliusBalancesResponseSchema
>;

export function parseHeliusBalancesResponse(
  value: unknown,
): HeliusBalancesResponse {
  return parseUpstream({
    source: SOURCE,
    schema: heliusBalancesResponseSchema,
    value,
  });
}
