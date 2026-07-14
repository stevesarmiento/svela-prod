"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { IconAnalyze } from "@/components/icon-analyze";

function loadAnalysisDialog() {
  return import("@/components/navigation/analysis-dialog");
}

const LazyAnalysisDialog = dynamic(
  () => loadAnalysisDialog().then((module) => module.AnalysisDialog),
  { ssr: false, loading: () => null },
);

export function ScreenerAnalysisActionCell(props: {
  coinId: string;
  tokenData: {
    name?: string;
    symbol?: string;
    id?: string;
    logoUrl?: string;
  } | null;
}) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [shouldOpenOnLoad, setShouldOpenOnLoad] = useState(false);

  const preload = useCallback(() => {
    if (shouldLoad) return;
    setShouldLoad(true);
    void loadAnalysisDialog();
  }, [shouldLoad]);

  if (shouldLoad) {
    return (
      <LazyAnalysisDialog
        coinId={props.coinId}
        tokenData={props.tokenData}
        triggerVariant="icon"
        triggerTooltip="Deep Analysis"
        triggerAriaLabel="Deep Analysis"
        defaultOpen={shouldOpenOnLoad}
      />
    );
  }

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-1 rounded-lg bg-transparent hover:bg-primary/5 transition-colors group"
          aria-label="Deep Analysis"
          onPointerEnter={preload}
          onFocus={preload}
          onTouchStart={preload}
          onClick={() => {
            preload();
            setShouldOpenOnLoad(true);
          }}
        >
          <IconAnalyze className="size-3.5 fill-zinc-400 dark:group-hover:fill-white transition-colors" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="flex items-center gap-2 p-1.5 px-2 rounded-md text-xs">
        <span>Deep analysis</span>
      </TooltipContent>
    </Tooltip>
  );
}
