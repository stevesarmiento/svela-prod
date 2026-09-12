"use client";

import { ActivityFeedCardShell } from "@/app/[locale]/(dashboard)/overview/overview-events-feed-card/activity-feed-card";
import { EventsFeedGroups } from "@/app/[locale]/(dashboard)/overview/overview-events-feed-card/events-feed-list";
import { PortfolioValueCard } from "@/app/[locale]/(dashboard)/overview/overview-portfolio-value-card";
import { OverviewTwoColumnLayout } from "@/app/[locale]/(dashboard)/overview/overview-two-column-layout";
import { useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import type { ShowcaseOverview } from "../_lib/showcase-types";

const noop = () => {};

/**
 * Mirrors `OverviewHoldingsSection`'s render tree with static data: the real
 * `PortfolioValueCard` on the left and real `EventCard`s on the right.
 */
export function PreviewOverviewView({
  overview,
  generatedAtMs,
}: {
  overview: ShowcaseOverview;
  generatedAtMs: number;
}) {
  const [activeTimeScale, setActiveTimeScale] = useState("1d");
  const shouldReduceMotion = useReducedMotion();
  const groups = useMemo(
    () => [{ label: "Today", events: overview.events }],
    [overview.events],
  );

  return (
    <OverviewTwoColumnLayout
      left={
        <PortfolioValueCard
          displayValueUsd={overview.valueUsd}
          hasHoldings
          rangeChange={overview.rangeChange}
          chartNote={null}
          activeTimeScale={activeTimeScale}
          setActiveTimeScale={setActiveTimeScale}
          portfolioChartPoints={overview.portfolioPoints}
          marketPoints={overview.marketPoints}
          onScrub={noop}
          breadth={overview.breadth}
          breadthGroups={overview.breadthGroups}
          breadthLoading={false}
        />
      }
      right={
        <ActivityFeedCardShell>
          <EventsFeedGroups
            groups={groups}
            nowMs={generatedAtMs}
            shouldReduceMotion={shouldReduceMotion}
            showEventActions={false}
          />
        </ActivityFeedCardShell>
      }
    />
  );
}
