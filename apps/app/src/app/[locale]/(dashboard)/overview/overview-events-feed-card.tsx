"use client";

import { AnalysisDialog } from "@/components/navigation/analysis-dialog";
import { TokenLogo } from "@/components/token-logo";
import { formatUsdPrice } from "@/lib/format-usd";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import {
  DURATION_UI_S,
  EASE_OUT_CUBIC,
  motionDuration,
} from "@/lib/motion-tokens";
import { Badge } from "@v1/ui/badge";
import { Button } from "@v1/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card";
import { cn } from "@v1/ui/cn";
import { Skeleton } from "@v1/ui/skeleton";
import { Spinner } from "@v1/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@v1/ui/tabs";
import { BarChart3, ExternalLink } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { IconTriangleFill } from "symbols-react";
import type { MoversSnapshot } from "./overview-movers-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventKind =
  | "news"
  | "price_spike"
  | "volume_anomaly"
  | "breakout_high"
  | "breakout_low";

type EventTone = "positive" | "negative" | "neutral";
type NewsSentiment = "bullish" | "bearish" | "neutral" | null;

interface OverviewEvent {
  id: string;
  kind: EventKind;
  tone: EventTone;
  sentiment: NewsSentiment;
  occurredAtMs: number;
  coingeckoId: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
  title: string;
  summary: string | null;
  tokenHref: string;
  externalHref: string | null;
  valueUsd: number | null;
  percent: number | null;
}

interface EventsFeedData {
  generatedAt: number;
  coinCount: number;
  limited: boolean;
  events: OverviewEvent[];
}

// ---------------------------------------------------------------------------
// Movers post (rendered at top of Activity feed)
// ---------------------------------------------------------------------------

function clampPercentChange(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 9999) return 9999;
  if (value < -9999) return -9999;
  return value;
}

function ChangeBadge(props: { pct: number }) {
  const pct = clampPercentChange(props.pct);
  const isPositive = pct > 0;
  const isNegative = pct < 0;
  const isNeutral = !isPositive && !isNegative;

  return (
    <Badge
      variant={isPositive ? "success" : isNegative ? "destructive" : "outline"}
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
      {Math.abs(pct).toFixed(2)}%
    </Badge>
  );
}

function MoversList(props: {
  title: string;
  rows: Array<{
    coingeckoId: string;
    name: string;
    symbol: string;
    logoUrl: string | null;
    changePct: number;
    impactUsd: number | null;
  }>;
}) {
  return (
    <div className="space-y-2 min-w-0">
      <div className="text-xs font-medium text-zinc-600 dark:text-white/60">
        {props.title}
      </div>
      {props.rows.length === 0 ? (
        <div className="text-xs text-muted-foreground text-pretty">
          No data yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {props.rows.map((row) => {
            const logo = getTokenLogoURL(row.symbol, row.logoUrl ?? undefined);
            return (
              <li key={row.coingeckoId} className="min-w-0">
                <Link
                  href={`/charts/${row.coingeckoId}`}
                  className={cn(
                    "flex items-center justify-between gap-3 min-w-0 active:scale-[0.98]",
                    "-mx-2 rounded-xl p-2",
                    "transition-colors duration-150",
                    "hover:bg-zinc-950/5 dark:hover:bg-white/5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  )}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <TokenLogo
                      src={logo}
                      alt={row.name}
                      sizePx={22}
                      fallbackText={row.symbol}
                      unoptimizedRemote
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-950 dark:text-white truncate">
                        {row.symbol.toUpperCase()}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {row.name}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ChangeBadge pct={row.changePct} />
                    {row.impactUsd !== null ? (
                      <div
                        className={cn(
                          "text-[11px] font-berkeley-mono tabular-nums",
                          row.impactUsd > 0 && "text-emerald-400",
                          row.impactUsd < 0 && "text-rose-400",
                          row.impactUsd === 0 && "text-muted-foreground",
                        )}
                      >
                        {row.impactUsd > 0 ? "+" : row.impactUsd < 0 ? "-" : ""}
                        {formatUsdPrice(Math.abs(row.impactUsd))}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MoversFeedPost(props: {
  movers: {
    window: "24h" | "7d";
    onWindowChange: (window: "24h" | "7d") => void;
    watchlistCoinCount: number;
    limited: boolean;
    movers24h: MoversSnapshot;
    movers7d: MoversSnapshot;
    onRefreshNow: () => Promise<{
      scheduled: boolean;
      reason: string;
      coinsCount: number;
      walletsCount: number;
    }>;
  };
}) {
  const { movers } = props;

  const data = movers.window === "7d" ? movers.movers7d : movers.movers24h;
  const gainers = useMemo(() => data?.gainers ?? [], [data?.gainers]);
  const losers = useMemo(() => data?.losers ?? [], [data?.losers]);
  const hasAny = gainers.length > 0 || losers.length > 0;

  return (
    <div className="group/post rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] transition-colors duration-150 hover:bg-zinc-200/70 dark:hover:bg-white/[0.07]">
      <div className="px-4 py-2">
        {!hasAny ? (
          <div className="text-xs text-muted-foreground text-pretty">
            {data.coinCount > 0
              ? "No movers available for this selection yet."
              : "No movers available yet."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MoversList title="Top gainers" rows={gainers} />
            <MoversList title="Top losers" rows={losers} />
          </div>
        )}
      </div>
    </div>
  );
}

function MoversFeedHeader(props: {
  movers: {
    window: "24h" | "7d";
    onWindowChange: (window: "24h" | "7d") => void;
    watchlistCoinCount: number;
    limited: boolean;
    movers24h: MoversSnapshot;
    movers7d: MoversSnapshot;
    onRefreshNow: () => Promise<{
      scheduled: boolean;
      reason: string;
      coinsCount: number;
      walletsCount: number;
    }>;
  };
}) {
  const { movers } = props;
  const [isRefreshing, setIsRefreshing] = useState(false);

  return (
    <div className="sticky top-4 z-30 py-2 ">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xl font-bold text-zinc-950 dark:text-white text-balance">
          <span className="z-[1] font-bold">Top movers</span>
          <div className="z-[-1] absolute top-[-20px] h-[100px] inset-0 pointer-events-none bg-gradient-to-b from-white via-white/50 dark:via-background/90 to-transparent dark:from-background" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={movers.window}
            onValueChange={(value) =>
              movers.onWindowChange(value as "24h" | "7d")
            }
          >
            <TabsList className="p-0.5">
              <TabsTrigger value="24h" className="px-2 py-1 text-[12px]">
                24h
              </TabsTrigger>
              <TabsTrigger value="7d" className="px-2 py-1 text-[12px]">
                7d
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group label for a given timestamp relative to today. */
function dateBucket(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterdayStart = todayStart - 86_400_000;

  if (ms >= todayStart) return "Today";
  if (ms >= yesterdayStart) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Group an ordered event list by date bucket, preserving order. */
function groupByDate(
  events: OverviewEvent[],
): { label: string; events: OverviewEvent[] }[] {
  const groups: { label: string; events: OverviewEvent[] }[] = [];
  let current: { label: string; events: OverviewEvent[] } | null = null;

  for (const event of events) {
    const label = dateBucket(event.occurredAtMs);
    if (!current || current.label !== label) {
      current = { label, events: [] };
      groups.push(current);
    }
    current.events.push(event);
  }

  return groups;
}

function formatRelativeTime(ms: number, nowMs: number): string {
  const diffMs = nowMs - ms;
  if (!Number.isFinite(diffMs)) return "\u2014";
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function sentimentLabel(sentiment: Exclude<NewsSentiment, null>): string {
  if (sentiment === "bullish") return "Bullish";
  if (sentiment === "bearish") return "Bearish";
  return "Neutral";
}

function sentimentVariant(
  sentiment: Exclude<NewsSentiment, null>,
): "success" | "destructive" | "warning" {
  if (sentiment === "bullish") return "success";
  if (sentiment === "bearish") return "destructive";
  return "warning";
}

function parseBreakoutTimeframeDays(title: string): string | null {
  const match = title.match(/\b(\d+)d\b/i);
  if (!match) return null;
  return match[1] ?? null;
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildFeedSentence(event: OverviewEvent): string {
  switch (event.kind) {
    case "price_spike": {
      const pct = typeof event.percent === "number" ? event.percent : 0;
      return `${event.name} moved ${pct > 0 ? "+" : ""}${pct.toFixed(2)}% in the last 24h.`;
    }
    case "volume_anomaly": {
      const summary = event.summary?.trim().toLowerCase();
      if (!summary) {
        return `${event.name} is showing an unusual volume shift.`;
      }
      if (event.tone === "negative") {
        return ensureSentence(
          `${event.name} volume has cooled off to ${summary}`,
        );
      }
      return ensureSentence(`${event.name} volume is running hot at ${summary}`);
    }
    case "breakout_high": {
      const timeframe = parseBreakoutTimeframeDays(event.title);
      return timeframe
        ? `${event.name} pushed to a new ${timeframe}d high.`
        : `${event.name} pushed to a new local high.`;
    }
    case "breakout_low": {
      const timeframe = parseBreakoutTimeframeDays(event.title);
      return timeframe
        ? `${event.name} slipped to a new ${timeframe}d low.`
        : `${event.name} slipped to a new local low.`;
    }
    case "news":
      return ensureSentence(`${event.name} is in the news: ${event.title}`);
  }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const SKELETON_6 = ["a", "b", "c", "d", "e", "f"] as const;
const SKELETON_3 = ["a", "b", "c"] as const;

function EventsFeedSkeleton() {
  return (
    <Card className="border border-zinc-800/20 dark:border-zinc-800/30 rounded-[20px] bg-white dark:bg-zinc-950/50 overflow-hidden">
      <CardHeader className="p-5 pb-3 space-y-0">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-28 rounded-[10px]" />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">
        {/* Date header skeleton */}
        <Skeleton className="h-4 w-20 mt-3 mb-3" />
        <div className="space-y-2">
          {SKELETON_6.map((k) => (
            <div
              key={`sk-${k}`}
              className="flex items-center gap-3 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] px-4 py-3.5"
            >
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
          ))}
        </div>
        {/* Second date header skeleton */}
        <Skeleton className="h-4 w-28 mt-5 mb-3" />
        <div className="space-y-2">
          {SKELETON_3.map((k) => (
            <div
              key={`sk2-${k}`}
              className="flex items-center gap-3 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] px-4 py-3.5"
            >
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Error fallback
// ---------------------------------------------------------------------------

function OverviewEventsFeedCardBase(props: {
  events: EventsFeedData;
  intro?: ReactNode;
}) {
  const data = props.events;
  const nowMs = Date.now();

  const events = useMemo(() => data?.events ?? [], [data?.events]);
  const groups = useMemo(() => groupByDate(events), [events]);
  const shouldReduceMotion = useReducedMotion();

  return (
    <Card className="border-transparent shadow-none bg-transparent">
      <CardHeader className="p-0 space-y-0 sr-only">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-2xl font-bold text-zinc-950 dark:text-white text-balance px-5">
              Activity
            </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-0">
        <div role="region" aria-label="Activity feed">
          {props.intro ? <div className="pt-3">{props.intro}</div> : null}

          {events.length === 0 ? (
            <div
              className={cn(
                "text-xs text-muted-foreground text-pretty",
                props.intro ? "pt-6" : "py-8",
              )}
            >
              No recent events yet.
            </div>
          ) : (
            <div className={cn(props.intro ? "pt-4" : "")}>
              {groups.map((group) => {
                // running index across all groups for stagger
                let runIdx = 0;
                for (const g of groups) {
                  if (g === group) break;
                  runIdx += g.events.length;
                }

                return (
                  <div key={group.label} className="pt-4">
                    {/* ── Date header ── */}
                    <div className="sticky relative top-4 z-30 py-2 text-xl font-medium text-white">
                      <span className="text-white z-[1] font-bold">{group.label}</span>
                      <div className="z-[-1] absolute top-[-20px] h-[100px] inset-0 pointer-events-none bg-gradient-to-b from-white via-white/50 dark:via-background/90 to-transparent dark:from-background" />
                    </div>

                    {/* ── Event cards ── */}
                    <div className="space-y-2 pt-2">
                      {group.events.map((event, i) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          index={runIdx + i}
                          nowMs={nowMs}
                          shouldReduceMotion={shouldReduceMotion}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewActivityFeedCard(props: {
  events: EventsFeedData;
  movers: {
    window: "24h" | "7d";
    onWindowChange: (window: "24h" | "7d") => void;
    watchlistCoinCount: number;
    limited: boolean;
    movers24h: MoversSnapshot;
    movers7d: MoversSnapshot;
    onRefreshNow: () => Promise<{
      scheduled: boolean;
      reason: string;
      coinsCount: number;
      walletsCount: number;
    }>;
  };
}) {
  return (
    <OverviewEventsFeedCardBase
      events={props.events}
      intro={
        <>
          <MoversFeedHeader movers={props.movers} />
          <div className="pt-3">
            <MoversFeedPost movers={props.movers} />
          </div>
        </>
      }
    />
  );
}

export function OverviewEventsFeedCard(props: {
  events: EventsFeedData;
}) {
  return (
    <OverviewEventsFeedCardBase events={props.events} />
  );
}

// ---------------------------------------------------------------------------
// Single event card (Wealthsimple activity-row style)
// ---------------------------------------------------------------------------

const MotionDiv = motion.div;

function EventCard(props: {
  event: OverviewEvent;
  index: number;
  nowMs: number;
  shouldReduceMotion: boolean | null;
}) {
  const { event, index, nowMs, shouldReduceMotion } = props;

  const logo = getTokenLogoURL(event.symbol, event.logoUrl ?? undefined);
  const timeLabel = formatRelativeTime(event.occurredAtMs, nowMs);
  const feedSentence = buildFeedSentence(event);

  const entryTransition = {
    duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
    ease: EASE_OUT_CUBIC,
    delay: Math.min(index, 10) * 0.03,
  } as const;

  return (
    <MotionDiv
      className="group/post rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] transition-colors duration-150 hover:bg-zinc-200/70 dark:hover:bg-white/[0.07]"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={entryTransition}
    >
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          <TokenLogo
            src={logo}
            alt={event.name}
            sizePx={36}
            fallbackText={event.symbol}
            unoptimizedRemote
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={event.tokenHref}
                className="text-[13px] font-semibold text-zinc-950 dark:text-white truncate hover:underline underline-offset-2"
              >
                {event.name}
              </Link>
              {event.kind === "news" && event.sentiment ? (
                <Badge
                  variant={sentimentVariant(event.sentiment)}
                  className="h-5 px-1.5 font-berkeley-mono text-[10px] tabular-nums shrink-0"
                >
                  {sentimentLabel(event.sentiment)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300 text-pretty">
              {feedSentence}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 opacity-0 group-hover/post:opacity-100 max-sm:opacity-100 transition-opacity duration-150">
              <Link
                href={event.tokenHref}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-foreground transition-colors active:scale-[0.98]"
              >
                <BarChart3 className="size-3" />
                View chart
              </Link>
              <AnalysisDialog
                coinId={event.coingeckoId}
                tokenData={{
                  id: event.coingeckoId,
                  name: event.name,
                  symbol: event.symbol,
                  logoUrl: logo,
                }}
                triggerVariant="explain"
                triggerLabel="Analyze"
                showTriggerTooltip={false}
                triggerAriaLabel="Analyze"
                triggerClassName="h-7 rounded-md border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none hover:bg-background hover:text-foreground focus-visible:ring-0"
              />
              {event.kind === "news" && event.externalHref ? (
                <a
                  href={event.externalHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-foreground transition-colors active:scale-[0.98]"
                >
                  <ExternalLink className="size-3" />
                  Read article
                </a>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-[11px] font-berkeley-mono tabular-nums text-muted-foreground">
              {timeLabel}
            </span>
          </div>
        </div>
      </div>
    </MotionDiv>
  );
}
