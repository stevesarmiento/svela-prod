"use client";

import { cn } from "@v1/ui/cn";
import { useMemo } from "react";

/**
 * Honest freshness indicator.
 *
 * The old version rendered a "Refreshes in mm:ss" countdown that was anchored
 * to the server rows' `updatedAt` while the actual refetch was anchored to
 * react-query's fetch time — it neither predicted nor triggered anything.
 * Data is now kept fresh server-side (5-min quotes cron + the demand-driven
 * chart scheduler) and the hooks refetch on interval/focus, so all that's
 * worth showing is when the data was last updated and whether a refresh is
 * in flight right now.
 */
export interface ScreenerAutoRefreshStatus {
  lastUpdatedAtMs: number | null;
  isRefreshing?: boolean;
}

const lastUpdatedFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
});

export function ScreenerAutoRefreshIndicator({
  status,
  className,
}: {
  status: ScreenerAutoRefreshStatus;
  className?: string;
}) {
  const lastUpdatedValue = useMemo(() => {
    if (!status.lastUpdatedAtMs) return "—";
    return lastUpdatedFormatter.format(new Date(status.lastUpdatedAtMs));
  }, [status.lastUpdatedAtMs]);

  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1",
          status.isRefreshing && "bg-primary/5",
        )}
        aria-label={
          status.isRefreshing
            ? `Refreshing. Last updated ${lastUpdatedValue}.`
            : `Last updated ${lastUpdatedValue}.`
        }
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            status.isRefreshing
              ? "bg-emerald-500 animate-pulse"
              : "bg-emerald-500/60",
          )}
        />
        <div className="flex items-center gap-1 leading-tight">
          <span className="text-[10px] text-primary/40">
            {status.isRefreshing ? "Refreshing…" : "Updated:"}
          </span>
          <span className="text-[11px] tabular-nums text-primary/80">
            {lastUpdatedValue}
          </span>
        </div>
      </div>
    </div>
  );
}
