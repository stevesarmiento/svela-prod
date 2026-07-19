"use client";

import { Card, CardContent } from "@v1/ui/card";
import type { ComponentProps } from "react";
import { OverviewDailyBriefCard } from "../overview-daily-brief-card";
import { EventsFeedList } from "./events-feed-list";
import type { EventsFeedData } from "./types";

export type OverviewActivityDailyBriefProps = ComponentProps<
  typeof OverviewDailyBriefCard
>;

export interface OverviewActivityFeedCardProps {
  events: EventsFeedData;
  dailyBrief: OverviewActivityDailyBriefProps;
}

export function OverviewActivityFeedCard(props: OverviewActivityFeedCardProps) {
  return (
    <Card className="border-transparent shadow-none bg-transparent">
      <CardContent className="px-5 pb-5 pt-0 space-y-6">
        <section aria-label="Brief">
          <OverviewDailyBriefCard {...props.dailyBrief} />
        </section>

        <section aria-label="Activity feed">
          <EventsFeedList data={props.events} emptyClassName="py-8" />
        </section>
      </CardContent>
    </Card>
  );
}
