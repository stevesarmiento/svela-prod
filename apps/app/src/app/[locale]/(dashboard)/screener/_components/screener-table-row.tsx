"use client";

import type { CoinMarketData } from "@/types/coins";
import { type Row, flexRender } from "@tanstack/react-table";
import { cn } from "@v1/ui/cn";
import Link from "next/link";
import { memo } from "react";
import { SCREENER_TABLE_GRID_TEMPLATE_COLUMNS } from "./screener-table-layout";

function ScreenerTableRowInner({ row }: { row: Row<CoinMarketData> }) {
  const price = row.original.quote.USD.price;
  const isLoadingRow = price == null || price <= 0;

  const className = cn(
    "grid gap-4 px-4 py-2.5 border-b last:border-b-0 hover:ring-2 hover:ring-inset hover:ring-white/20 hover:rounded-[7px] transition-opacity duration-200",
    isLoadingRow ? "cursor-default" : "hover:bg-primary/[0.02] cursor-pointer",
  );

  const content = row.getVisibleCells().map((cell) => {
    const meta = cell.column.columnDef.meta;
    const align = meta?.align ?? "right";
    const cellClassName = cn(
      "flex min-w-0 items-center",
      align === "left" ? "justify-start" : "justify-end",
      meta?.interactive && "min-w-[72px] flex-nowrap whitespace-nowrap",
    );

    // Interactive cells host their own controls: keep clicks/keys away from
    // the row link (previously hardcoded to "the last cell").
    if (meta?.interactive) {
      return (
        <div
          key={cell.id}
          className={cellClassName}
          onClick={(event) => {
            if (isLoadingRow) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (isLoadingRow) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      );
    }

    return (
      <div key={cell.id} className={cellClassName}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </div>
    );
  });

  if (isLoadingRow) {
    return (
      <div
        key={row.id}
        className={className}
        style={{ gridTemplateColumns: SCREENER_TABLE_GRID_TEMPLATE_COLUMNS }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link key={row.id} href={`/watchlists/${row.original.id}`}>
      <div
        className={className}
        style={{ gridTemplateColumns: SCREENER_TABLE_GRID_TEMPLATE_COLUMNS }}
      >
        {content}
      </div>
    </Link>
  );
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
);
