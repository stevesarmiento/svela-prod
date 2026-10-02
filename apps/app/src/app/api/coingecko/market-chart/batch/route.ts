import { Effect } from "effect";
import { NextResponse } from "next/server";
import { RequestValidationError } from "@/lib/effect/server/errors";
import { effectRoute } from "@/lib/effect/server/route";
import {
  CACHEABLE_HEADERS,
  type MarketChartPayload,
  UNCACHEABLE_HEADERS,
  isCacheable,
  loadMarketChart,
} from "../load";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Upper bound per request; clients chunk larger watchlists. */
export const MAX_BATCH_IDS = 50;
/** Server-side fan-out to Convex; bounded so one large watchlist cannot starve other routes. */
const CONVEX_CONCURRENCY = 8;

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const id = raw.trim();
    if (id.length > 0 && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * `GET /api/coingecko/market-chart/batch?ids=a,b,c&days=1`
 *
 * One round trip for a whole watchlist. The response carries each coin under the
 * same `{ data, status }` shape as the single-coin route so clients can seed their
 * per-coin caches from it; coins whose read failed are listed in `failed` rather
 * than failing the request.
 */
export const GET = effectRoute(
  (request) =>
    Effect.gen(function* () {
      const searchParams = request.nextUrl.searchParams;
      const ids = parseCsv(searchParams.get("ids"));
      const days = searchParams.get("days") || "7";
      const vsCurrency = searchParams.get("vs_currency") || "usd";

      if (ids.length === 0) {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Missing required parameter: ids" }),
        );
      }
      if (ids.length > MAX_BATCH_IDS) {
        return yield* Effect.fail(
          new RequestValidationError({ message: `At most ${MAX_BATCH_IDS} ids per request` }),
        );
      }
      if (vsCurrency.toLowerCase() !== "usd") {
        return yield* Effect.fail(
          new RequestValidationError({ message: "Only vs_currency=usd is supported" }),
        );
      }

      const settled = yield* Effect.all(
        ids.map((id) =>
          loadMarketChart(id, days).pipe(
            Effect.map((payload) => ({ id, payload })),
            Effect.catch((error) =>
              Effect.sync(() => {
                console.warn(`[coingecko-market-chart-batch] ${id} failed: ${error._tag}`);
                return { id, payload: null as MarketChartPayload | null };
              }),
            ),
          ),
        ),
        { concurrency: CONVEX_CONCURRENCY },
      );

      const results: Record<string, MarketChartPayload> = {};
      const failed: string[] = [];
      let cacheable = true;
      for (const { id, payload } of settled) {
        if (payload) {
          results[id] = payload;
          if (!isCacheable(payload)) cacheable = false;
        } else {
          failed.push(id);
          cacheable = false;
        }
      }

      return NextResponse.json(
        { results, failed, status: { requested: ids.length, returned: Object.keys(results).length } },
        { status: 200, headers: cacheable ? CACHEABLE_HEADERS : UNCACHEABLE_HEADERS },
      );
    }),
  { name: "coingecko-market-chart-batch", requireAuth: true },
);
