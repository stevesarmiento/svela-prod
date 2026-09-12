"use client";

import { useCoinGeckoQuotesBulk } from "@/hooks/use-coingecko-quotes";
import { useGlobalMarketCapOverTime } from "@/hooks/use-global-market-cap-over-time";
import { useHoldingsValueOverTime } from "@/hooks/use-holdings-value-over-time";
import { OverviewApi } from "@/lib/effect/overview-api";
import { runPromise as runOverviewPromise } from "@/lib/effect/runtime-overview";
import {
  type BreadthStats,
  computeBreadthStats,
} from "@/lib/overview-daily-brief";
import {
  buildRebasedComparison,
  getPointValueAtTime,
  rebaseSeriesFromFirstPoint,
} from "@/lib/overview-performance";
import type { Preloaded } from "convex/react";
import { useAction, usePreloadedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import dynamic from "next/dynamic";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../../../../../convex/_generated/api";
import { OverviewEmptyState } from "./overview-empty-state";
import type { BreadthGroupRow } from "./overview-portfolio-breadth";
import { PortfolioValueCard } from "./overview-portfolio-value-card";
import { OverviewTwoColumnLayout } from "./overview-two-column-layout";

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

const EMPTY_GROUPS_BREAKDOWN: HoldingsGroupRow[] = [];

type OverviewBootstrap = FunctionReturnType<
  typeof api.overview.getMyOverviewBootstrap
>;

/**
 * Defer loading the heavy activity feed panel: idle callback plus an
 * IntersectionObserver on the sentinel, whichever fires first.
 */
function useDeferredFeedPanel() {
  const [shouldLoadFeedPanel, setShouldLoadFeedPanel] = useState(false);
  const feedPanelSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (shouldLoadFeedPanel) return;

    const loadPanel = () => {
      setShouldLoadFeedPanel(true);
      void loadOverviewActivityFeedPanel();
    };

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let idleCallbackId: number | null = null;

    if ("requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(loadPanel, {
        timeout: 2_000,
      });
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

  return { shouldLoadFeedPanel, feedPanelSentinelRef };
}

/** Right column: lazily loaded activity feed panel (skeleton until then). */
function ActivityFeedColumn(props: {
  shouldLoad: boolean;
  overviewBootstrap: OverviewBootstrap | undefined;
  onGenerate: ComponentProps<
    typeof LazyOverviewActivityFeedPanel
  >["dailyBrief"]["onGenerate"];
}) {
  const { shouldLoad, overviewBootstrap, onGenerate } = props;
  if (!shouldLoad) return <OverviewActivityFeedPanelSkeleton />;
  return (
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
        brief24h: overviewBootstrap?.brief24h ?? {
          status: "missing",
          stale: true,
          expiresAt: null,
          generatedAt: null,
          brief: null,
        },
        onGenerate,
      }}
    />
  );
}

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

/** Stable keys for static skeleton rows (not derived from map index). */
const FEED_SKELETON_CARD_KEYS = [
  "feed-card-sk-1",
  "feed-card-sk-2",
  "feed-card-sk-3",
  "feed-card-sk-4",
] as const;

/** Mirrors EventCard: badge row (token pill, % badge, sentiment) + time + text. */
function OverviewEventCardSkeleton() {
  return (
    <div className="rounded-2xl bg-zinc-100/80 dark:bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-20 rounded-full bg-zinc-950/10 dark:bg-white/10" />
          <div className="h-6 w-14 rounded-md bg-zinc-950/10 dark:bg-white/10" />
          <div className="h-6 w-16 rounded-md bg-zinc-950/10 dark:bg-white/10" />
        </div>
        <div className="mt-1 h-3 w-12 rounded bg-zinc-950/10 dark:bg-white/10" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-4 w-full rounded bg-zinc-950/10 dark:bg-white/10" />
        <div className="h-4 w-3/4 rounded bg-zinc-950/10 dark:bg-white/10" />
      </div>
    </div>
  );
}

/** Mirrors the feed's layout: "Today" date header, then a stack of event cards. */
function OverviewActivityFeedPanelSkeleton() {
  return (
    <div
      className="animate-pulse px-5"
      aria-busy="true"
      aria-label="Loading activity feed"
    >
      <div className="py-2">
        <div className="h-7 w-16 rounded bg-zinc-950/10 dark:bg-white/10" />
      </div>
      <div className="space-y-2 pt-2">
        {FEED_SKELETON_CARD_KEYS.map((cardKey) => (
          <OverviewEventCardSkeleton key={cardKey} />
        ))}
      </div>
    </div>
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
  const { shouldLoadFeedPanel } = useDeferredFeedPanel();

  const overviewBootstrap = props.overviewBootstrap;

  const refreshOverviewSnapshot = useAction(
    api.overview.refreshMyOverviewSnapshot,
  );
  const generateOverviewBrief = useCallback(
    async ({ force }: { force?: boolean }) =>
      await runOverviewPromise(
        OverviewApi.use((api) => api.generateDailyBrief({ force })),
      ),
    [],
  );

  const snapshotRequestKeyRef = useRef<string>("");
  useEffect(() => {
    if (!overviewBootstrap) return;
    if (overviewBootstrap.status === "fresh") return;
    const key = `${overviewBootstrap.status}:${overviewBootstrap.generatedAt ?? "null"}`;
    if (snapshotRequestKeyRef.current === key) return;
    snapshotRequestKeyRef.current = key;
    refreshOverviewSnapshot({ force: false }).catch(() => {});
  }, [overviewBootstrap, refreshOverviewSnapshot]);

  const liveGroupsBreakdown = useQuery(
    api.watchlists.getMyHoldingsBreakdownByWatchlistGroup,
    {},
  ) as HoldingsGroupRow[] | undefined;
  // Stable fallback so `groupsBreakdown` keeps referential identity across
  // renders and downstream useMemo hooks don't recompute every time.
  const groupsBreakdown =
    liveGroupsBreakdown ??
    overviewBootstrap?.holdingsBreakdown ??
    EMPTY_GROUPS_BREAKDOWN;

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

  // Full watchlist (groups + every tracked coin, holdings or not) so breadth
  // covers everything the user follows, not just priced positions.
  const watchlistsBootstrap = useQuery(
    api.watchlists.getMyWatchlistsPageBootstrap,
    {},
  );
  const watchlistCoinIds = useMemo(() => {
    const ids = new Set<string>(coinIds);
    for (const items of Object.values(
      watchlistsBootstrap?.itemsByGroupId ?? {},
    )) {
      for (const item of items) {
        if (item.coinId.length > 0) ids.add(item.coinId);
      }
    }
    return Array.from(ids);
  }, [coinIds, watchlistsBootstrap?.itemsByGroupId]);

  const quotesQuery = useCoinGeckoQuotesBulk(watchlistCoinIds, {
    mode: "bestEffort",
  });

  const totalValueUsd = useMemo(() => {
    const quotes = quotesQuery.data ?? {};

    let sum = 0;
    for (const row of positions) {
      const price = quotes[row.coinId]?.current_price ?? 0;
      sum += row.holdings * price;
    }
    return sum;
  }, [positions, quotesQuery.data]);

  // Breadth over the full watchlist; until quotes land, fall back to the
  // SSR-preloaded snapshot breadth (also computed over the full watchlist).
  const portfolioBreadth = useMemo(() => {
    const quotes = quotesQuery.data ?? {};
    const changePcts: number[] = [];
    for (const coinId of watchlistCoinIds) {
      const changePct = quotes[coinId]?.price_change_percentage_24h;
      if (typeof changePct === "number" && Number.isFinite(changePct)) {
        changePcts.push(changePct);
      }
    }
    return (
      computeBreadthStats(changePcts) ??
      overviewBootstrap?.movers24h?.breadth ??
      null
    );
  }, [
    watchlistCoinIds,
    quotesQuery.data,
    overviewBootstrap?.movers24h?.breadth,
  ]);

  // Sector-style rows: each watchlist group's equal-weighted 24h change,
  // best performers first. A coin on several watchlists counts toward each
  // group it appears in (percent aggregation doesn't double-count value).
  const breadthGroupRows = useMemo<BreadthGroupRow[]>(() => {
    const quotes = quotesQuery.data ?? {};
    const rows: BreadthGroupRow[] = [];
    for (const group of watchlistsBootstrap?.groups ?? []) {
      const items = watchlistsBootstrap?.itemsByGroupId?.[group._id] ?? [];
      const seenCoinIds = new Set<string>();
      let changeSum = 0;
      let coinCount = 0;
      for (const item of items) {
        if (seenCoinIds.has(item.coinId)) continue;
        seenCoinIds.add(item.coinId);
        const changePct = quotes[item.coinId]?.price_change_percentage_24h;
        if (typeof changePct === "number" && Number.isFinite(changePct)) {
          changeSum += changePct;
          coinCount += 1;
        }
      }
      if (coinCount === 0) continue;
      rows.push({
        id: group._id,
        name: group.name,
        slug: group.slug,
        color: group.color ?? "default",
        changePct: changeSum / coinCount,
        coinCount,
      });
    }
    rows.sort((a, b) => b.changePct - a.changePct);
    return rows;
  }, [watchlistsBootstrap, quotesQuery.data]);

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
    <OverviewTwoColumnLayout
      left={
        <PortfolioValueCard
          displayValueUsd={displayValueUsd}
          hasHoldings={hasHoldings}
          rangeChange={rangeChange}
          chartNote={chartNote}
          activeTimeScale={activeTimeScale}
          setActiveTimeScale={setActiveTimeScale}
          portfolioChartPoints={portfolioChartPoints}
          marketPoints={rebasedComparison.marketPoints}
          onScrub={setScrubTime}
          breadth={portfolioBreadth}
          breadthGroups={breadthGroupRows}
          breadthLoading={
            watchlistsBootstrap === undefined ||
            (watchlistCoinIds.length > 0 && quotesQuery.isLoading)
          }
        />
      }
      right={
        <ActivityFeedColumn
          shouldLoad={shouldLoadFeedPanel}
          overviewBootstrap={overviewBootstrap}
          onGenerate={generateOverviewBrief}
        />
      }
    />
  );
}
