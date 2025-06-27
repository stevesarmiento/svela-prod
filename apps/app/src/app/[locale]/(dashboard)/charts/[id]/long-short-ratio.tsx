"use client";

import { useLongShortRatio } from "@/hooks/use-long-short-ratio";
import { cn } from "@v1/ui/cn";
import { Skeleton } from "@v1/ui/skeleton";

interface LongShortRatioProps {
  cmcId: string;
}

export function LongShortRatio({ cmcId }: LongShortRatioProps) {
  const { data, isLoading, error } = useLongShortRatio(cmcId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-4">
        <span className="text-[11px] text-muted-foreground font-medium mb-2">
          Long/Short Ratio
        </span>
        <Skeleton className="h-5 w-16" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center py-4">
        <span className="text-[11px] text-muted-foreground font-medium mb-2">
          Long/Short Ratio
        </span>
        <span className="text-md font-mono text-muted-foreground">
          N/A
        </span>
      </div>
    );
  }

  if (data.longShortRatio === null || data.longShortRatio === undefined) {
    return (
      <div className="flex flex-col items-center py-4">
        <span className="text-[11px] text-muted-foreground font-medium mb-2">
          Long/Short Ratio
        </span>
        <span className="text-md font-mono text-muted-foreground">
          No Data
        </span>
      </div>
    );
  }

  // Determine color based on ratio (>1 = more longs, <1 = more shorts)
  const isLongHeavy = data.longShortRatio > 1;
  const ratioFormatted = data.longShortRatio.toFixed(2);

  return (
    <div className="flex flex-col items-center py-4">
      <div className="flex items-center gap-2 text-center mb-2">
        <span className="text-[11px] text-muted-foreground font-medium">
          Long/Short Ratio
        </span>
      </div>
      
      <div className={cn(
        "text-md font-mono text-center",
        isLongHeavy ? "text-emerald-500" : "text-rose-500"
      )}>
        {ratioFormatted}
      </div>
      
      <div className="text-[8px] text-muted-foreground mt-1">
        {isLongHeavy ? "Long Heavy" : "Short Heavy"}
      </div>
      
      {data.lastUpdate && (
        <span className="text-[8px] text-muted-foreground">
          {new Date(data.lastUpdate * 1000).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}