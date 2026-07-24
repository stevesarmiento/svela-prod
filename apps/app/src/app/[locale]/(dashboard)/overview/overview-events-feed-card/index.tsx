"use client";

import {
  OverviewActivityFeedCard as OverviewActivityFeedCardInner,
  type OverviewActivityDailyBriefProps,
  type OverviewActivityFeedCardProps,
} from "./activity-feed-card";
import type { ReactElement } from "react";

/** Explicit signature so `dailyBrief` is not dropped when importing from this barrel. */
export function OverviewActivityFeedCard(
  props: OverviewActivityFeedCardProps,
): ReactElement {
  return OverviewActivityFeedCardInner(props);
}

export type { OverviewActivityDailyBriefProps, OverviewActivityFeedCardProps };

export type { EventsFeedData, OverviewEvent } from "./types";
