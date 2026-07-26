"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Effect } from "effect";
import type { LivelinePoint } from "liveline";
import { CoinGeckoApi } from "@/lib/effect/coingecko-api";
import { runPromise } from "@/lib/effect/runtime-coingecko";
import {
  getBucketMsFromTimeScale,
  getRangeDaysFromTimeScale,
  getWatchlistAggregateRangeEndMs,
} from "@/hooks/use-coingecko-watchlist-aggregate-chart-isolated";

export interface HoldingsPosition {
  coinId: string;
  holdings: number;
}

interface HoldingsValueSeriesResult {
  points: LivelinePoint[];
  isLoading: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
}

function toEpochSeconds(timeMs: number): number {
  return Math.floor(timeMs / 1000);
}

function getDaysFromTimeScale(timeScale: string): string {
  if (timeScale === "1d") return "1";
  if (timeScale === "7d") return "7";
  if (timeScale === "30d") return "30";
  if (timeScale === "max") return "365";
  if (timeScale === "2y") return "730";
  return "7";
}

function buildBucketTimesMs(args: {
  startTimeMs: number;
  endTimeMs: number;
  bucketMs: number;
}): Array<number> {
  const bucketTimesMs: Array<number> = [];
  for (let t = args.startTimeMs; t <= args.endTimeMs; t += args.bucketMs) {
    bucketTimesMs.push(t);
  }
  return bucketTimesMs;
}

export function useHoldingsValueOverTime(args: {
  positions: ReadonlyArray<HoldingsPosition>;
  timeScale: string;
}): HoldingsValueSeriesResult {
  const positions = args.positions.flatMap((row) =>
    Number.isFinite(row.holdings) && row.holdings > 0
      ? [{ coinId: row.coinId, holdings: row.holdings }]
      : [],
  );

  const stablePositionsKey = positions
    .map((row) => {
      const coinId = row.coinId.trim();
      return coinId.length > 0 ? `${coinId}:${row.holdings}` : null;
    })
    .filter((row): row is string => row !== null)
    .sort()
    .join(",");

  const days = getDaysFromTimeScale(args.timeScale);
  const rangeEndTimeMs = getWatchlistAggregateRangeEndMs(args.timeScale);

  const query = useQuery({
    queryKey: [
      "holdings-value-over-time",
      stablePositionsKey,
      args.timeScale,
      rangeEndTimeMs,
    ],
    queryFn: async (): Promise<LivelinePoint[]> => {
      if (!positions.length) return [];

      const swallowToNull = (_: unknown) => Effect.succeed(null);

      const fetchEffects = positions.map((row) =>
        CoinGeckoApi.getMarketChart({ coinId: row.coinId, days }).pipe(
          Effect.map((response) => ({
            coinId: row.coinId,
            holdings: row.holdings,
            prices: response.data.prices,
          })),
          Effect.catchTags({
            CoinGeckoInvalidParamsError: swallowToNull,
            CoinGeckoUnauthorizedError: swallowToNull,
            CoinGeckoNotFoundError: swallowToNull,
            CoinGeckoRateLimitedError: swallowToNull,
            CoinGeckoApiError: swallowToNull,
            CoinGeckoDecodeError: swallowToNull,
          }),
        ),
      );

      const results = await runPromise(
        Effect.all(fetchEffects, {
          concurrency: 5,
          batching: false,
        }),
      );

      const series = results.filter(
        (
          row,
        ): row is {
          coinId: string;
          holdings: number;
          prices: Array<{ time: number; value: number }>;
        } => row !== null && Array.isArray(row.prices) && row.prices.length > 0,
      );

      if (!series.length) return [];

      const rangeDays = getRangeDaysFromTimeScale(args.timeScale);
      const bucketMs = getBucketMsFromTimeScale(args.timeScale);
      const endTimeMs = rangeEndTimeMs;
      const startTimeMs = endTimeMs - rangeDays * 24 * 60 * 60 * 1000;
      const bucketTimesMs = buildBucketTimesMs({
        startTimeMs,
        endTimeMs,
        bucketMs,
      });

      const totalsByBucket: Array<number> = Array.from(
        { length: bucketTimesMs.length },
        () => 0,
      );

      for (const coin of series) {
        const sorted = [...coin.prices].sort((a, b) => a.time - b.time);
        const baselinePrice =
          sorted[0]?.value && sorted[0].value > 0 ? sorted[0].value : null;
        if (baselinePrice === null) continue;

        let cursor = 0;
        let lastPrice: number | null = null;

        for (let i = 0; i < bucketTimesMs.length; i++) {
          const bucketTimeSec = toEpochSeconds(bucketTimesMs[i]!);

          while (
            cursor < sorted.length &&
            sorted[cursor]!.time <= bucketTimeSec
          ) {
            lastPrice = sorted[cursor]!.value;
            cursor++;
          }

          const priceForBucket = lastPrice ?? baselinePrice;
          totalsByBucket[i] =
            (totalsByBucket[i] ?? 0) + coin.holdings * priceForBucket;
        }
      }

      const points: LivelinePoint[] = [];
      for (let i = 0; i < bucketTimesMs.length; i++) {
        const time = toEpochSeconds(bucketTimesMs[i]!);
        points.push({ time, value: totalsByBucket[i] ?? 0 });
      }
      return points;
    },
    enabled: positions.length > 0,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  return {
    points: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
  };
}
