import { convex, getServerToken } from "@/lib/convex-server";
import { api } from "../../../../convex/_generated/api";

import type { CoingeckoMarketRowLike } from "../metric-catalog";
import { getSmartScreenerMetric } from "../metric-registry";
import type { ScreenFilterOp, ScreeningDsl } from "../screening-dsl";
import type { TakerScopedSnapshotLike } from "../taker-metrics";

const MAX_CANDIDATES = 5000;
const PAGE_SIZE = 500;
/** Matches the Convex batch query's own cap. */
const TAKER_BATCH_CAP = 500;
const CONVEX_QUERY_TIMEOUT_MS = 8_000;
const TAKER_WARMUP_MAX = 25;

export class ExecuteTimeoutError extends Error {
  constructor(label: string) {
    super(`Upstream query timed out: ${label}`);
    this.name = "ExecuteTimeoutError";
  }
}

/** ConvexHttpClient has no abort support — race a timer and fail fast. */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ExecuteTimeoutError(label)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function compare(op: ScreenFilterOp, left: number, right: number): boolean {
  if (op === "gt") return left > right;
  if (op === "gte") return left >= right;
  if (op === "lt") return left < right;
  if (op === "lte") return left <= right;
  return left === right;
}

interface TakerJoinRow {
  scoped: TakerScopedSnapshotLike;
  stale: boolean;
}

function metricValueForRow(args: {
  metricId: string;
  row: CoingeckoMarketRowLike;
  takerByCoinId: ReadonlyMap<string, TakerJoinRow> | null;
}): number | null {
  const metric = getSmartScreenerMetric(args.metricId);
  if (!metric) return null;
  if (metric.source === "markets") return metric.getValue(args.row);
  const joined = args.takerByCoinId?.get(args.row.coingeckoId);
  return joined ? metric.getValue(joined.scoped) : null;
}

/**
 * Score `source: "markets"` filters (includes precomputed technicals).
 * Null metric values FAIL the filter and count into missingByMetricId.
 */
function scoreRowAgainstMarketFilters(args: {
  row: CoingeckoMarketRowLike;
  filters: ScreeningDsl["filters"];
  missingByMetricId: Record<string, number>;
}): boolean {
  for (const f of args.filters) {
    const metric = getSmartScreenerMetric(f.metricId);
    if (!metric || metric.source !== "markets") continue;

    const rawValue = metric.getValue(args.row);
    if (rawValue == null) {
      args.missingByMetricId[f.metricId] =
        (args.missingByMetricId[f.metricId] ?? 0) + 1;
      return false;
    }

    // Filter values are canonical post-parse (normalized in ScreeningDslSchema).
    if (!compare(f.op, rawValue, f.value)) return false;
  }

  return true;
}

function scoreRowAgainstTakerFilters(args: {
  row: CoingeckoMarketRowLike;
  filters: ScreeningDsl["filters"];
  takerByCoinId: ReadonlyMap<string, TakerJoinRow>;
  missingByMetricId: Record<string, number>;
}): boolean {
  for (const f of args.filters) {
    const metric = getSmartScreenerMetric(f.metricId);
    if (!metric || metric.source !== "taker") continue;

    const joined = args.takerByCoinId.get(args.row.coingeckoId);
    const rawValue = joined ? metric.getValue(joined.scoped) : null;
    if (rawValue == null) {
      args.missingByMetricId[f.metricId] =
        (args.missingByMetricId[f.metricId] ?? 0) + 1;
      return false;
    }

    if (!compare(f.op, rawValue, f.value)) return false;
  }

  return true;
}

/** Sort with nulls LAST regardless of direction. */
function sortRows(args: {
  rows: Array<CoingeckoMarketRowLike>;
  dsl: ScreeningDsl;
  takerByCoinId: ReadonlyMap<string, TakerJoinRow> | null;
}): Array<CoingeckoMarketRowLike> {
  const sort = args.dsl.sort;
  if (!sort) return args.rows;
  const metric = getSmartScreenerMetric(sort.metricId);
  if (!metric) return args.rows;

  const order = sort.order;
  return args.rows.slice().sort((a, b) => {
    const av = metricValueForRow({
      metricId: sort.metricId,
      row: a,
      takerByCoinId: args.takerByCoinId,
    });
    const bv = metricValueForRow({
      metricId: sort.metricId,
      row: b,
      takerByCoinId: args.takerByCoinId,
    });
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (order === "desc") return av > bv ? -1 : av < bv ? 1 : 0;
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
}

function dslMetricIds(dsl: ScreeningDsl): Array<string> {
  const ids = new Set<string>();
  for (const f of dsl.filters) ids.add(f.metricId);
  if (dsl.sort) ids.add(dsl.sort.metricId);
  return Array.from(ids);
}

function dslNeedsTaker(dsl: ScreeningDsl): boolean {
  return dslMetricIds(dsl).some(
    (id) => getSmartScreenerMetric(id)?.source === "taker",
  );
}

export interface ExecuteResult {
  rows: Array<{
    coingeckoId: string;
    symbol: string;
    name: string;
    image: string;
    currentPrice?: number;
    marketCap?: number;
    marketCapRank?: number;
    totalVolume?: number;
    priceChangePercentage24h?: number;
    updatedAt?: number;
    metrics?: Record<string, number | null>;
  }>;
  resultIds: Array<string>;
  coverage: {
    scanned: number;
    matched: number;
    maxRankScanned: number | null;
    missingByMetricId: Record<string, number>;
    warmupScheduled: boolean;
    warmupTopN: number | null;
    marketChartWarmupRequestedCount: number;
    marketChartWarmupDays: Array<string>;
    takerCoinsRequested: number;
    takerCoinsMissing: number;
    takerWarmupRequestedCount: number;
  };
  userMessage: string | null;
}

/**
 * Execute a canonical DSL against the Convex market universe.
 *
 * Phases:
 * 1. Rank-ordered scan of `coingeckoMarkets` (pages of 500, top 5000), scoring
 *    all `markets`-source filters — technicals included, since they're
 *    precomputed row columns now (no per-coin series fan-out).
 * 2. Taker phase (only when the DSL uses taker metrics): ONE id-keyed batch
 *    lookup for the market-matched rows (cap 500), exchange-scoped via
 *    `dsl.takerContext`, with warmup for missing/stale snapshots.
 */
export async function executeScreeningDsl(args: {
  dsl: ScreeningDsl;
  restrictIds: ReadonlySet<string> | null;
}): Promise<ExecuteResult> {
  const { dsl, restrictIds } = args;
  const serverToken = getServerToken();

  const missingByMetricId: Record<string, number> = {};
  const needsTaker = dslNeedsTaker(dsl);
  const marketPhaseCap = needsTaker ? TAKER_BATCH_CAP : dsl.limit;

  const marketMatched: Array<CoingeckoMarketRowLike> = [];
  let scanned = 0;
  let minRank = 1;
  let maxRankScanned: number | null = null;
  const maxPages = Math.ceil(MAX_CANDIDATES / PAGE_SIZE);

  for (let page = 0; page < maxPages; page += 1) {
    const pageRows: Array<CoingeckoMarketRowLike> = await withTimeout(
      convex.query(api.coingeckoMarkets.getMarketDataPageByRank, {
        serverToken,
        minRank,
        limit: PAGE_SIZE,
      }),
      CONVEX_QUERY_TIMEOUT_MS,
      "markets page",
    );

    if (pageRows.length === 0) break;
    const lastRank = pageRows[pageRows.length - 1]?.marketCapRank;
    if (typeof lastRank === "number") {
      maxRankScanned = maxRankScanned
        ? Math.max(maxRankScanned, lastRank)
        : lastRank;
      minRank = lastRank + 1;
    } else {
      minRank += PAGE_SIZE;
    }

    for (const row of pageRows) {
      if (scanned >= MAX_CANDIDATES) break;
      scanned += 1;

      if (restrictIds && !restrictIds.has(row.coingeckoId)) continue;
      if (
        !scoreRowAgainstMarketFilters({
          row,
          filters: dsl.filters,
          missingByMetricId,
        })
      )
        continue;

      marketMatched.push(row);
      if (marketMatched.length >= marketPhaseCap) break;
    }

    if (scanned >= MAX_CANDIDATES) break;
    if (marketMatched.length >= marketPhaseCap) break;
  }

  // ---- Taker phase ----
  let takerByCoinId: Map<string, TakerJoinRow> | null = null;
  let takerCoinsRequested = 0;
  let takerCoinsMissing = 0;
  let takerWarmupRequestedCount = 0;
  let matchedRows = marketMatched;

  if (needsTaker && marketMatched.length > 0) {
    const takerRange = dsl.takerContext?.range ?? "24h";
    const exchange = dsl.takerContext?.exchange?.trim() || null;
    const coins = marketMatched.slice(0, TAKER_BATCH_CAP).map((r) => ({
      coingeckoId: r.coingeckoId,
      symbol: r.symbol.toUpperCase(),
    }));
    takerCoinsRequested = coins.length;

    const batch = await withTimeout(
      convex.query(api.coinglassReads.getTakerBuySellSnapshotsByCoinsBatch, {
        serverToken,
        coins,
        range: takerRange,
      }),
      CONVEX_QUERY_TIMEOUT_MS,
      "taker batch",
    );

    takerByCoinId = new Map();
    const warmupTargets: Array<{ coingeckoId: string; symbol: string }> = [];

    for (const row of batch) {
      if (!row.data) {
        takerCoinsMissing += 1;
        if (warmupTargets.length < TAKER_WARMUP_MAX) {
          warmupTargets.push({
            coingeckoId: row.coingeckoId,
            symbol: row.symbol,
          });
        }
        continue;
      }

      if (row.stale && warmupTargets.length < TAKER_WARMUP_MAX) {
        warmupTargets.push({
          coingeckoId: row.coingeckoId,
          symbol: row.symbol,
        });
      }

      const snapshot = row.data;
      const scoped =
        exchange && snapshot.exchanges.length > 0
          ? snapshot.exchanges.find(
              (ex) => ex.exchange.toLowerCase() === exchange.toLowerCase(),
            ) ?? snapshot.overall
          : snapshot.overall;

      takerByCoinId.set(row.coingeckoId, { scoped, stale: row.stale });
    }

    takerWarmupRequestedCount = warmupTargets.length;
    if (warmupTargets.length > 0) {
      void Promise.all(
        warmupTargets.map((t) =>
          convex.mutation(
            api.coinglassWarmup.requestTakerBuySellExchangeListSnapshotRefresh,
            {
              serverToken,
              symbol: t.symbol,
              coingeckoId: t.coingeckoId,
              range: takerRange,
            },
          ),
        ),
      ).catch(() => null);
    }

    const scopedMap = takerByCoinId;
    matchedRows = marketMatched.filter((row) =>
      scoreRowAgainstTakerFilters({
        row,
        filters: dsl.filters,
        takerByCoinId: scopedMap,
        missingByMetricId,
      }),
    );
  }

  const sorted = sortRows({ rows: matchedRows, dsl, takerByCoinId }).slice(
    0,
    dsl.limit,
  );
  const metricIds = dslMetricIds(dsl);
  const rows = sorted.map((row) => ({
    coingeckoId: row.coingeckoId,
    symbol: row.symbol,
    name: row.name,
    image: row.image,
    currentPrice: row.currentPrice,
    marketCap: row.marketCap,
    marketCapRank: row.marketCapRank,
    totalVolume: row.totalVolume,
    priceChangePercentage24h: row.priceChangePercentage24h,
    updatedAt: row.updatedAt,
    metrics:
      metricIds.length > 0
        ? Object.fromEntries(
            metricIds.map((id) => [
              id,
              metricValueForRow({ metricId: id, row, takerByCoinId }),
            ]),
          )
        : undefined,
  }));

  const resultIds = sorted.map((r) => r.coingeckoId);

  // Under-filled full-universe scans warm deeper market data for next time.
  const warmupScheduled =
    scanned >= MAX_CANDIDATES &&
    resultIds.length < dsl.limit &&
    dsl.universe === "all";
  let warmupTopN: number | null = null;
  if (warmupScheduled) {
    warmupTopN = MAX_CANDIDATES;
    void convex
      .mutation(api.coingeckoWarmup.requestTopMarketsRefresh, {
        serverToken,
        topN: warmupTopN,
      })
      .catch(() => null);
  }

  const userMessage = warmupScheduled
    ? "Results may be partial. Warming up deeper market data now—try again in a moment."
    : resultIds.length === 0 && takerWarmupRequestedCount > 0
      ? "No matches yet. Derivatives data is warming up for some coins—try again in a moment."
      : resultIds.length === 0
        ? "No matches. Try lowering thresholds or removing a constraint."
        : takerCoinsMissing > 0
          ? `${takerCoinsMissing} coin${takerCoinsMissing === 1 ? "" : "s"} excluded: no derivatives data.`
          : null;

  return {
    rows,
    resultIds: resultIds.slice(0, 500),
    coverage: {
      scanned,
      matched: matchedRows.length,
      maxRankScanned,
      missingByMetricId,
      warmupScheduled,
      warmupTopN,
      // Kept (zeroed) for response compatibility: technicals no longer fetch
      // per-coin series at request time.
      marketChartWarmupRequestedCount: 0,
      marketChartWarmupDays: [],
      takerCoinsRequested,
      takerCoinsMissing,
      takerWarmupRequestedCount,
    },
    userMessage,
  };
}
