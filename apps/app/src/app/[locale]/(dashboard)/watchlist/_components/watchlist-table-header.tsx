'use client'

import { flexRender, type Table } from '@tanstack/react-table'
import { Badge } from "@v1/ui/badge"
import { cn } from "@v1/ui/cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"
import type { CoinMarketData } from '@/types/coins'
import { WATCHLIST_TABLE_GRID_TEMPLATE_COLUMNS } from "./watchlist-table-layout"

interface WatchlistTableHeaderProps {
  table: Table<CoinMarketData>;
  tokenHeaderCountBadge?: { count: number } | null;
}

export function WatchlistTableHeader({
  table,
  tokenHeaderCountBadge = null,
}: WatchlistTableHeaderProps) {
  return (
    <div className="px-4 py-1">
      <div className="text-[10px] font-semibold text-muted-foreground tracking-wide">
        {table.getHeaderGroups().map(headerGroup => (
          <div
            key={headerGroup.id}
            className="grid gap-4"
            style={{ gridTemplateColumns: WATCHLIST_TABLE_GRID_TEMPLATE_COLUMNS }}
          >
            {headerGroup.headers.slice(0, 1).map(header => ( // Show first header (select/token merged)
              <Tooltip key={header.id} delayDuration={500}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center justify-start gap-2 cursor-pointer select-none hover:text-foreground"
                    onClick={() => table.getColumn('token-sort')?.toggleSorting()} // Sort by token
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span>Token</span>
                      {tokenHeaderCountBadge ? (
                        <Badge
                          variant="secondary"
                          className="h-4 shrink-0 rounded-md px-1.5 py-0 text-[10px] font-medium tabular-nums leading-none bg-primary/10 text-primary/80 border-0"
                        >
                          {tokenHeaderCountBadge.count}
                        </Badge>
                      ) : null}
                    </span>
                    {{
                      asc: ' ↑',
                      desc: ' ↓',
                    }[table.getColumn('token-sort')?.getIsSorted() as string] ?? null}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="!rounded-md !p-2 max-w-xs text-pretty text-xs font-normal normal-case tracking-normal"
                >
                  Ticker and full name appear in each row. Click to sort alphabetically by asset name.
                </TooltipContent>
              </Tooltip>
            ))}
            {headerGroup.headers.slice(2).map(header => { // Skip the hidden token-sort column
              const canSort = header.column.getCanSort()
              const onClick = canSort ? header.column.getToggleSortingHandler() : undefined
              const className = cn(
                "flex w-full min-w-0 items-center justify-end gap-1",
                canSort ? "cursor-pointer select-none hover:text-foreground" : "",
                header.column.id === "actions" && "whitespace-nowrap",
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
