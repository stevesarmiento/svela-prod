"use client";

import type { CoinMarketData } from "@/types/coins";
import { type Table, flexRender } from "@tanstack/react-table";
import { cn } from "@v1/ui/cn";
import { SCREENER_TABLE_GRID_TEMPLATE_COLUMNS } from "./screener-table-layout";

interface ScreenerTableHeaderProps {
  table: Table<CoinMarketData>;
}

export function ScreenerTableHeader({ table }: ScreenerTableHeaderProps) {
  return (
    <div className="px-4 py-1">
      <div className="text-[10px] font-semibold text-muted-foreground tracking-wide">
        {table.getHeaderGroups().map((headerGroup) => (
          <div
            key={headerGroup.id}
            className="grid gap-4"
            style={{
              gridTemplateColumns: SCREENER_TABLE_GRID_TEMPLATE_COLUMNS,
            }}
          >
            {headerGroup.headers.map((header) => {
              const align = header.column.columnDef.meta?.align ?? "right";
              const canSort = header.column.getCanSort();
              const onClick = canSort
                ? header.column.getToggleSortingHandler()
                : undefined;
              const className = cn(
                "flex w-full min-w-0 items-center gap-1",
                align === "left" ? "justify-start" : "justify-end",
                canSort
                  ? "cursor-pointer select-none hover:text-foreground"
                  : "",
              );

              const content = (
                <>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {{
                    asc: " ↑",
                    desc: " ↓",
                  }[header.column.getIsSorted() as string] ?? null}
                </>
              );

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
                );
              }

              return (
                <div key={header.id} className={className}>
                  {content}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
