"use client";

import {
  OverviewActivityFeedCard as OverviewActivityFeedCardInner,
  type OverviewActivityDailyBriefProps,
  type OverviewActivityFeedCardProps,
} from "./activity-feed-card";
import { OverviewEventsFeedCardBase } from "./overview-events-feed-base";
import type { EventsFeedData } from "./types";
import type { ReactElement } from "react";

/** Explicit signature so `dailyBrief` is not dropped when importing from this barrel. */
export function OverviewActivityFeedCard(
  props: OverviewActivityFeedCardProps,
): ReactElement {
  return OverviewActivityFeedCardInner(props);
}

export type { OverviewActivityDailyBriefProps, OverviewActivityFeedCardProps };

export function OverviewEventsFeedCard(props: { events: EventsFeedData }) {
  return <OverviewEventsFeedCardBase events={props.events} />;
}

export type {
  ActivityMoversProps,
  EventsFeedData,
  OverviewEvent,
} from "./types";
