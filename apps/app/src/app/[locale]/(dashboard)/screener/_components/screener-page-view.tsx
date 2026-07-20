"use client";

import type { SortingState, Updater } from "@tanstack/react-table";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo } from "react";

import { Button } from "@v1/ui/button";
import { Spinner } from "@v1/ui/spinner";

import { ScreenerProvider, useScreenerContext } from "./screener-context";
import { ScreenerFiltersBar } from "./screener-filters-bar";
import type { ScreenerTableStatus } from "./screener-table-types";
import type { ScreenerSort, ScreenerSortKey } from "./use-screener-url-state";
import { METRIC_ID_TO_SORT_KEY } from "./use-screener-url-state";

function loadScreenerAutoRefreshIndicator() {
  return import("./screener-auto-refresh-indicator");
}

function loadScreenerEmptyState() {
  return import("./screener-empty-state");
}

function loadScreenerTableSection() {
  return import("./screener-table-section");
}

const LazyScreenerAutoRefreshIndicator = dynamic(
  () =>
    loadScreenerAutoRefreshIndicator().then(
      (module) => module.ScreenerAutoRefreshIndicator,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 rounded-md px-2 py-1">
          <span
            className="size-1.5 rounded-full bg-primary/20"
            aria-hidden="true"
          />
          <div className="flex items-center gap-1 leading-tight">
            <span className="text-[10px] text-primary/40">Updated:</span>
            <span className="text-[11px] tabular-nums text-primary/80">--</span>
          </div>
        </div>
      </div>
    ),
  },
);

const LazyScreenerEmptyState = dynamic(
  () => loadScreenerEmptyState().then((module) => module.ScreenerEmptyState),
  {
    ssr: false,
    loading: () => (
      <div className="py-6 border border-dashed border-border rounded-lg">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="text-center">
            <h3 className="font-medium">Loading…</h3>
          </div>
        </div>
      </div>
    ),
  },
);

const LazyScreenerTableSection = dynamic(
  () =>
    loadScreenerTableSection().then((module) => module.ScreenerTableSection),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-8">
        <Spinner size={24} />
      </div>
    ),
  },
);

/** Column-key domain ↔ TanStack column ids. */
const SORT_KEY_TO_COLUMN_ID: Record<ScreenerSortKey, string> = {
  name: "token",
  price: "price",
  marketCap: "marketCap",
  volume: "volume",
  change: "dailyPerformance",
};

const COLUMN_ID_TO_SORT_KEY: Record<string, ScreenerSortKey> = {
  token: "name",
  price: "price",
  marketCap: "marketCap",
  volume: "volume",
  dailyPerformance: "change",
};

function ScreenerPageViewInner() {
  const { dsl, sort, setSort, clearAll, results, interpret } =
    useScreenerContext();

  useEffect(() => {
    const preloadTableSection = () => {
      void loadScreenerTableSection();
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadTableSection);
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timeoutId = setTimeout(preloadTableSection, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  // ONE sort system: TanStack's sorting state is DERIVED from the URL sort
  // param (explicit header click) or the DSL's own sort; header clicks write
  // back to the URL. In screen mode the sort is also merged into the executed
  // DSL server-side (see use-screener-results) — correct under limit truncation.
  const sorting = useMemo((): SortingState => {
    if (sort) return [{ id: SORT_KEY_TO_COLUMN_ID[sort.key], desc: sort.desc }];
    if (dsl?.sort) {
      const key = METRIC_ID_TO_SORT_KEY[dsl.sort.metricId];
      if (key)
        return [
          { id: SORT_KEY_TO_COLUMN_ID[key], desc: dsl.sort.order === "desc" },
        ];
      return []; // DSL sorts by a non-column metric; server order stands.
    }
    if (dsl) return []; // server order (rank-ascending scan) stands.
    return [{ id: "marketCap", desc: true }];
  }, [sort, dsl]);

  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      if (!first) {
        setSort(null);
        return;
      }
      const key = COLUMN_ID_TO_SORT_KEY[first.id];
      if (!key) return;
      const nextSort: ScreenerSort = { key, desc: first.desc };
      setSort(nextSort);
    },
    [sorting, setSort],
  );

  const tableStatus = useMemo((): ScreenerTableStatus | null => {
    if (interpret.status === "interpreting") {
      return { kind: "interpreting", text: "Interpreting…" };
    }
    return null;
  }, [interpret.status]);

  const tokenHeaderCountBadge = useMemo(() => {
    if (results.source === "browse") return null;
    return { count: results.coins.length };
  }, [results.source, results.coins.length]);

  const emptyDetail = useMemo(() => {
    if (results.source !== "screen") return null;
    if (results.screenUserMessage) return results.screenUserMessage;
    const coverage = results.coverage;
    if (coverage)
      return `0 of ${coverage.scanned} scanned matched your filters.`;
    return null;
  }, [results.source, results.screenUserMessage, results.coverage]);

  return (
    <div className="w-full space-y-2 px-3 sm:px-4 lg:px-8">
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex-1 min-w-0">
          <ScreenerFiltersBar />
        </div>
        <div className="flex items-center gap-2">
          <LazyScreenerAutoRefreshIndicator
            status={{
              lastUpdatedAtMs: results.lastUpdatedAtMs,
              isRefreshing: results.isFetching,
            }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {results.error ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3">
            <p className="text-sm text-rose-400">
              {results.source === "screen"
                ? "Couldn’t run this screen."
                : results.source === "search"
                  ? "Search failed."
                  : "Couldn’t load market data."}{" "}
              <span className="text-muted-foreground">
                ({results.error.message})
              </span>
            </p>
            <Button variant="outline" size="sm" onClick={results.refetch}>
              Retry
            </Button>
          </div>
        ) : null}

        {results.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : results.coins.length === 0 && results.source === "browse" ? (
          <LazyScreenerEmptyState type="no-coins" onRetry={results.refetch} />
        ) : results.coins.length === 0 ? (
          <LazyScreenerEmptyState
            type="no-filtered-coins"
            onClearFilters={clearAll}
            detail={emptyDetail}
          />
        ) : (
          <LazyScreenerTableSection
            coins={results.coins}
            sorting={sorting}
            onSortingChange={onSortingChange}
            status={tableStatus}
            tokenHeaderCountBadge={tokenHeaderCountBadge}
          />
        )}
      </div>
    </div>
  );
}

export function ScreenerPageView() {
  return (
    // Suspense: nuqs reads useSearchParams(), which requires a boundary
    // during static rendering in the app router.
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-8">
          <Spinner size={24} />
        </div>
      }
    >
      <ScreenerProvider>
        <ScreenerPageViewInner />
      </ScreenerProvider>
    </Suspense>
  );
}
