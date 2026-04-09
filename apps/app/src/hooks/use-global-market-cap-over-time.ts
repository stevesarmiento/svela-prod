"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Effect } from "effect";
import type { LivelinePoint } from "liveline";
import { CoinGeckoApi } from "@/lib/effect/coingecko-api";
import { runPromise } from "@/lib/effect/runtime-coingecko";
import { forwardFillSeriesOntoBuckets } from "@/lib/overview-performance";
import {
  getBucketMsFromTimeScale,
  getRangeDaysFromTimeScale,
  getWatchlistAggregateRangeEndMs,
} from "@/hooks/use-coingecko-watchlist-aggregate-chart-isolated";

interface GlobalMarketCapSeriesResult {
  marketPoints: LivelinePoint[];
  exBtcPoints: LivelinePoint[];
  isLoading: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  isStale: boolean;
  isWarmingUp: boolean;
}

function toEpochSeconds(timeMs: number): number {
  return Math.floor(timeMs / 1000);
}

function getDaysFromTimeScale(timeScale: string): "1" | "7" | "30" | "365" {
  if (timeScale === "1d") return "1";
  if (timeScale === "7d") return "7";
  if (timeScale === "30d") return "30";
  return "365";
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

export function useGlobalMarketCapOverTime(args: {
  timeScale: string;
}): GlobalMarketCapSeriesResult {
  const days = getDaysFromTimeScale(args.timeScale);
  const rangeEndTimeMs = getWatchlistAggregateRangeEndMs(args.timeScale);

  const query = useQuery({
    queryKey: ["global-market-cap-over-time", args.timeScale, rangeEndTimeMs],
    queryFn: async (): Promise<{
      marketPoints: LivelinePoint[];
      exBtcPoints: LivelinePoint[];
      isStale: boolean;
      isWarmingUp: boolean;
    }> => {
      const swallowToEmpty = (_: unknown) =>
        Effect.succeed({
          marketPoints: [] as LivelinePoint[],
          exBtcPoints: [] as LivelinePoint[],
          isStale: false,
          isWarmingUp: false,
        });

      return await runPromise(
        Effect.all(
          {
            global: CoinGeckoApi.getGlobalMarketCapChart({
              days,
              vsCurrency: "usd",
            }),
            btc: CoinGeckoApi.getMarketChart({ coinId: "bitcoin", days }),
          },
          { concurrency: 2, batching: false },
        ).pipe(
          Effect.map(({ global, btc }) => {
            const rangeDays = getRangeDaysFromTimeScale(args.timeScale);
            const bucketMs = getBucketMsFromTimeScale(args.timeScale);
            const endTimeMs = rangeEndTimeMs;
            const startTimeMs = endTimeMs - rangeDays * 24 * 60 * 60 * 1000;
            const bucketTimesMs = buildBucketTimesMs({
              startTimeMs,
              endTimeMs,
              bucketMs,
            });
            const bucketTimesSec = bucketTimesMs.map((timeMs) =>
              toEpochSeconds(timeMs),
            );

            const globalSource = global.data.market_cap
              .filter(
                (point) =>
                  Number.isFinite(point.time) &&
                  Number.isFinite(point.value) &&
                  point.value > 0,
              )
              .sort((a, b) => a.time - b.time);

            const btcSource = btc.data.market_caps
              .filter(
                (point) =>
                  Number.isFinite(point.time) &&
                  Number.isFinite(point.value) &&
                  point.value > 0,
              )
              .sort((a, b) => a.time - b.time);

            const marketPoints = forwardFillSeriesOntoBuckets({
              sourcePoints: globalSource,
              bucketTimesSec,
            });
            const btcPoints = forwardFillSeriesOntoBuckets({
              sourcePoints: btcSource,
              bucketTimesSec,
            });

            const btcByTime = new Map(
              btcPoints.map((point) => [point.time, point.value] as const),
            );
            const exBtcPoints = marketPoints
              .map((point) => {
                const btcValue = btcByTime.get(point.time);
                if (!Number.isFinite(btcValue)) return null;
                const nextValue = point.value - (btcValue ?? 0);
                if (!Number.isFinite(nextValue) || nextValue <= 0) return null;
                return { time: point.time, value: nextValue };
              })
              .filter((point): point is LivelinePoint => point !== null);

            return {
              marketPoints,
              exBtcPoints,
              isStale: Boolean(global.status?.stale || btc.status?.stale),
              isWarmingUp: Boolean(
                global.status?.warmupRequested || btc.status?.warmupRequested,
              ),
            };
          }),
          Effect.catchTags({
            CoinGeckoInvalidParamsError: swallowToEmpty,
            CoinGeckoUnauthorizedError: swallowToEmpty,
            CoinGeckoNotFoundError: swallowToEmpty,
            CoinGeckoRateLimitedError: swallowToEmpty,
            CoinGeckoApiError: swallowToEmpty,
            CoinGeckoDecodeError: swallowToEmpty,
          }),
        ),
      );
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  return {
    marketPoints: query.data?.marketPoints ?? [],
    exBtcPoints: query.data?.exBtcPoints ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    isStale: query.data?.isStale ?? false,
    isWarmingUp: query.data?.isWarmingUp ?? false,
  };
}
