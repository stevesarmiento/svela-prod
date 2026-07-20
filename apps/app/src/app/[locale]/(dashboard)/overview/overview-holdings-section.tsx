"use client";

import dynamic from "next/dynamic";
import { OverviewPerformanceChart } from "@/components/charts/overview-performance-chart";
import { COLOR_THEMES } from "@/components/color-picker";
import { useCoinGeckoQuotesBulk } from "@/hooks/use-coingecko-quotes";
import { useGlobalMarketCapOverTime } from "@/hooks/use-global-market-cap-over-time";
import { useHoldingsValueOverTime } from "@/hooks/use-holdings-value-over-time";
import { generatePastelColors } from "@/lib/chart-colors";
import { formatUsdPrice } from "@/lib/format-usd";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import {
  buildRebasedComparison,
  getPointValueAtTime,
  rebaseSeriesFromFirstPoint,
} from "@/lib/overview-performance";
import { Badge } from "@v1/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card";
import { cn } from "@v1/ui/cn";
import { AvatarCircles } from "@v1/ui/token-stacks";
import type { Preloaded } from "convex/react";
import {
  useAction,
  usePreloadedQuery,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconTriangleFill } from "symbols-react";
import { api } from "../../../../../convex/_generated/api";
import { TimeScaleSelector } from "../charts/_components/multi-line-lightweight-time-scale-selector";
import { OverviewEmptyState } from "./overview-empty-state";

interface HoldingsGroupRow {
  group: {
    _id: string;
    name: string;
    icon?: string;
    color?: string;
  };
  positions: Array<{ coinId: string; holdings: number }>;
  totalHoldings: number;
  coinsWithHoldings: number;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Matches watchlist screener “Daily performance” cell (USD + Badge + %). */
function ChartRangePerformanceLabel(props: {
  deltaUsd: number;
  deltaPct: number;
}) {
  const { deltaUsd, deltaPct } = props;
  const isPositive = deltaUsd > 0;
  const isNegative = deltaUsd < 0;
  const isNeutral = !isPositive && !isNegative;
  const usdSign = isPositive ? "+" : isNegative ? "-" : "";

  return (
    <div className="mt-2 inline-flex flex-wrap items-center justify-start gap-2">
      <span
        className={cn(
          "font-berkeley-mono text-[11px] tabular-nums",
          isPositive && "text-emerald-400",
          isNegative && "text-rose-400",
          isNeutral && "text-muted-foreground",
        )}
      >
        {`${usdSign}${formatUsdPrice(Math.abs(deltaUsd))}`}
      </span>
      <Badge
        variant={
          isPositive ? "success" : isNegative ? "destructive" : "outline"
        }
        className={cn(
          "h-5 px-1.5 font-berkeley-mono text-[11px] tabular-nums gap-1",
          isNeutral &&
            "border-zinc-200/60 text-muted-foreground dark:border-white/10",
        )}
      >
        <IconTriangleFill
          aria-hidden="true"
          className={cn(
            "size-[4px] shrink-0 fill-current",
            isNegative && "rotate-180",
          )}
        />
        {Math.abs(deltaPct).toFixed(2)}%
      </Badge>
    </div>
  );
}

type OverviewBootstrap = FunctionReturnType<
  typeof api.overview.getMyOverviewBootstrap
>;

function loadOverviewActivityFeedPanel() {
  return import("./overview-activity-feed-panel");
}

const LazyOverviewActivityFeedPanel = dynamic(
  () =>
    loadOverviewActivityFeedPanel().then(
      (module) => module.OverviewActivityFeedPanel,
    ),
  {
    ssr: false,
    loading: () => <OverviewActivityFeedPanelSkeleton />,
  },
);

function OverviewActivityFeedPanelSkeleton() {
  return (
    <Card className="border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] bg-white dark:bg-zinc-950/50 min-h-[520px] shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)]">
      <CardContent className="p-5 space-y-4">
        <div className="h-8 w-44 rounded-md bg-zinc-950/10 dark:bg-white/10" />
        <div className="space-y-3">
          <div className="h-20 rounded-xl bg-zinc-950/10 dark:bg-white/10" />
          <div className="h-20 rounded-xl bg-zinc-950/10 dark:bg-white/10" />
          <div className="h-20 rounded-xl bg-zinc-950/10 dark:bg-white/10" />
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewHoldingsSection(props: {
  preloadedOverview?: Preloaded<
    typeof api.overview.getMyOverviewBootstrap
  > | null;
}) {
  if (props.preloadedOverview) {
    return (
      <OverviewHoldingsSectionPreloaded
        preloadedOverview={props.preloadedOverview}
      />
    );
  }
  return <OverviewHoldingsSectionLive />;
}

function OverviewHoldingsSectionPreloaded(props: {
  preloadedOverview: Preloaded<typeof api.overview.getMyOverviewBootstrap>;
}) {
  const overviewBootstrap = usePreloadedQuery(props.preloadedOverview);
  return <OverviewHoldingsSectionInner overviewBootstrap={overviewBootstrap} />;
}

function OverviewHoldingsSectionLive() {
  const overviewBootstrap = useQuery(api.overview.getMyOverviewBootstrap, {});
  return <OverviewHoldingsSectionInner overviewBootstrap={overviewBootstrap} />;
}

function OverviewHoldingsSectionInner(props: {
  overviewBootstrap: OverviewBootstrap | undefined;
}) {
  const [activeTimeScale, setActiveTimeScale] = useState<string>("1d");
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [shouldLoadFeedPanel, setShouldLoadFeedPanel] = useState(false);

  const overviewBootstrap = props.overviewBootstrap;

  const refreshOverviewSnapshot = useAction(
    api.overview.refreshMyOverviewSnapshot,
  );
  const generateOverviewBrief = useCallback(
    async ({ force }: { force?: boolean }) => {
      const response = await fetch("/api/overview/daily-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed to generate daily brief (${response.status})`);
      }

      return await response.json();
    },
    [],
  );

  const snapshotRequestKeyRef = useRef<string>("");
  const feedPanelSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!overviewBootstrap) return;
    if (overviewBootstrap.status === "fresh") return;
    const key = `${overviewBootstrap.status}:${overviewBootstrap.generatedAt ?? "null"}`;
    if (snapshotRequestKeyRef.current === key) return;
    snapshotRequestKeyRef.current = key;
    refreshOverviewSnapshot({ force: false }).catch(() => {});
  }, [overviewBootstrap, refreshOverviewSnapshot]);

  useEffect(() => {
    if (shouldLoadFeedPanel) return;

    const loadPanel = () => {
      setShouldLoadFeedPanel(true);
      void loadOverviewActivityFeedPanel();
    };

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let idleCallbackId: number | null = null;

    if ("requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(loadPanel, { timeout: 2_000 });
    } else {
      idleTimer = setTimeout(loadPanel, 1_000);
    }

    const node = feedPanelSentinelRef.current;
    if (!node || typeof IntersectionObserver !== "function") {
      return () => {
        if (idleCallbackId !== null) window.cancelIdleCallback(idleCallbackId);
        if (idleTimer !== null) clearTimeout(idleTimer);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        loadPanel();
        observer.disconnect();
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (idleCallbackId !== null) window.cancelIdleCallback(idleCallbackId);
      if (idleTimer !== null) clearTimeout(idleTimer);
    };
  }, [shouldLoadFeedPanel]);

  const liveGroupsBreakdown = useQuery(
    api.watchlists.getMyHoldingsBreakdownByWatchlistGroup,
    {},
  ) as HoldingsGroupRow[] | undefined;
  const groupsBreakdown =
    liveGroupsBreakdown ?? overviewBootstrap?.holdingsBreakdown ?? [];

  const positions = useMemo(() => {
    const byCoinId = new Map<string, number>();
    for (const row of groupsBreakdown ?? []) {
      for (const position of row.positions) {
        if (!Number.isFinite(position.holdings) || position.holdings <= 0)
          continue;
        byCoinId.set(
          position.coinId,
          (byCoinId.get(position.coinId) ?? 0) + position.holdings,
        );
      }
    }

    return Array.from(byCoinId.entries()).map(([coinId, holdings]) => ({
      coinId,
      holdings,
    }));
  }, [groupsBreakdown]);

  const coinIds = useMemo(
    () => positions.map((row) => row.coinId),
    [positions],
  );
  const quotesQuery = useCoinGeckoQuotesBulk(coinIds, { mode: "bestEffort" });

  const totalValueUsd = useMemo(() => {
    const quotes = quotesQuery.data ?? {};

    let sum = 0;
    for (const row of positions) {
      const price = quotes[row.coinId]?.current_price ?? 0;
      sum += row.holdings * price;
    }
    return sum;
  }, [positions, quotesQuery.data]);

  const groupRows = useMemo(() => {
    const quotes = quotesQuery.data ?? {};
    const total = totalValueUsd;

    const rows = groupsBreakdown.map((row) => {
      let valueUsd = 0;
      for (const position of row.positions) {
        const price = quotes[position.coinId]?.current_price ?? 0;
        valueUsd += position.holdings * price;
      }

      const percent = total > 0 ? clampPercent(valueUsd / total) : 0;

      const tokensByValue = row.positions
        .map((position) => {
          const price = quotes[position.coinId]?.current_price ?? 0;
          return {
            coinId: position.coinId,
            valueUsd: position.holdings * price,
          };
        })
        .filter(
          (token) => Number.isFinite(token.valueUsd) && token.valueUsd > 0,
        )
        .sort((a, b) => b.valueUsd - a.valueUsd);

      const tokenColors = generatePastelColors(tokensByValue.length);
      const tokenSegments = tokensByValue.map((token, index) => {
        const segmentPercent =
          valueUsd > 0 ? clampPercent(token.valueUsd / valueUsd) : 0;
        return {
          coinId: token.coinId,
          percent: segmentPercent,
          color: tokenColors[index] ?? "oklch(0.8047 0 0)",
        };
      });

      const tokenAvatarUrls = tokensByValue
        .slice(0, 4)
        .map((token) => {
          const quote = quotes[token.coinId];
          if (!quote) return null;
          const imageUrl = getTokenLogoURL(quote.symbol, quote.image);
          if (!imageUrl) return null;
          return { imageUrl, profileUrl: `/watchlists/${token.coinId}` };
        })
        .filter(
          (avatar): avatar is { imageUrl: string; profileUrl: string } =>
            avatar !== null,
        );

      const tokenExtraCount = Math.max(
        0,
        tokensByValue.length - tokenAvatarUrls.length,
      );

      const themeKey = (row.group.color ??
        "default") as keyof typeof COLOR_THEMES;
      const theme = COLOR_THEMES[themeKey] ?? COLOR_THEMES.default;

      return {
        id: row.group._id,
        name: row.group.name,
        color: row.group.color ?? "default",
        valueUsd,
        percent,
        barClassName: theme.bg,
        tokenSegments,
        tokenAvatarUrls,
        tokenExtraCount,
      };
    });

    rows.sort((a, b) => b.valueUsd - a.valueUsd);
    return rows;
  }, [groupsBreakdown, quotesQuery.data, totalValueUsd]);

  const valueSeries = useHoldingsValueOverTime({
    positions,
    timeScale: activeTimeScale,
  });
  const marketSeries = useGlobalMarketCapOverTime({
    timeScale: activeTimeScale,
  });

  const hasHoldings = positions.length > 0;
  const scrubbedPortfolioValueUsd = useMemo(() => {
    if (scrubTime === null) return null;
    return getPointValueAtTime(valueSeries.points, scrubTime);
  }, [scrubTime, valueSeries.points]);

  const rebasedComparison = useMemo(
    () =>
      buildRebasedComparison({
        portfolioPoints: valueSeries.points,
        marketPoints: marketSeries.marketPoints,
      }),
    [marketSeries.marketPoints, valueSeries.points],
  );

  const portfolioChartPoints = useMemo(() => {
    if (rebasedComparison.portfolioPoints.length > 0)
      return rebasedComparison.portfolioPoints;
    return rebaseSeriesFromFirstPoint(valueSeries.points);
  }, [rebasedComparison.portfolioPoints, valueSeries.points]);

  const displayValueUsd = scrubbedPortfolioValueUsd ?? totalValueUsd;

  const chartNote = useMemo(() => {
    if (!hasHoldings) return null;
    if (rebasedComparison.marketPoints.length > 0) return null;
    if (
      marketSeries.isLoading ||
      marketSeries.isFetching ||
      marketSeries.isWarmingUp ||
      marketSeries.isStale
    ) {
      return "Market benchmark warming";
    }
    return "Market benchmark unavailable";
  }, [
    hasHoldings,
    marketSeries.isFetching,
    marketSeries.isLoading,
    marketSeries.isStale,
    marketSeries.isWarmingUp,
    rebasedComparison.marketPoints.length,
  ]);

  const rangeChange = useMemo(() => {
    const points = valueSeries.points;
    if (points.length < 2)
      return { deltaUsd: 0, deltaPct: 0, isAvailable: false };

    const startValue = points[0]?.value ?? 0;
    const endValue =
      scrubbedPortfolioValueUsd ?? points[points.length - 1]?.value ?? 0;

    if (!Number.isFinite(startValue) || startValue <= 0)
      return { deltaUsd: 0, deltaPct: 0, isAvailable: false };
    if (!Number.isFinite(endValue))
      return { deltaUsd: 0, deltaPct: 0, isAvailable: false };

    const deltaUsd = endValue - startValue;
    const deltaPct = (deltaUsd / startValue) * 100;
    return {
      deltaUsd: Number.isFinite(deltaUsd) ? deltaUsd : 0,
      deltaPct: Number.isFinite(deltaPct) ? deltaPct : 0,
      isAvailable: true,
    };
  }, [scrubbedPortfolioValueUsd, valueSeries.points]);

  const isEmptyDashboard =
    overviewBootstrap !== undefined &&
    (overviewBootstrap.watchlistCoinCount ?? 0) === 0;

  if (isEmptyDashboard) {
    return <OverviewEmptyState />;
  }

  return (
    <div className="w-full px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-6 lg:self-start">
          <Card
            className={cn(
              "bg-white dark:bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] overflow-hidden shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)] will-change-auto",
            )}
          >
            <CardHeader className="p-0">
              <CardTitle className="sr-only mb-0 text-pretty text-balance text-sm font-medium text-zinc-600 dark:text-white/60">
                Portfolio value
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 relative">
              <div className="absolute top-0 left-6 flex flex-col items-start text-left">
                <div className="text-pretty text-balance text-3xl tabular-nums text-zinc-950 dark:text-white">
                  {formatUsdPrice(displayValueUsd)}
                </div>
                {hasHoldings && rangeChange.isAvailable ? (
                  <ChartRangePerformanceLabel
                    deltaUsd={rangeChange.deltaUsd}
                    deltaPct={rangeChange.deltaPct}
                  />
                ) : null}
                {hasHoldings && chartNote ? (
                  <div className="mt-3 text-[11px] text-zinc-600 dark:text-white/60">
                    {chartNote}
                  </div>
                ) : null}
              </div>

              {/* Performance chart */}
              <div className="relative mt-4 -mx-5">
                <div
                  className="pointer-events-none absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "repeat",
                    maskImage:
                      "radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 62% 48% at 50% 48%, oklch(0 0 0) 28%, oklch(0 0 0) 42%, transparent 78%)",
                  }}
                />
                <div className="flex items-center justify-end px-5 pb-2">
                  <TimeScaleSelector
                    activeTimeScale={activeTimeScale}
                    setActiveTimeScale={setActiveTimeScale}
                  />
                </div>
                <div className="">
                  {!hasHoldings ? (
                    <div className="flex h-[240px] items-center justify-center text-sm text-zinc-600 dark:text-white/60">
                      No holdings to chart yet.
                    </div>
                  ) : (
                    <OverviewPerformanceChart
                      portfolioPoints={portfolioChartPoints}
                      marketPoints={rebasedComparison.marketPoints}
                      height={240}
                      onHover={setScrubTime}
                      note={chartNote}
                    />
                  )}
                </div>
              </div>
              <div className="w-full scale-x-110 h-[2px] bg-black border-b border-white/15 mt-4" />
              {hasHoldings && groupRows.length > 0 ? (
                <div className="mt-4">
                  <div className="text-xs font-medium text-zinc-600 dark:text-white/60 mb-2">
                    Holdings Breakdown
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-[4px]">
                    <div className="flex h-full w-full gap-0.5">
                      {groupRows.map((row) => (
                        <div
                          key={row.id}
                          className={cn(
                            "h-full rounded-[4px] opacity-90",
                            row.barClassName,
                          )}
                          style={{
                            width: `${Math.max(10, row.percent * 100)}%`,
                          }}
                          aria-hidden
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="w-full scale-x-110 h-[2px] bg-black border-b border-white/15 mt-4" />

              {!hasHoldings ? (
                <p className="mt-4 text-pretty text-xs text-zinc-600 dark:text-white/60">
                  Add a quantity to any watchlist coin to see your holdings
                  value here.
                </p>
              ) : null}

              {hasHoldings && groupRows.length > 0 ? (
                <div className="mt-2">
                  <div className="space-y-2">
                    {groupRows.map((row) => (
                      <div key={row.id} className="py-2">
                        {/* Single row: stacks | name | token bar | % */}
                        <div className="flex flex-row justify-between items-center gap-3">
                          <div className="flex flex-col">
                            <div className="flex flex-col items-start text-left gap-1">
                              <div className="min-w-0 truncate text-xs font-medium text-zinc-950 dark:text-white">
                                {row.name}
                              </div>
                              <div className="min-w-0 h-2 w-full overflow-hidden rounded-[2px]">
                                <div className="flex h-full w-full gap-0.5">
                                  {row.tokenSegments.map((segment) => (
                                    <div
                                      key={segment.coinId}
                                      className="h-full rounded-[2px]"
                                      style={{
                                        width: `${Math.max(10, segment.percent * 100)}%`,
                                        backgroundColor: segment.color,
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="text-[11px] font-medium tabular-nums text-zinc-600 dark:text-white/60">
                              {(row.percent * 100).toFixed(0)}%
                            </div>
                          </div>
                          <AvatarCircles
                            avatarUrls={row.tokenAvatarUrls}
                            numPeople={row.tokenExtraCount}
                            className="scale-[0.9] origin-left"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

        </div>

        <div className="space-y-4 lg:col-span-7">
          {shouldLoadFeedPanel ? (
            <LazyOverviewActivityFeedPanel
              events={
                overviewBootstrap?.events ?? {
                  generatedAt: 0,
                  coinCount: 0,
                  limited: false,
                  events: [],
                }
              }
              dailyBrief={{
                status: overviewBootstrap?.status ?? "missing",
                movers24h: overviewBootstrap?.movers24h ?? null,
                events: overviewBootstrap?.events ?? null,
                brief24h:
                  overviewBootstrap?.brief24h ?? {
                    status: "missing",
                    stale: true,
                    expiresAt: null,
                    generatedAt: null,
                    brief: null,
                  },
                onGenerate: generateOverviewBrief,
              }}
            />
          ) : (
            <OverviewActivityFeedPanelSkeleton />
          )}
        </div>
      </div>
    </div>
  );
}
