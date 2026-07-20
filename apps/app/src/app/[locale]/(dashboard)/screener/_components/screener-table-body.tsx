"use client";

import type { CoinMarketData } from "@/types/coins";
import type { Table } from "@tanstack/react-table";
import { cn } from "@v1/ui/cn";
import { TextShimmerWave } from "@v1/ui/text-shimmer";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScreenerTableHeader } from "./screener-table-header";
import { SCREENER_TABLE_MIN_WIDTH } from "./screener-table-layout";
import { ScreenerTableRow } from "./screener-table-row";
import type { ScreenerTableStatus } from "./screener-table-types";

const SCREENER_INITIAL_ROW_COUNT = 24;
const SCREENER_APPEND_ROW_COUNT = 24;

export function ScreenerTableBody({
  table,
  status = null,
  selectedCoins,
  hasSelectedCoins,
  onCoinSelect,
}: {
  table: Table<CoinMarketData>;
  status?: ScreenerTableStatus | null;
  selectedCoins: Set<string>;
  hasSelectedCoins: boolean;
  onCoinSelect: (coinId: string, selected: boolean) => void;
}) {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const rows = table.getRowModel().rows;
  const rowCount = rows.length;
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(SCREENER_INITIAL_ROW_COUNT, rowCount),
  );

  useEffect(() => {
    setVisibleCount(Math.min(SCREENER_INITIAL_ROW_COUNT, rowCount));
  }, [rowCount]);

  const visibleRows = useMemo(() => {
    return rows.slice(0, visibleCount);
  }, [rows, visibleCount]);

  const hasMore = visibleCount < rowCount;
  const bodyClassName = cn(
    "relative bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm max-h-[62dvh] overflow-y-auto",
  );

  useEffect(() => {
    if (!hasMore) return;
    const root = scrollRootRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisibleCount((prev) =>
          Math.min(rowCount, prev + SCREENER_APPEND_ROW_COUNT),
        );
      },
      { root, rootMargin: "240px", threshold: 0.01 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, rowCount]);

  return (
    <div className="rounded-[10px] bg-primary/5 p-0.5">
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="w-full" style={{ minWidth: SCREENER_TABLE_MIN_WIDTH }}>
          <div className="mx-px">
            <ScreenerTableHeader table={table} />
          </div>

          <div ref={scrollRootRef} className={bodyClassName}>
            {visibleRows.map((row) => (
              <ScreenerTableRow
                key={row.id}
                row={row}
                isSelected={selectedCoins.has(String(row.original.id))}
                hasSelectedCoins={hasSelectedCoins}
                onCoinSelect={onCoinSelect}
              />
            ))}

            {hasMore ? (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-3"
              >
                <div className="text-xs text-muted-foreground">
                  Loading more…
                </div>
              </div>
            ) : null}

            {status ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/75 dark:bg-black/50 border-transparent border backdrop-blur-sm">
                <TextShimmerWave
                  as="span"
                  className="max-w-md px-4 text-center text-sm text-pretty"
                  duration={1.2}
                >
                  {status.text}
                </TextShimmerWave>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
