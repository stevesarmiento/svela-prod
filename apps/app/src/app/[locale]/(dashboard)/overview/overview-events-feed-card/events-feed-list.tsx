"use client";

import { cn } from "@v1/ui/cn";
import { useQuery } from "convex/react";
import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { api } from "../../../../../../convex/_generated/api";
import { EventCard } from "./event-card";
import { groupByDate } from "./feed-helpers";
import type { EventsFeedData } from "./types";

type SentimentOverlayRow = {
  articleId: string;
  sentiment: "bullish" | "bearish" | "neutral" | null;
  sentimentConfidence: number | null;
  sentimentUpdatedAt: number | null;
};

export function EventsFeedList(props: {
  data: EventsFeedData;
  /** Extra classes on the empty-state wrapper (e.g. vertical padding). */
  emptyClassName?: string;
  /** Extra classes on the non-empty list wrapper. */
  listWrapperClassName?: string;
}) {
  const nowMs = Date.now();
  // News-only feed: ignore legacy cached snapshot rows (price_spike, breakouts, etc.).
  const events = useMemo(
    () => (props.data?.events ?? []).filter((e) => e.kind === "news"),
    [props.data?.events],
  );
  const articleIds = useMemo(
    () =>
      Array.from(
        new Set(
          events
            .map((event) => event.articleId)
            .filter((articleId): articleId is string => typeof articleId === "string" && articleId.length > 0),
        ),
      ),
    [events],
  );
  const sentimentOverlay = useQuery(
    api.overview.getNewsSentimentOverlay,
    articleIds.length > 0 ? { articleIds } : "skip",
  ) as SentimentOverlayRow[] | undefined;
  const sentimentByArticleId = useMemo(
    () =>
      new Map(
        (sentimentOverlay ?? []).map((row) => [row.articleId, row] as const),
      ),
    [sentimentOverlay],
  );
  const mergedEvents = useMemo(
    () =>
      events.map((event) => {
        if (!event.articleId) return event;
        const overlay = sentimentByArticleId.get(event.articleId);
        if (!overlay?.sentiment) return event;
        return { ...event, sentiment: overlay.sentiment };
      }),
    [events, sentimentByArticleId],
  );
  const groups = useMemo(() => groupByDate(mergedEvents), [mergedEvents]);
  const shouldReduceMotion = useReducedMotion();

  if (mergedEvents.length === 0) {
    return (
      <div
        className={cn(
          "text-xs text-muted-foreground text-pretty",
          props.emptyClassName,
        )}
      >
        No recent news yet.
      </div>
    );
  }

  return (
    <div
      className={cn(
        props.listWrapperClassName,
        // Ensure the last row can fully scroll into view (esp. with sticky headers / safe-area).
        "pb-[calc(env(safe-area-inset-bottom)+2.5rem)]",
      )}
    >
      {groups.map((group) => {
        let runIdx = 0;
        for (const g of groups) {
          if (g === group) break;
          runIdx += g.events.length;
        }

        return (
          <div key={group.label} className="pt-0">
            <div className="sticky relative top-4 z-30 py-2 text-xl font-medium text-white">
              <span className="text-white z-[1] font-bold">{group.label}</span>
              <div className="z-[-1] absolute top-[-20px] h-[80px] inset-0 pointer-events-none bg-gradient-to-b from-white via-white/50 dark:via-background/90 to-transparent dark:from-background" />
            </div>

            <div
              className={cn(
                "space-y-2 pt-2",
                "pb-[calc(env(safe-area-inset-bottom)+2rem)]",
              )}
            >
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
  );
}
