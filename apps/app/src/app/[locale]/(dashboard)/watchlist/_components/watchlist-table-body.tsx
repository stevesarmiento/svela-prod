'use client'

import type { Table } from '@tanstack/react-table'
import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@v1/ui/cn"
import { TextShimmerWave } from "@v1/ui/text-shimmer"
import { WatchlistTableHeader } from './watchlist-table-header'
import { WatchlistTableRow } from './watchlist-table-row'
import type { CoinMarketData } from '@/types/coins'
import type { WatchlistTableStatus } from "./watchlist-table-section"

interface WatchlistTableBodyProps {
  table: Table<CoinMarketData>;
  selectedCoins: Set<string>;
  watchlistGroup: string | null;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  mode?: "watchlist" | "screener";
  status?: WatchlistTableStatus | null;
  tokenHeaderCountBadge?: { count: number } | null;
}

export function WatchlistTableBody({ 
  table, 
  selectedCoins, 
  watchlistGroup, 
  onCoinSelect,
  mode = "watchlist",
  status = null,
  tokenHeaderCountBadge = null,
}: WatchlistTableBodyProps) {
  const SCREENER_PAGE_SIZE = 50
  const enablePagination = mode === "screener"
  const scrollRootRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const rows = table.getRowModel().rows
  const rowCount = rows.length

  const [visibleCount, setVisibleCount] = useState(() =>
    enablePagination ? Math.min(SCREENER_PAGE_SIZE, rowCount) : rowCount,
  )

  useEffect(() => {
    setVisibleCount(enablePagination ? Math.min(SCREENER_PAGE_SIZE, rowCount) : rowCount)
  }, [enablePagination, rowCount])

  const visibleRows = useMemo(() => {
    if (!enablePagination) return rows
    return rows.slice(0, visibleCount)
  }, [enablePagination, rows, visibleCount])

  const hasMore = enablePagination && visibleCount < rowCount
  const bodyClassName = cn(
    "relative bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm",
    enablePagination && "max-h-[62dvh] overflow-y-auto",
  )

  useEffect(() => {
    if (!hasMore) return
    const root = scrollRootRef.current
    const target = sentinelRef.current
    if (!root || !target) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        setVisibleCount((prev) => Math.min(rowCount, prev + SCREENER_PAGE_SIZE))
      },
      { root, rootMargin: "240px", threshold: 0.01 },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, rowCount])

  return (
    <div className="rounded-[10px] bg-primary/5 p-0.5">
      {/* Header: keep the original "on tinted background" styling,
          but inset by 1px so grid tracks match the bordered body. */}
      <div className="mx-px">
        <WatchlistTableHeader
          table={table}
          tokenHeaderCountBadge={tokenHeaderCountBadge}
        />
      </div>

      {/* Table Body */}
      <div
        ref={scrollRootRef}
        className={bodyClassName}
      >
        {visibleRows.map(row => (
          <WatchlistTableRow
            key={row.id}
            row={row}
            selectedCoins={selectedCoins}
            watchlistGroup={watchlistGroup}
            onCoinSelect={onCoinSelect}
            mode={mode}
          />
        ))}

        {hasMore ? (
          <div ref={sentinelRef} className="flex items-center justify-center py-3">
            <div className="text-xs text-muted-foreground">Loading more…</div>
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
  );
}
