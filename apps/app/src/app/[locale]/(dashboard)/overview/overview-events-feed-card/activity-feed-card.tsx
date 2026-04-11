"use client";

import { Tab, TabList, TabPanel, Tabs } from "@solana/design-system/tabs";
import { Card, CardContent, CardHeader } from "@v1/ui/card";
import type { ComponentProps } from "react";
import { OverviewDailyBriefCard } from "../overview-daily-brief-card";
import { EventsFeedList } from "./events-feed-list";
import { MoversFeedHeader, MoversFeedPost } from "./movers-feed";
import type { ActivityMoversProps, EventsFeedData } from "./types";

export type OverviewActivityDailyBriefProps = ComponentProps<
  typeof OverviewDailyBriefCard
>;

export interface OverviewActivityFeedCardProps {
  events: EventsFeedData;
  movers: ActivityMoversProps;
  dailyBrief: OverviewActivityDailyBriefProps;
}

export function OverviewActivityFeedCard(props: OverviewActivityFeedCardProps) {
  return (
    <Card className="border-transparent shadow-none bg-transparent">
      <Tabs defaultValue="feed" fullWidth className="flex flex-col gap-0">
        <CardHeader className="p-0 space-y-0">
          <div className="px-5 pt-0 pb-1">
            <TabList className="px-0">
              <Tab className="max-w-[100px]" value="feed">Feed</Tab>
              <Tab className="max-w-[100px]" value="brief">Brief</Tab>
            </TabList>
          </div>
        </CardHeader>

        <CardContent className="px-5 pb-5 pt-0">
          <TabPanel value="feed" className="outline-none">
            <div role="region" aria-label="Activity feed">
              <EventsFeedList data={props.events} emptyClassName="py-8" />
            </div>
          </TabPanel>

          <TabPanel value="brief" className="outline-none">
            <div className="pt-1 space-y-6" aria-label="Brief">
              <OverviewDailyBriefCard {...props.dailyBrief} />
              <div aria-label="Top movers">
                <MoversFeedHeader movers={props.movers} />
                <div className="pt-3">
                  <MoversFeedPost movers={props.movers} />
                </div>
              </div>
            </div>
          </TabPanel>
        </CardContent>
      </Tabs>
    </Card>
  );
}
