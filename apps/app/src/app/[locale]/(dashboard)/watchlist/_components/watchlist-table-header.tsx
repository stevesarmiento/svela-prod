'use client'

import { flexRender, type Table } from '@tanstack/react-table'
import { cn } from "@v1/ui/cn"
import type { CoinMarketData } from '@/types/coins'
import { WATCHLIST_TABLE_GRID_TEMPLATE_COLUMNS } from "./watchlist-table-layout"

interface WatchlistTableHeaderProps {
  table: Table<CoinMarketData>;
}

export function WatchlistTableHeader({ table }: WatchlistTableHeaderProps) {
  return (
    <div className="px-4 py-1">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {table.getHeaderGroups().map(headerGroup => (
          <div
            key={headerGroup.id}
            className="grid gap-4"
            style={{ gridTemplateColumns: WATCHLIST_TABLE_GRID_TEMPLATE_COLUMNS }}
          >
            {headerGroup.headers.slice(0, 1).map(header => ( // Show first header (select/token merged)
              <button
                type="button"
                key={header.id}
                className="flex min-w-0 items-center gap-2 cursor-pointer select-none hover:text-foreground"
                onClick={() => table.getColumn('token-sort')?.toggleSorting()} // Sort by token
              >
                <span>Token</span>
                {{
                  asc: ' ↑',
                  desc: ' ↓',
                }[table.getColumn('token-sort')?.getIsSorted() as string] ?? null}
              </button>
            ))}
            {headerGroup.headers.slice(2).map(header => { // Skip the hidden token-sort column
              const canSort = header.column.getCanSort()
              const onClick = canSort ? header.column.getToggleSortingHandler() : undefined
              const className = cn(
                "flex min-w-0 items-center gap-1",
                canSort ? "cursor-pointer select-none hover:text-foreground" : "",
                header.column.id === 'actions'
                  ? "justify-end whitespace-nowrap"
                  : "justify-start"
              )

              const content = (
                <>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{
                    asc: ' ↑',
                    desc: ' ↓',
                  }[header.column.getIsSorted() as string] ?? null}
                </>
              )

              if (canSort && onClick) {
                return (
                  <button
                    type="button"
                    key={header.id}
                    className={className}
                    onClick={onClick}
                  >
                    {content}
                  </button>
                )
              }

              return (
                <div key={header.id} className={className}>
                  {content}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
