"use client";

import { useGlobalMarketCapOverTime } from "@/hooks/use-global-market-cap-over-time";
import type { BreadthStats } from "@/lib/overview-daily-brief";
import {
  aggregateNewsSentiment,
  buildOverviewSummarySegments,
  computeSeriesChangePct,
} from "@/lib/overview-summary";
import { Badge } from "@v1/ui/badge";
import { cn } from "@v1/ui/cn";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { IconTriangleFill } from "symbols-react";
import { api } from "../../../../../convex/_generated/api";
import type { EventsFeedData } from "./overview-events-feed-card/types";

type SentimentOverlayRow = {
  articleId: string;
  sentiment: "bullish" | "bearish" | "neutral" | null;
};

/** Same construction as the feed's per-event percent badge. */
function PercentChangeBadge(props: { pct: number }) {
  const pct = Number.isFinite(props.pct) ? props.pct : 0;
  const isPositive = pct > 0;
  const isNegative = pct < 0;
  const isNeutral = !isPositive && !isNegative;
  return (
    <Badge
      variant={isPositive ? "success" : isNegative ? "destructive" : "outline"}
      className={cn(
        "inline-flex align-middle h-6 px-2 font-berkeley-mono text-[12px] tabular-nums gap-1",
        isNeutral &&
          "border-zinc-200/60 text-muted-foreground dark:border-white/10",
      )}
    >
      <IconTriangleFill
        aria-hidden="true"
        className={cn(
          "size-[6px] shrink-0 fill-current",
          isNegative && "rotate-180",
        )}
      />
      {Math.abs(pct).toFixed(2)}%
    </Badge>
  );
}

const SUMMARY_SKELETON_LINE_KEYS = [
  { key: "summary-line-sk-1", widthClass: "w-full" },
  { key: "summary-line-sk-2", widthClass: "w-11/12" },
  { key: "summary-line-sk-3", widthClass: "w-2/3" },
] as const;

function SummarySkeleton() {
  return (
    <div
      className="rounded-2xl bg-zinc-100/80 dark:bg-white/[0.06] p-6 animate-pulse space-y-3"
      aria-busy="true"
      aria-label="Loading portfolio summary"
    >
      {SUMMARY_SKELETON_LINE_KEYS.map((line) => (
        <div
          key={line.key}
          className={cn(
            "h-6 rounded bg-zinc-950/10 dark:bg-white/10",
            line.widthClass,
          )}
        />
      ))}
    </div>
  );
}

/**
 * Human-readable overview above the activity feed: portfolio 24h change vs
 * the market benchmark plus the news-sentiment tone, composed
 * deterministically from data the page already fetches. Uses a fixed 1d
 * window so it stays independent of the chart's time-scale selector.
 */
export function OverviewSummaryCard(props: {
  portfolioChangePct24h: number | null;
  events: EventsFeedData | null;
  breadth: BreadthStats | null;
}) {
  const marketSeries = useGlobalMarketCapOverTime({ timeScale: "1d" });
  const marketChangePct = useMemo(
    () => computeSeriesChangePct(marketSeries.marketPoints),
    [marketSeries.marketPoints],
  );

  const articleIds = useMemo(
    () =>
      Array.from(
        new Set(
          (props.events?.events ?? [])
            .filter((event) => event.kind === "news")
            .map((event) => event.articleId)
            .filter(
              (articleId): articleId is string =>
                typeof articleId === "string" && articleId.length > 0,
            ),
        ),
      ),
    [props.events?.events],
  );
  const sentimentOverlay = useQuery(
    api.overview.getNewsSentimentOverlay,
    articleIds.length > 0 ? { articleIds } : "skip",
  ) as SentimentOverlayRow[] | undefined;
  const sentiment = useMemo(
    () =>
      sentimentOverlay === undefined
        ? null
        : aggregateNewsSentiment(sentimentOverlay),
    [sentimentOverlay],
  );

  const segments = useMemo(
    () =>
      buildOverviewSummarySegments({
        portfolioChangePct: props.portfolioChangePct24h,
        marketChangePct,
        sentiment,
        breadth: props.breadth,
      }),
    [props.portfolioChangePct24h, marketChangePct, sentiment, props.breadth],
  );

  if (segments.length === 0) {
    const isWaitingOnInputs =
      marketSeries.isLoading ||
      (articleIds.length > 0 && sentimentOverlay === undefined);
    return isWaitingOnInputs ? <SummarySkeleton /> : null;
  }

  const nodes: React.ReactNode[] = [];
  let segmentKey = 0;
  for (const segment of segments) {
    if (segment.kind === "text") {
      nodes.push(segment.text);
      continue;
    }
    nodes.push(
      <PercentChangeBadge key={`pct-${segmentKey++}`} pct={segment.value} />,
    );
  }

  return (
    <section
      aria-label="Portfolio summary"
      className="rounded-2xl bg-zinc-100/80 dark:bg-white/[0.06] p-6"
    >
      {/* 70% color on the prose only — badges set their own text colors so
          they stay at full strength. Badge renders a <div>, so the prose
          wrapper must not be a <p>. */}
      <div className="text-2xl sm:text-[23px] font-thin leading-snug tracking-tight text-zinc-900/70 dark:text-zinc-50/50 text-pretty">
        {nodes}
      </div>
    </section>
  );
}
