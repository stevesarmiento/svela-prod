'use client'

import { flexRender, type Row } from '@tanstack/react-table'
import Link from "next/link"
import { memo } from "react"
import { cn } from "@v1/ui/cn"
import type { CoinMarketData } from '@/types/coins'
import { SCREENER_TABLE_GRID_TEMPLATE_COLUMNS } from "./screener-table-layout"

function ScreenerTableRowInner({ row }: { row: Row<CoinMarketData> }) {
  const isLoadingRow = row.original.quote.USD.price <= 0

  const className = cn(
    "grid gap-4 px-4 py-2.5 border-b last:border-b-0 hover:ring-2 hover:ring-inset hover:ring-white/20 hover:rounded-[7px] transition-opacity duration-200",
    isLoadingRow ? "cursor-default" : "hover:bg-primary/[0.02] cursor-pointer",
  )

  const content = (
    <>
      <div className="flex min-w-0 items-center">
        {(() => {
          const firstCell = row.getVisibleCells()[0];
          return firstCell && flexRender(firstCell.column.columnDef.cell, firstCell.getContext());
        })()}
      </div>

      {row.getVisibleCells().slice(2, -1).map((cell) => (
        <div
          key={cell.id}
          className="flex min-w-0 items-center justify-end"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}

      <div
        className="flex min-w-[72px] items-center justify-end flex-nowrap whitespace-nowrap"
        onClick={(event) => {
          if (isLoadingRow) return
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (isLoadingRow) return
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          event.stopPropagation()
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
        style={{ gridTemplateColumns: SCREENER_TABLE_GRID_TEMPLATE_COLUMNS }}
      >
        {content}
      </div>
    )
  }

  return (
    <Link key={row.id} href={`/charts/${row.original.id}`}>
      <div
        className={className}
        style={{ gridTemplateColumns: SCREENER_TABLE_GRID_TEMPLATE_COLUMNS }}
      >
        {content}
      </div>
    </Link>
  )
}

// TanStack recreates Row wrappers whenever any table state changes, so a
// plain memo() on the `row` prop never bails out. The row's rendered output
// only depends on its underlying data object — compare that instead. This
// keeps search keystrokes / bulk-quote refetches from re-rendering all
// visible rows (each containing lazy inline chart cells).
export const ScreenerTableRow = memo(
  ScreenerTableRowInner,
  (prev, next) =>
    prev.row.id === next.row.id && prev.row.original === next.row.original,
)
