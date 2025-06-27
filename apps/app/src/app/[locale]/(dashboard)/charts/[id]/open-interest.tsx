"use client";

import { useOpenInterest } from "@/hooks/use-open-interest";
import { Skeleton } from "@v1/ui/skeleton";
import { formatLargeNumber } from "@v1/ui/format-numbers";

interface OpenInterestProps {
  cmcId: string;
}

export function OpenInterest({ cmcId }: OpenInterestProps) {
  const { data, isLoading, error } = useOpenInterest(cmcId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-4">
        <span className="text-[11px] text-muted-foreground font-medium mb-2">
          Open Interest
        </span>
        <Skeleton className="h-5 w-20" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center py-4">
        <span className="text-[11px] text-muted-foreground font-medium mb-2">
          Open Interest
        </span>
        <span className="text-md font-mono text-muted-foreground">
          N/A
        </span>
      </div>
    );
  }

  if (data.currentOpenInterest === null) {
    return (
      <div className="flex flex-col items-center py-4">
        <span className="text-[11px] text-muted-foreground font-medium mb-2">
          Open Interest
        </span>
        <span className="text-md font-mono text-muted-foreground">
          No Data
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-4">
      <div className="flex items-center gap-2 text-center mb-2">
        <span className="text-[11px] text-muted-foreground font-medium">
          Open Interest
        </span>
      </div>
      
      <div className="text-md font-mono text-center text-foreground">
        ${formatLargeNumber(data.currentOpenInterest || 0)}
      </div>
      
      {data.lastUpdate && (
        <span className="text-[8px] text-muted-foreground mt-1">
          {new Date(data.lastUpdate).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}