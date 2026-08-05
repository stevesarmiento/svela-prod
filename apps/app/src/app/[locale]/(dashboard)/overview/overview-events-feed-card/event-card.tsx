"use client";

import { AnalysisDialog } from "@/components/navigation/analysis-dialog";
import { TokenLogo } from "@/components/token-logo";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import {
  DURATION_UI_S,
  EASE_OUT_CUBIC,
  motionDuration,
} from "@/lib/motion-tokens";
import { Badge } from "@v1/ui/badge";
import { cn } from "@v1/ui/cn";
import { m } from "motion/react";
import Link from "next/link";
import {
  IconArrowDownLeftAndArrowUpRight,
  IconArrowDownRight,
  IconArrowTurnDownRight,
  IconEyeglasses,
  IconTriangleFill,
} from "symbols-react";
import {
  categoryLabel,
  clampPercentChange,
  formatRelativeTime,
  parseBreakoutTimeframeDays,
  sentimentLabel,
  sentimentVariant,
} from "./feed-helpers";
import type { OverviewEvent } from "./types";

const MotionDiv = m.div;

function PercentChangeBadge(props: { pct: number }) {
  const clamped = clampPercentChange(props.pct);
  const isPositive = clamped > 0;
  const isNegative = clamped < 0;
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
      {Math.abs(clamped).toFixed(2)}%
    </Badge>
  );
}

function EventCardContent(props: { event: OverviewEvent }) {
  const { event } = props;

  switch (event.kind) {
    case "price_spike": {
      const pct = typeof event.percent === "number" ? event.percent : 0;
      return (
        <>
          {"price moved "}
          <PercentChangeBadge pct={pct} />
          {" in the last 24h."}
        </>
      );
    }
    case "volume_anomaly": {
      const summary = event.summary?.trim().toLowerCase();
      if (!summary) return <>{"is showing unusual volume."}</>;
      if (event.tone === "negative") {
        return <>{`volume has cooled off to ${summary}.`}</>;
      }
      return <>{`volume is running hot at ${summary}.`}</>;
    }
    case "breakout_high": {
      const tf = parseBreakoutTimeframeDays(event.title);
      return (
        <>
          {"pushed to a new "}
          <Badge
            variant="success"
            className="inline-flex align-middle h-6 px-2 text-[13px] font-medium"
          >
            {tf ? `${tf}d high` : "local high"}
          </Badge>
          {"."}
        </>
      );
    }
    case "breakout_low": {
      const tf = parseBreakoutTimeframeDays(event.title);
      return (
        <>
          {"slipped to a new "}
          <Badge
            variant="destructive"
            className="inline-flex align-middle h-6 px-2 text-[13px] font-medium"
          >
            {tf ? `${tf}d low` : "local low"}
          </Badge>
          {"."}
        </>
      );
    }
    case "news":
      // Summary replaces the headline (it restates it) rather than stacking.
      return <>{event.aiSummary ?? event.title}</>;
  }
}

export function EventCard(props: {
  event: OverviewEvent;
  index: number;
  nowMs: number;
  shouldReduceMotion: boolean | null;
}) {
  const { event, index, nowMs, shouldReduceMotion } = props;

  const logo = getTokenLogoURL(event.symbol, event.logoUrl ?? undefined);
  const timeLabel = formatRelativeTime(event.occurredAtMs, nowMs);
  const showArticleAction =
    event.kind === "news" && Boolean(event.externalHref);

  const entryTransition = {
    duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
    ease: EASE_OUT_CUBIC,
    delay: Math.min(index, 10) * 0.03,
  } as const;

  return (
    <MotionDiv
      className="block"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={entryTransition}
    >
      <div
        className={cn(
          "event-feed-card group/post relative rounded-2xl p-5",
          "bg-zinc-100/80 dark:bg-zinc-900",
          "hover:bg-zinc-200/70 dark:hover:bg-white/[0.05]",
          "transition-colors duration-200 ease-out",
        )}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Link
                href={event.tokenHref}
                aria-label={`${event.name} chart`}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 align-middle",
                  "h-6 rounded-full pl-1.5 pr-2.5",
                  "bg-zinc-200/80 dark:bg-white/10",
                  "hover:bg-zinc-300/80 dark:hover:bg-white/[0.15]",
                  "transition-colors active:scale-[0.98]",
                )}
              >
                <TokenLogo
                  src={logo}
                  alt=""
                  sizePx={14}
                  className="ring ring-black/80"
                  fallbackText={event.symbol}
                  unoptimizedRemote
                />
                <span className="text-[14px] font-semibold text-zinc-950 dark:text-white tabular-nums">
                  {event.symbol.toUpperCase()}
                </span>
              </Link>
              {event.kind === "news" &&
              typeof event.percent === "number" &&
              Number.isFinite(event.percent) ? (
                <PercentChangeBadge pct={event.percent} />
              ) : null}
              {event.kind === "news" && event.sentiment ? (
                <Badge
                  variant={sentimentVariant(event.sentiment)}
                  className="inline-flex h-6 shrink-0 px-2 align-middle font-berkeley-mono text-[12px] tabular-nums"
                >
                  {sentimentLabel(event.sentiment)}
                </Badge>
              ) : null}
              {event.kind === "news" &&
              event.aiCategory &&
              categoryLabel(event.aiCategory) ? (
                <Badge
                  variant="outline"
                  className="inline-flex h-6 shrink-0 px-2 align-middle font-berkeley-mono text-[12px] text-muted-foreground border-zinc-200/60 dark:border-white/10"
                >
                  {categoryLabel(event.aiCategory)}
                </Badge>
              ) : null}
              {event.kind !== "news" &&
              typeof event.percent === "number" &&
              Number.isFinite(event.percent) ? (
                <PercentChangeBadge pct={event.percent} />
              ) : null}
            </div>
            <div
              className={cn(
                "relative flex shrink-0 items-center justify-end",
                showArticleAction ? "min-w-[6.5rem]" : "min-w-[4.5rem]",
              )}
            >
              <div className="flex items-center gap-1 pt-0.5 text-[13px] leading-none text-white/30 tabular-nums font-berkeley-mono transition-opacity duration-200 group-hover/post:opacity-0 max-sm:opacity-0">
                <IconArrowTurnDownRight className="size-3 fill-current" />
                <span>{timeLabel}</span>
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover/post:pointer-events-auto group-hover/post:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100">
                <Link
                  href={event.tokenHref}
                  aria-label="View chart"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/90 text-muted-foreground shadow-none transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
                >
                  <IconArrowDownLeftAndArrowUpRight className="size-3 fill-current" />
                </Link>
                <AnalysisDialog
                  coinId={event.coingeckoId}
                  tokenData={{
                    id: event.coingeckoId,
                    name: event.name,
                    symbol: event.symbol,
                    logoUrl: logo,
                  }}
                  triggerVariant="icon"
                  showTriggerTooltip={false}
                  triggerTooltip="Analyze"
                  triggerAriaLabel="Analyze"
                  triggerClassName="size-7 shrink-0 rounded-lg border border-border/60 bg-background/90 p-0 text-muted-foreground shadow-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                {showArticleAction && event.externalHref ? (
                  <a
                    href={event.externalHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Read article"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/90 text-muted-foreground shadow-none transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
                  >
                    <IconEyeglasses className="size-3.5 fill-current" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          <div className="min-w-0 text-[16px] leading-relaxed text-zinc-500 dark:text-zinc-400 group-hover/post:text-zinc-950 dark:group-hover/post:text-white transition-colors duration-200 ease-out text-pretty">
            <EventCardContent event={event} />
          </div>
        </div>
      </div>
    </MotionDiv>
  );
}
