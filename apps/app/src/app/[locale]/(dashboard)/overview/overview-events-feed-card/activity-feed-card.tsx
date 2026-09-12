"use client";

import { Card, CardContent } from "@v1/ui/card";
import type { ComponentProps, ReactNode } from "react";
import type { OverviewDailyBriefCard } from "../overview-daily-brief-card";
import { EventsFeedList } from "./events-feed-list";
import type { EventsFeedData } from "./types";

export type OverviewActivityDailyBriefProps = ComponentProps<
  typeof OverviewDailyBriefCard
>;

export interface OverviewActivityFeedCardProps {
  events: EventsFeedData;
  /**
   * Unused for now: the daily-brief carousel is hidden from the overview
   * (feed only). The component and this prop plumbing are kept intact so the
   * carousel can be re-mounted here or elsewhere — render
   * <OverviewDailyBriefCard {...props.dailyBrief} /> to bring it back.
   */
  dailyBrief: OverviewActivityDailyBriefProps;
}

/** Chromeless card + section wrapper around the activity feed body. */
export function ActivityFeedCardShell({ children }: { children: ReactNode }) {
  return (
    <Card className="border-transparent shadow-none bg-transparent">
      <CardContent className="px-5 pb-5 pt-0 space-y-6">
        <section aria-label="Activity feed">{children}</section>
      </CardContent>
    </Card>
  );
}

export function OverviewActivityFeedCard(props: OverviewActivityFeedCardProps) {
  return (
    <ActivityFeedCardShell>
      <EventsFeedList data={props.events} emptyClassName="py-8" />
    </ActivityFeedCardShell>
  );
}
