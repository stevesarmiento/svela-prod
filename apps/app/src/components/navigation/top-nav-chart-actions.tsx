"use client";

import { AnalysisDialog } from "./analysis-dialog";
import { WatchlistButton } from "./watchlist-button";

interface TopNavChartActionsProps {
  coinId: string;
}

export function TopNavChartActions(props: TopNavChartActionsProps) {
  return (
    <>
      <AnalysisDialog
        coinId={props.coinId}
        tokenData={null}
        triggerVariant="explain"
        triggerClassName="z-10"
        triggerTooltip="Deep Analysis"
        triggerAriaLabel="Deep Analysis"
      />
      <WatchlistButton coinId={props.coinId} />
    </>
  );
}
