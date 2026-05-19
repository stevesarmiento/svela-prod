"use client";

import { AnalysisDialog } from "./analysis-dialog";
import { WatchlistButton } from "./watchlist-button";
import { useTokenHeader } from "@/hooks/use-token-header";

interface TopNavChartActionsProps {
  coinId: string;
}

export function TopNavChartActions(props: TopNavChartActionsProps) {
  const { tokenData } = useTokenHeader();

  return (
    <>
      <AnalysisDialog
        coinId={props.coinId}
        tokenData={tokenData}
        triggerVariant="explain"
        triggerClassName="z-10"
        triggerTooltip="Deep Analysis"
        triggerAriaLabel="Deep Analysis"
      />
      <WatchlistButton coinId={props.coinId} />
    </>
  );
}
