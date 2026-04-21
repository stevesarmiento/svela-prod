"use client";

import { useEffect, useState } from "react";
import {
  OverviewActivityFeedCard,
  type OverviewActivityFeedCardProps,
} from "./overview-events-feed-card";

export function OverviewActivityFeedPanel(
  props: OverviewActivityFeedCardProps,
) {
  const [canGenerateBrief, setCanGenerateBrief] = useState(false);

  useEffect(() => {
    const enableGeneration = () => {
      setCanGenerateBrief(true);
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(enableGeneration, {
        timeout: 2_000,
      });
      return () => window.cancelIdleCallback(idleId);
    }

    const timer = setTimeout(enableGeneration, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <OverviewActivityFeedCard
      {...props}
      dailyBrief={{
        ...props.dailyBrief,
        enableGeneration: canGenerateBrief,
      }}
    />
  );
}
