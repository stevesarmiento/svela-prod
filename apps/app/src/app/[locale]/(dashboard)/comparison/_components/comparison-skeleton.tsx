import { cn } from "@v1/ui/cn";

const LEGEND_ROWS = ["legend-1", "legend-2", "legend-3", "legend-4"];
const TABLE_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

/**
 * Shared loading skeleton for the sector-comparison grid.
 *
 * Mirrors the real layout rendered by ComparisonChartsContent:
 * - Left (lg:col-span-5): vertical multi-line chart — transparent 300px
 *   canvas with the stacked h-8 legend rows below it.
 * - Right (lg:col-span-7): WatchlistTable — rounded-[10px] bg-primary/5
 *   wrapper with header labels and divided accordion rows.
 *
 * Used by the route-level loading.tsx (via ComparisonPageSkeleton), the
 * dynamic-import fallback in ComparisonClient, and the Suspense /
 * !isInitialized states inside chart-client.tsx so every loading phase
 * shows the same frame as the loaded page.
 */
export function ComparisonGridSkeleton({ inset = false }: { inset?: boolean }) {
  return (
    <div className={cn("w-full", inset && "px-4")}>
      <div className="animate-pulse motion-reduce:animate-none grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Chart column: empty card header spacing, 300px canvas, legend rows */}
        <div className="lg:col-span-5 min-w-0">
          <div className="flex flex-col">
            <div className="p-4" />
            <div className="px-2">
              <div className="h-[300px] w-full rounded-[13px] bg-zinc-950/5 dark:bg-white/5" />
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-3">
              {LEGEND_ROWS.map((key) => (
                <div
                  key={key}
                  className="h-8 w-full rounded-lg border border-zinc-200 bg-zinc-950/5 dark:border-zinc-800/70 dark:bg-white/5"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Table column: header labels + divided rows in a single card */}
        <div className="lg:col-span-7 min-w-0">
          <div className="rounded-[10px] bg-primary/5 p-0.5">
            <div className="hidden items-center justify-between px-4 py-2 sm:flex">
              <div className="h-3 w-16 rounded bg-zinc-950/10 dark:bg-white/10" />
              <div className="flex items-center gap-8">
                <div className="h-3 w-14 rounded bg-zinc-950/10 dark:bg-white/10" />
                <div className="h-3 w-16 rounded bg-zinc-950/10 dark:bg-white/10" />
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-primary/5 bg-white shadow-sm divide-y divide-primary/5 dark:bg-primary/5">
              {TABLE_ROWS.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between px-3 py-3 sm:px-4 sm:py-2"
                >
                  <div className="h-5 w-24 rounded-full bg-zinc-950/10 dark:bg-white/10" />
                  <div className="flex items-center gap-4">
                    <div className="h-3 w-16 rounded-full bg-zinc-950/10 dark:bg-white/10" />
                    <div className="h-3 w-10 rounded-full bg-zinc-950/10 dark:bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-page skeleton for /comparison: header row (icon + title left,
 * timescale pills right) above the comparison grid. Matches the wrappers
 * in ComparisonClient (`w-full space-y-6 px-4`, header `py-1 px-4`).
 */
export function ComparisonPageSkeleton() {
  return (
    <div className="w-full space-y-6 px-4">
      <div className="animate-pulse motion-reduce:animate-none flex items-center justify-between py-1 px-4">
        <div className="flex items-center gap-2">
          <div className="size-4.5 rounded-full bg-zinc-950/10 dark:bg-white/10" />
          <div className="h-5 w-40 rounded bg-zinc-950/10 dark:bg-white/10" />
        </div>
        <div className="h-8 w-64 rounded-[14px] bg-zinc-950/10 dark:bg-white/10" />
      </div>
      <ComparisonGridSkeleton />
    </div>
  );
}
