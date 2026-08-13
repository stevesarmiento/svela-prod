/**
 * Loose zod schema for the Birdeye token_overview fields portfolioJobs
 * consumes. Missing/odd containers and a wrong-typed coingeckoId all degrade
 * to null — i.e. "unresolved mint". That is safe here: Birdeye is only
 * consulted for mints absent from the portfolioMintMappings cache, so a null
 * can never un-map an already-resolved mint; the coin simply is not added.
 */

import { z } from "zod";
import { parseUpstream } from "./parse";

const SOURCE = "birdeye";

export const birdeyeTokenOverviewResponseSchema = z.object({
  data: z
    .object({
      extensions: z
        .object({
          coingeckoId: z.string().nullish().catch(null),
        })
        .nullish()
        .catch(null),
    })
    .nullish()
    .catch(null),
});
export type BirdeyeTokenOverviewResponse = z.infer<
  typeof birdeyeTokenOverviewResponseSchema
>;

export function parseBirdeyeTokenOverviewResponse(
  value: unknown,
): BirdeyeTokenOverviewResponse {
  return parseUpstream({
    source: SOURCE,
    schema: birdeyeTokenOverviewResponseSchema,
    value,
  });
}
