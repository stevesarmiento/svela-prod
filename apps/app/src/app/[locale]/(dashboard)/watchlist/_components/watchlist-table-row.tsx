'use client'

import { flexRender, type Row } from '@tanstack/react-table'
import Link from "next/link"
import { cn } from "@v1/ui/cn"
import type { CoinMarketData } from '@/types/coins'
import { WATCHLIST_TABLE_GRID_TEMPLATE_COLUMNS } from "./watchlist-table-layout"

interface WatchlistTableRowProps {
  row: Row<CoinMarketData>;
  selectedCoins: Set<string>;
  watchlistGroup: string | null;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  mode?: "watchlist" | "screener";
}

export function WatchlistTableRow({ 
  row, 
  selectedCoins, 
  watchlistGroup, 
  onCoinSelect,
  mode = "watchlist",
}: WatchlistTableRowProps) {
  const isLoadingRow = row.original.quote.USD.price <= 0
  const isSelected = selectedCoins.has(row.original.id.toString());
  const hasAnySelections = selectedCoins.size > 0;
  const enableSelection = mode === "watchlist"
  
  const className = cn(
    "grid gap-4 px-4 py-2.5 border-b last:border-b-0 hover:ring-2 hover:ring-white/20 hover:rounded-[7px] transition-opacity duration-200",
    isLoadingRow ? "cursor-default" : "hover:bg-primary/[0.02] cursor-pointer",
    hasAnySelections ? (isSelected ? "opacity-100" : "opacity-40") : "opacity-100",
  )

  const content = (
    <>
      {/* First cell - merged select + token with specific hover */}
      <div
        className="flex min-w-0 items-center"
        role={enableSelection ? "button" : undefined}
        tabIndex={enableSelection ? (isLoadingRow ? -1 : 0) : undefined}
        onClick={
          enableSelection
            ? (e) => {
                if (isLoadingRow) return
                e.preventDefault() // Always prevent navigation for first cell (selection mode)
                e.stopPropagation()

                // Let the checkbox handle its own toggling (avoid double-toggle).
                const target = e.target as HTMLElement
                if (target.closest('[data-watchlist-row-checkbox="true"]')) return

                const isCurrentlySelected = selectedCoins.has(row.original.id.toString())
                onCoinSelect(row.original.id.toString(), !isCurrentlySelected)
              }
            : undefined
        }
        onKeyDown={
          enableSelection
            ? (e) => {
                if (isLoadingRow) return
                if (e.key !== "Enter" && e.key !== " ") return
                e.preventDefault()
                e.stopPropagation()

                const isCurrentlySelected = selectedCoins.has(row.original.id.toString())
                onCoinSelect(row.original.id.toString(), !isCurrentlySelected)
              }
            : undefined
        }
      >
        {(() => {
          const firstCell = row.getVisibleCells()[0];
          return firstCell && flexRender(firstCell.column.columnDef.cell, firstCell.getContext());
        })()}
      </div>

      {/* Rest of the cells (skip the hidden token-sort column and removed market cap) */}
      {row.getVisibleCells().slice(2, -1).map(cell => ( // Exclude last cell (actions)
        <div
          key={cell.id}
          className="flex min-w-0 items-center justify-end"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}

      {/* Actions cell - prevent navigation */}
      <div
        className="flex min-w-[72px] items-center justify-end flex-nowrap whitespace-nowrap"
        onClick={(e) => {
          if (isLoadingRow) return
          e.preventDefault();
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (isLoadingRow) return
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {(() => {
          const lastCell = row.getVisibleCells()[row.getVisibleCells().length - 1];
          return lastCell && flexRender(lastCell.column.columnDef.cell, lastCell.getContext());
        })()}
      </div>
    </>
  )

  if (isLoadingRow) {
    return (
      <div
        key={row.id}
        className={className}
        style={{ gridTemplateColumns: WATCHLIST_TABLE_GRID_TEMPLATE_COLUMNS }}
      >
        {content}
      </div>
    )
  }

  return (
    <Link
      key={row.id}
      href={watchlistGroup ? `/charts/${row.original.id}?wg=${watchlistGroup}` : `/charts/${row.original.id}`}
      className={className}
      style={{ gridTemplateColumns: WATCHLIST_TABLE_GRID_TEMPLATE_COLUMNS }}
    >
      {content}
    </Link>
  );
}
