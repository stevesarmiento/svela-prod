"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card";
import type { ReactNode } from "react";
import { EventsFeedList } from "./events-feed-list";
import type { EventsFeedData } from "./types";

export function OverviewEventsFeedCardBase(props: {
  events: EventsFeedData;
  /** Replaces default "Activity" title when provided. */
  header?: ReactNode;
  /** Passed to empty-state wrapper when the feed has no events. */
  emptyClassName?: string;
  /** Passed to the grouped list wrapper when the feed has events. */
  listWrapperClassName?: string;
}) {
  return (
    <Card className="border-transparent shadow-none bg-transparent">
      <CardHeader className="p-0 space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {props.header ?? (
            <CardTitle className="text-2xl font-bold text-zinc-950 dark:text-white text-balance px-5">
              Activity
            </CardTitle>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-0">
        <div role="region" aria-label="Activity feed">
          <EventsFeedList
            data={props.events}
            emptyClassName={props.emptyClassName ?? "py-8"}
            listWrapperClassName={props.listWrapperClassName}
          />
        </div>
      </CardContent>
    </Card>
  );
}
