'use client'

import { flexRender, type Table } from '@tanstack/react-table'
import { cn } from "@v1/ui/cn"
import type { CoinMarketData } from '@/types/coins'

interface WatchlistTableHeaderProps {
  table: Table<CoinMarketData>;
}

export function WatchlistTableHeader({ table }: WatchlistTableHeaderProps) {
  return (
    <div className="px-3 py-1">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {table.getHeaderGroups().map(headerGroup => (
          <div key={headerGroup.id} className="grid grid-cols-5 gap-4">
            {headerGroup.headers.slice(0, 1).map(header => ( // Show first header (select/token merged)
              <div 
                key={header.id}
                className="flex items-center gap-2 cursor-pointer select-none hover:text-foreground"
                onClick={() => table.getColumn('token-sort')?.toggleSorting()} // Sort by token
              >
                <span>Token</span>
                {{
                  asc: ' ↑',
                  desc: ' ↓',
                }[table.getColumn('token-sort')?.getIsSorted() as string] ?? null}
              </div>
            ))}
            {headerGroup.headers.slice(2).map(header => ( // Skip the hidden token-sort column
              <div 
                key={header.id}
                className={cn(
                  "flex items-center gap-1",
                  header.column.getCanSort() ? "cursor-pointer select-none hover:text-foreground" : "",
                  header.id === 'actions' ? "justify-end" : "justify-start"
                )}
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {{
                  asc: ' ↑',
                  desc: ' ↓',
                }[header.column.getIsSorted() as string] ?? null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
