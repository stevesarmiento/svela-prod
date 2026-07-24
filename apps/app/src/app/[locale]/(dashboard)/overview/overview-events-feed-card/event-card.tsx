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
      return <>{`${event.title}`}</>;
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
  const showArticleAction = event.kind === "news" && Boolean(event.externalHref);
  const slideRevealClipClass = showArticleAction
    ? [
        "[clip-path:inset(0_0_0_0_round_1rem)]",
        "group-hover/post:[clip-path:inset(0_8rem_0_0_round_1rem)]",
        "max-sm:[clip-path:inset(0_8rem_0_0_round_1rem)]",
      ].join(" ")
    : [
        "[clip-path:inset(0_0_0_0_round_1rem)]",
        "group-hover/post:[clip-path:inset(0_5.25rem_0_0_round_1rem)]",
        "max-sm:[clip-path:inset(0_5.25rem_0_0_round_1rem)]",
      ].join(" ");

  // Fade out content right at the reveal boundary (no reflow / no shifting).
  const slideRevealMaskClass = showArticleAction
    ? [
        // Resting: fully opaque.
        "[mask-image:linear-gradient(90deg,#000_0%,#000_100%)]",
        "[-webkit-mask-image:linear-gradient(90deg,#000_0%,#000_100%)]",
        // Hover/mobile: fade over the last 2.5rem before the 8rem reveal.
        "group-hover/post:[mask-image:linear-gradient(90deg,#000_0%,#000_calc(100%-10rem),transparent_calc(100%-8rem),transparent_100%)]",
        "group-hover/post:[-webkit-mask-image:linear-gradient(90deg,#000_0%,#000_calc(100%-10rem),transparent_calc(100%-8rem),transparent_100%)]",
        "max-sm:[mask-image:linear-gradient(90deg,#000_0%,#000_calc(100%-10rem),transparent_calc(100%-8rem),transparent_100%)]",
        "max-sm:[-webkit-mask-image:linear-gradient(90deg,#000_0%,#000_calc(100%-10rem),transparent_calc(100%-8rem),transparent_100%)]",
      ].join(" ")
    : [
        "[mask-image:linear-gradient(90deg,#000_0%,#000_100%)]",
        "[-webkit-mask-image:linear-gradient(90deg,#000_0%,#000_100%)]",
        // Hover/mobile: fade over the last 2.5rem before the 5.25rem reveal.
        "group-hover/post:[mask-image:linear-gradient(90deg,#000_0%,#000_calc(100%-7.75rem),transparent_calc(100%-5.25rem),transparent_100%)]",
        "group-hover/post:[-webkit-mask-image:linear-gradient(90deg,#000_0%,#000_calc(100%-7.75rem),transparent_calc(100%-5.25rem),transparent_100%)]",
        "max-sm:[mask-image:linear-gradient(90deg,#000_0%,#000_calc(100%-7.75rem),transparent_calc(100%-5.25rem),transparent_100%)]",
        "max-sm:[-webkit-mask-image:linear-gradient(90deg,#000_0%,#000_calc(100%-7.75rem),transparent_calc(100%-5.25rem),transparent_100%)]",
      ].join(" ");

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
          "event-feed-card group/post relative overflow-hidden rounded-2xl",
          "bg-zinc-200/50 dark:bg-white/[0.06]",
        )}
      >
        {/* Behind the slide: icon actions (revealed when top layer shrinks on hover) */}
        <div className="absolute inset-y-0 right-0 z-0 flex items-center gap-1.5 pr-2 pl-1">
          {showArticleAction && event.externalHref ? (
            <a
              href={event.externalHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Read article"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/90 text-muted-foreground shadow-none transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <IconEyeglasses className="size-4 fill-current" />
            </a>
          ) : null}
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
            triggerClassName="size-8 shrink-0 rounded-lg border border-border/60 bg-background/90 p-0 text-muted-foreground shadow-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <Link
            href={event.tokenHref}
            aria-label="View chart"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/90 text-muted-foreground shadow-none transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <IconArrowDownLeftAndArrowUpRight className="size-3.5 fill-current" />
          </Link>
        </div>

        <div
          className={cn(
            "relative z-10 w-full min-w-0 rounded-2xl p-5",
            "bg-zinc-100/80 dark:bg-zinc-900",
            "group-hover/post:bg-zinc-200/70 dark:group-hover/post:bg-white/[0.05]",
            "duration-200 ease-out",
            shouldReduceMotion
              ? "transition-[background-color]"
              : "transition-[clip-path,background-color]",
            slideRevealClipClass,
          )}
        >
          <div
            className={cn(
              "min-w-0 overflow-hidden",
              slideRevealMaskClass,
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
                  {event.kind !== "news" &&
                  typeof event.percent === "number" &&
                  Number.isFinite(event.percent) ? (
                    <PercentChangeBadge pct={event.percent} />
                  ) : null}
                </div>
                <div className="flex items-center gap-1 shrink-0 pt-0.5 text-[13px] leading-none text-white/30 tabular-nums font-berkeley-mono">
                  <IconArrowTurnDownRight className="size-3 fill-current" />
                  <span>{timeLabel}</span>
                </div>
              </div>
              <div className="min-w-0 text-[16px] leading-relaxed text-zinc-700 dark:text-zinc-300 text-pretty">
                <EventCardContent event={event} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </MotionDiv>
  );
}
