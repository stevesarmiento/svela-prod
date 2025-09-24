"use client";

// import { useLongShortRatio } from "@/hooks/use-long-short-ratio"; // TODO: Implement this hook
import { Skeleton } from "@v1/ui/skeleton";

interface LongShortRatioProps {
  cmcId: string;
}

export function LongShortRatio({ cmcId }: LongShortRatioProps) {
  // TODO: Implement useLongShortRatio hook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = cmcId; // Temporary to avoid unused variable warning
  const data = null;
  const isLoading = false;
  const error = null;

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
        <span className="text-md font-diatype-mono text-muted-foreground">
          N/A
        </span>
      </div>
    );
  }

  // Always show no data message since hook is not implemented
  if (true) {
    return (
      <div className="flex flex-col items-center py-4">
        <span className="text-[11px] text-muted-foreground font-medium mb-2">
          Long/Short Ratio
        </span>
        <span className="text-md font-diatype-mono text-muted-foreground">
          No Data
        </span>
      </div>
    );
  }
}