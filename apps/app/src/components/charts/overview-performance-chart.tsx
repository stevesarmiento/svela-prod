"use client";

import { useCallback, useMemo } from "react";
import { Liveline } from "liveline";
import type { LivelinePoint, LivelineSeries } from "liveline";
import { useIsomorphicTheme } from "@/hooks/use-isomorphic-theme";

interface OverviewPerformanceChartProps {
  portfolioPoints: LivelinePoint[];
  marketPoints?: LivelinePoint[];
  height?: number;
  onHover?: (time: number | null) => void;
  note?: string | null;
}

function findClosestTime(
  points: ReadonlyArray<LivelinePoint>,
  targetTimeSec: number,
): number | null {
  if (points.length === 0) return null;

  let low = 0;
  let high = points.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midTime = points[mid]?.time;
    if (midTime === undefined) break;
    if (midTime === targetTimeSec) return midTime;
    if (midTime < targetTimeSec) low = mid + 1;
    else high = mid - 1;
  }

  const right = points[low];
  const left = points[low - 1];
  if (!left) return right?.time ?? null;
  if (!right) return left.time;

  return Math.abs(left.time - targetTimeSec) <=
    Math.abs(right.time - targetTimeSec)
    ? left.time
    : right.time;
}

function formatIndexValue(value: number): string {
  return `${value.toFixed(0)}`;
}

export function OverviewPerformanceChart({
  portfolioPoints,
  marketPoints = [],
  height = 320,
  onHover,
  note,
}: OverviewPerformanceChartProps) {
  const { isDarkMode } = useIsomorphicTheme();

  const series = useMemo((): LivelineSeries[] => {
    const nextSeries: LivelineSeries[] = [];
    const latestPortfolioValue =
      portfolioPoints[portfolioPoints.length - 1]?.value;
    if (typeof latestPortfolioValue === "number") {
      nextSeries.push({
        id: "portfolio",
        data: portfolioPoints,
        value: latestPortfolioValue,
        color: isDarkMode ? "#e5e7eb" : "#111827",
        label: `Portfolio ${latestPortfolioValue - 100 >= 0 ? "+" : ""}${(latestPortfolioValue - 100).toFixed(2)}%`,
      });
    }

    const latestMarketValue = marketPoints[marketPoints.length - 1]?.value;
    if (typeof latestMarketValue === "number") {
      const marketColor = isDarkMode
        ? "rgba(45, 212, 191, 0.25)"
        : "rgba(15, 118, 110, 0.25)";
      nextSeries.push({
        id: "market",
        data: marketPoints,
        value: latestMarketValue,
        color: marketColor,
        label: `Market ${latestMarketValue - 100 >= 0 ? "+" : ""}${(latestMarketValue - 100).toFixed(2)}%`,
      });
    }

    return nextSeries;
  }, [isDarkMode, marketPoints, portfolioPoints]);

  const allPoints = useMemo(
    () => [...portfolioPoints, ...marketPoints].sort((a, b) => a.time - b.time),
    [marketPoints, portfolioPoints],
  );

  const windowSecs = useMemo(() => {
    const first = allPoints[0]?.time;
    const last = allPoints[allPoints.length - 1]?.time;
    if (typeof first !== "number" || typeof last !== "number") return 30;
    return Math.max(30, last - first);
  }, [allPoints]);

  const formatTime = useMemo(() => {
    const first = allPoints[0]?.time;
    const last = allPoints[allPoints.length - 1]?.time;
    const spanSec =
      typeof first === "number" && typeof last === "number" ? last - first : 0;
    const includeYear = spanSec > 180 * 24 * 60 * 60;

    return (epochSeconds: number) => {
      const dt = new Date(epochSeconds * 1000);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        ...(includeYear ? { year: "numeric" as const } : {}),
      }).format(dt);
    };
  }, [allPoints]);

  const handleHover = useCallback(
    (hover: { time: number; value: number; x: number; y: number } | null) => {
      if (!onHover) return;
      if (!hover) {
        onHover(null);
        return;
      }

      const closestTime = findClosestTime(allPoints, Math.round(hover.time));
      onHover(closestTime);
    },
    [allPoints, onHover],
  );

  if (series.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        Loading chart data...
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <Liveline
        data={[]}
        value={0}
        series={series}
        theme={isDarkMode ? "dark" : "light"}
        color={isDarkMode ? "#e5e7eb" : "#111827"}
        lineWidth={1}
        window={windowSecs}
        formatTime={formatTime}
        formatValue={formatIndexValue}
        grid={false}
        badge={false}
        fill={false}
        pulse={false}
        scrub
        momentum={false}
        tooltipY={-9999}
        tooltipOutline={false}
        padding={{ top: 12, right: 20, bottom: 20, left: 12 }}
        onHover={handleHover}
        className="size-full"
      />
      {note ? (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-zinc-200/70 bg-white/90 px-2.5 py-1 text-[11px] text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-zinc-950/80 dark:text-white/60">
          {note}
        </div>
      ) : null}
    </div>
  );
}
