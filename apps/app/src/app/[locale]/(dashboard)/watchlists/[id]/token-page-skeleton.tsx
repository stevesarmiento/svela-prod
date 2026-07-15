/**
 * Shared loading skeleton for the token page.
 *
 * Mirrors the real layout rendered by TokenPageShell/TokenPageClient:
 * - Price chart: transparent card with token line + big price on the left,
 *   timescale selector pills top-right, then a ~400px chart canvas.
 * - Market metrics: full-width ~120px bordered strip (rounded-[15px]).
 * - Technical indicators: section heading, then two half-width and one
 *   full-width 340px cards (rounded-2xl).
 *
 * Used both as the route-level loading.tsx UI and as the Suspense fallback
 * inside TokenPageShell so navigation and hydration show the same frame.
 */
export function TokenPageSkeleton() {
  return (
    <div className="min-h-screen w-full px-4 relative">
      <main className="mx-auto py-6 relative z-10">
        <div className="animate-pulse motion-reduce:animate-none">
          {/* Price chart header: logo + "<name> is currently" line, big price, change badge / timescale pills */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-zinc-950/10 dark:bg-white/10" />
                <div className="h-4 w-44 rounded bg-zinc-950/10 dark:bg-white/10" />
              </div>
              <div className="h-8 w-56 rounded bg-zinc-950/10 dark:bg-white/10" />
              <div className="h-6 w-24 rounded bg-zinc-950/10 dark:bg-white/10" />
            </div>
            <div className="h-[30px] w-64 rounded-[14px] bg-zinc-950/10 dark:bg-white/10" />
          </div>

          {/* Chart canvas (h-[400px] in PriceChart) */}
          <div className="mt-8 h-[400px] w-full rounded-[20px] bg-zinc-950/5 dark:bg-white/5" />

          {/* Market metrics strip (h-[120px] loading block in TokenPageClient) */}
          <div className="my-12 mt-8 h-[120px] rounded-[15px] border border-zinc-800/20 bg-zinc-950/5 dark:border-zinc-800/30 dark:bg-zinc-950/50" />

          {/* Technical indicators: heading + 2 half-width + 1 full-width 340px cards */}
          <div className="mt-16 mb-4 h-8 w-64 rounded bg-zinc-950/10 dark:bg-white/10" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="col-span-12 h-[340px] rounded-2xl border border-zinc-200/60 bg-zinc-950/5 md:col-span-6 dark:border-zinc-800/70 dark:bg-black/80" />
            <div className="col-span-12 h-[340px] rounded-2xl border border-zinc-200/60 bg-zinc-950/5 md:col-span-6 dark:border-zinc-800/70 dark:bg-black/80" />
            <div className="col-span-12 h-[340px] rounded-2xl border border-zinc-200/60 bg-zinc-950/5 dark:border-zinc-800/70 dark:bg-black/80" />
          </div>
        </div>
      </main>
    </div>
  );
}
