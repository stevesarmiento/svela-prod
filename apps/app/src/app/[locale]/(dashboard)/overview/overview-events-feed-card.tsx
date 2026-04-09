"use client";

import { TokenLogo } from "@/components/token-logo";
import { formatUsdPrice } from "@/lib/format-usd";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import {
  DURATION_UI_S,
  EASE_OUT_CUBIC,
  motionDuration,
} from "@/lib/motion-tokens";
import { AnimatedSizeContainer } from "@v1/ui/animated-size-container";
import { Badge } from "@v1/ui/badge";
import { Button } from "@v1/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card";
import { cn } from "@v1/ui/cn";
import { Skeleton } from "@v1/ui/skeleton";
import { Spinner } from "@v1/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@v1/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@v1/ui/tooltip";
import {
  BarChart3,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flame,
  Link2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { IconTriangleFill } from "symbols-react";
import type { MoversSnapshot } from "./overview-movers-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OverviewStatus = "missing" | "fresh" | "stale";

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
              <li
                key={row.coingeckoId}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TokenLogo
                    src={logo}
                    alt={row.name}
                    sizePx={28}
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
                  ) : (
                    <div className="text-[11px] font-berkeley-mono tabular-nums text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
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
      <div className="px-4 py-3.5">
        <div className="text-[11px] text-muted-foreground text-pretty">
          {data.coinCount > 0
            ? `${data.coinCount} tokens${movers.limited ? " • limited" : ""}${
                data.missingMarketDataCount > 0
                  ? ` • ${data.missingMarketDataCount} missing quotes`
                  : ""
              }`
            : "Add coins to a watchlist to track movers."}
        </div>

        {!hasAny ? (
          <div className="text-xs text-muted-foreground text-pretty">
            {data.coinCount > 0
              ? "No movers available for this selection yet."
              : "No movers available yet."}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MoversList title="Top gainers" rows={gainers} />
            <MoversList title="Top losers" rows={losers} />
          </div>
        )}
      </div>
    </div>
  );
}

function MoversFeedHeader(props: {
  status: OverviewStatus;
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
    <div className="sticky top-0 z-30 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xl font-bold text-zinc-950 dark:text-white text-balance">
          <span className="z-[1] font-bold">Top movers</span>
          <div className="z-[-1] absolute top-[-2px] h-[70px] inset-0 pointer-events-none bg-gradient-to-b from-white via-white/50 dark:via-background/90 to-transparent dark:from-background" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={props.status === "fresh" ? "success" : "warning"}
            className="font-berkeley-mono text-[11px]"
          >
            {props.status === "fresh" ? "Fresh" : "Stale"}
          </Badge>

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

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isRefreshing}
            onClick={async () => {
              if (isRefreshing) return;
              setIsRefreshing(true);
              try {
                const result = await movers.onRefreshNow();
                if (!result.scheduled) {
                  toast("Refresh skipped", {
                    description:
                      result.reason === "cooldown"
                        ? "You refreshed recently. Try again in a moment."
                        : "Refresh could not be scheduled.",
                  });
                  return;
                }
                toast.success("Refresh scheduled", {
                  description: `Refreshing ${result.coinsCount} tokens and ${result.walletsCount} wallets.`,
                });
              } catch (error) {
                toast.error("Refresh failed", {
                  description:
                    error instanceof Error
                      ? error.message
                      : "Failed to refresh data.",
                });
              } finally {
                setIsRefreshing(false);
              }
            }}
            className="h-8 rounded-[10px]"
          >
            {isRefreshing ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} />
                Refreshing…
              </span>
            ) : (
              "Refresh"
            )}
          </Button>
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

function kindMeta(kind: EventKind): {
  emoji: string;
  label: string;
  colorClass: string;
} {
  switch (kind) {
    case "news":
      return {
        emoji: "\uD83D\uDCF0",
        label: "News",
        colorClass: "text-blue-500 dark:text-blue-400",
      };
    case "price_spike":
      return {
        emoji: "\u26A1",
        label: "Price spike",
        colorClass: "text-amber-500 dark:text-amber-400",
      };
    case "volume_anomaly":
      return {
        emoji: "\uD83D\uDCC8",
        label: "Volume anomaly",
        colorClass: "text-purple-500 dark:text-purple-400",
      };
    case "breakout_high":
      return {
        emoji: "\uD83D\uDE80",
        label: "Breakout",
        colorClass: "text-emerald-500 dark:text-emerald-400",
      };
    case "breakout_low":
      return {
        emoji: "\uD83D\uDCC9",
        label: "Breakdown",
        colorClass: "text-rose-500 dark:text-rose-400",
      };
  }
}

function toneBadgeVariant(
  tone: EventTone,
): "success" | "destructive" | "outline" {
  if (tone === "positive") return "success";
  if (tone === "negative") return "destructive";
  return "outline";
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

/** Deterministic seed from event id for fake community count. */
function seedCount(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 42) + 1;
}

// ---------------------------------------------------------------------------
// Local interaction state (no persistence — fun engagement layer only)
// ---------------------------------------------------------------------------

function useFeedInteractions() {
  const [fireSet, setFireSet] = useState<Set<string>>(() => new Set());
  const [bookmarkSet, setBookmarkSet] = useState<Set<string>>(() => new Set());
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => new Set());

  const toggleFire = useCallback((id: string) => {
    setFireSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    fireSet,
    bookmarkSet,
    expandedSet,
    toggleFire,
    toggleBookmark,
    toggleExpanded,
  };
}

// ---------------------------------------------------------------------------
// Copy-link button (follows copy-button.tsx pattern)
// ---------------------------------------------------------------------------

function CopyLinkAction(props: { href: string }) {
  const [copied, setCopied] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const iconTransition = {
    duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
    ease: EASE_OUT_CUBIC,
  } as const;

  const handleCopy = async () => {
    try {
      const url = `${window.location.origin}${props.href}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors active:scale-[0.95]"
        >
          <span className="relative size-3.5 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span
                  key="check"
                  className="absolute inset-0 flex items-center justify-center"
                  initial={
                    shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={
                    shouldReduceMotion ? undefined : { opacity: 0, scale: 0.8 }
                  }
                  transition={iconTransition}
                >
                  <Check size={13} className="text-green-500" />
                </motion.span>
              ) : (
                <motion.span
                  key="link"
                  className="absolute inset-0 flex items-center justify-center"
                  initial={
                    shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={
                    shouldReduceMotion ? undefined : { opacity: 0, scale: 0.8 }
                  }
                  transition={iconTransition}
                >
                  <Link2 size={13} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        Copy link
      </TooltipContent>
    </Tooltip>
  );
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
  status: OverviewStatus;
  events: EventsFeedData;
  intro?: ReactNode;
}) {
  const data = props.events;
  const isLoading = props.status === "missing";
  const nowMs = Date.now();

  const events = useMemo(() => data?.events ?? [], [data?.events]);
  const groups = useMemo(() => groupByDate(events), [events]);
  const shouldReduceMotion = useReducedMotion();

  const {
    fireSet,
    bookmarkSet,
    expandedSet,
    toggleFire,
    toggleBookmark,
    toggleExpanded,
  } = useFeedInteractions();

  if (isLoading) return <EventsFeedSkeleton />;

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="border-transparent shadow-none bg-transparent">
        <CardHeader className="p-0 space-y-0">
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
                      <div className="sticky relative top-0 z-30 py-2 text-xl font-medium text-white">
                        <span className="text-white z-[1] font-bold">{group.label}</span>
                        <div className="z-[-1] absolute top-[-2px] h-[70px] inset-0 pointer-events-none bg-gradient-to-b from-white via-white/50 dark:via-background/90 to-transparent dark:from-background" />
                      </div>

                      {/* ── Event cards ── */}
                      <div className="space-y-2 pt-2">
                        {group.events.map((event, i) => (
                          <EventCard
                            key={event.id}
                            event={event}
                            index={runIdx + i}
                            nowMs={nowMs}
                            isFired={fireSet.has(event.id)}
                            isBookmarked={bookmarkSet.has(event.id)}
                            isExpanded={expandedSet.has(event.id)}
                            onToggleFire={toggleFire}
                            onToggleBookmark={toggleBookmark}
                            onToggleExpanded={toggleExpanded}
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
    </TooltipProvider>
  );
}

export function OverviewActivityFeedCard(props: {
  status: OverviewStatus;
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
      status={props.status}
      events={props.events}
      intro={
        <>
          <MoversFeedHeader status={props.status} movers={props.movers} />
          <div className="pt-3">
            <MoversFeedPost movers={props.movers} />
          </div>
        </>
      }
    />
  );
}

export function OverviewEventsFeedCard(props: {
  status: OverviewStatus;
  events: EventsFeedData;
}) {
  return (
    <OverviewEventsFeedCardBase status={props.status} events={props.events} />
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
  isFired: boolean;
  isBookmarked: boolean;
  isExpanded: boolean;
  onToggleFire: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  shouldReduceMotion: boolean | null;
}) {
  const {
    event,
    index,
    nowMs,
    isFired,
    isBookmarked,
    isExpanded,
    onToggleFire,
    onToggleBookmark,
    onToggleExpanded,
    shouldReduceMotion,
  } = props;

  const logo = getTokenLogoURL(event.symbol, event.logoUrl ?? undefined);
  const timeLabel = formatRelativeTime(event.occurredAtMs, nowMs);
  const meta = kindMeta(event.kind);
  const baseCount = useMemo(() => seedCount(event.id), [event.id]);
  const fireCount = baseCount + (isFired ? 1 : 0);
  const needsTruncation = (event.summary?.length ?? 0) > 80;

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
        {/* ── Primary row: logo + name + subtitle ── */}
        <div className="flex items-center gap-3">
          <TokenLogo
            src={logo}
            alt={event.name}
            sizePx={36}
            fallbackText={event.symbol}
            unoptimizedRemote
          />

          <div className="min-w-0 flex-1">
            {/* Name */}
            <Link
              href={event.tokenHref}
              className="block text-[13px] font-semibold text-zinc-950 dark:text-white truncate hover:underline underline-offset-2"
            >
              {event.name}
            </Link>

            {/* Kind label (colored) · metadata */}
            <div className="flex flex-wrap items-center gap-x-1 text-[12px] leading-snug">
              <span className={cn("font-medium", meta.colorClass)}>
                {meta.label}
              </span>
              <span className="text-muted-foreground">\u00B7</span>
              <span className="font-berkeley-mono tabular-nums text-muted-foreground">
                {event.symbol.toUpperCase()}
              </span>
              {typeof event.percent === "number" ? (
                <>
                  <span className="text-muted-foreground">\u00B7</span>
                  <span
                    className={cn(
                      "font-berkeley-mono tabular-nums font-medium",
                      event.tone === "positive"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : event.tone === "negative"
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground",
                    )}
                  >
                    {event.percent > 0 ? "+" : ""}
                    {event.percent.toFixed(2)}%
                  </span>
                </>
              ) : null}
              {typeof event.valueUsd === "number" ? (
                <>
                  <span className="text-muted-foreground">\u00B7</span>
                  <span className="font-berkeley-mono tabular-nums text-muted-foreground">
                    {formatUsdPrice(Math.abs(event.valueUsd))}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {/* Right side: time + emoji */}
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-[11px] font-berkeley-mono tabular-nums text-muted-foreground">
              {timeLabel}
            </span>
            <span className="text-sm" aria-hidden>
              {meta.emoji}
            </span>
          </div>
        </div>

        {/* ── Expandable detail section ── */}
        <AnimatedSizeContainer height>
          <div>
            {/* Title (always visible if different from name) */}
            {event.title !== event.name ? (
              <p className="mt-2 ml-12 text-[12px] text-zinc-700 dark:text-zinc-300 leading-snug text-pretty">
                {event.title}
              </p>
            ) : null}

            {/* Badges: sentiment for news */}
            {event.kind === "news" ? (
              <div className="mt-1.5 ml-12 flex flex-wrap items-center gap-1.5">
                {event.sentiment ? (
                  <Badge
                    variant={sentimentVariant(event.sentiment)}
                    className="h-5 px-1.5 font-berkeley-mono text-[10px] tabular-nums"
                  >
                    {sentimentLabel(event.sentiment)}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 font-berkeley-mono text-[10px] tabular-nums text-muted-foreground"
                  >
                    Sentiment pending
                  </Badge>
                )}
              </div>
            ) : null}

            {/* Expandable summary */}
            {event.summary ? (
              <div className="mt-1.5 ml-12">
                <p className="text-[12px] text-muted-foreground leading-relaxed text-pretty">
                  {isExpanded || !needsTruncation
                    ? event.summary
                    : `${event.summary.slice(0, 80)}\u2026`}
                </p>
                {needsTruncation ? (
                  <button
                    type="button"
                    onClick={() => onToggleExpanded(event.id)}
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? "Less" : "More"}
                    {isExpanded ? (
                      <ChevronUp size={11} />
                    ) : (
                      <ChevronDown size={11} />
                    )}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* ── Action bar (hover-reveal) ── */}
            <div className="mt-2 ml-[44px] flex items-center gap-0.5 opacity-0 group-hover/post:opacity-100 max-sm:opacity-100 transition-opacity duration-150">
              {/* Fire */}
              <button
                type="button"
                onClick={() => {
                  if (!isFired) toast.success("Fired up!");
                  onToggleFire(event.id);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors active:scale-[0.95]",
                  isFired
                    ? "text-orange-500"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={isFired ? "fired" : "idle"}
                    initial={
                      shouldReduceMotion ? false : { scale: 0.6, opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    exit={
                      shouldReduceMotion
                        ? undefined
                        : { scale: 0.6, opacity: 0 }
                    }
                    transition={{
                      type: "spring",
                      stiffness: 280,
                      damping: 18,
                      mass: 0.3,
                    }}
                  >
                    <Flame
                      size={13}
                      className={cn(isFired && "fill-orange-500")}
                    />
                  </motion.span>
                </AnimatePresence>
                <span className="font-berkeley-mono tabular-nums text-[10px]">
                  {fireCount}
                </span>
              </button>

              {/* Copy */}
              <CopyLinkAction href={event.tokenHref} />

              {/* Bookmark */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleBookmark(event.id);
                      toast.success(
                        isBookmarked ? "Removed bookmark" : "Bookmarked",
                      );
                    }}
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-1 transition-colors active:scale-[0.95]",
                      isBookmarked
                        ? "text-amber-500"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={isBookmarked ? "saved" : "unsaved"}
                        initial={
                          shouldReduceMotion
                            ? false
                            : { scale: 0.6, opacity: 0 }
                        }
                        animate={{ scale: 1, opacity: 1 }}
                        exit={
                          shouldReduceMotion
                            ? undefined
                            : { scale: 0.6, opacity: 0 }
                        }
                        transition={{
                          type: "spring",
                          stiffness: 280,
                          damping: 18,
                          mass: 0.3,
                        }}
                      >
                        <Bookmark
                          size={13}
                          className={cn(isBookmarked && "fill-amber-500")}
                        />
                      </motion.span>
                    </AnimatePresence>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {isBookmarked ? "Remove bookmark" : "Bookmark"}
                </TooltipContent>
              </Tooltip>

              {/* Chart */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={event.tokenHref}
                    className="inline-flex items-center rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground transition-colors active:scale-[0.95]"
                  >
                    <BarChart3 size={13} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  View chart
                </TooltipContent>
              </Tooltip>

              {/* External source */}
              {event.kind === "news" && event.externalHref ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={event.externalHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground transition-colors active:scale-[0.95]"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Open source
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </AnimatedSizeContainer>
      </div>
    </MotionDiv>
  );
}
