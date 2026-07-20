"use client";

import type { CoinMarketData } from "@/types/coins";
import { type Row, flexRender } from "@tanstack/react-table";
import { Checkbox } from "@v1/ui/checkbox";
import { cn } from "@v1/ui/cn";
import { motion } from "motion/react";
import Link from "next/link";
import { memo } from "react";
import {
  SELECT_CELL_VARIANTS,
  SELECT_CHECKBOX_VARIANTS,
  SELECT_CONTENT_VARIANTS,
  useSelectRevealTransition,
} from "@/hooks/use-watchlist-selection";
import { SCREENER_TABLE_GRID_TEMPLATE_COLUMNS } from "./screener-table-layout";

function ScreenerTableRowInner({
  row,
  isSelected,
  hasSelectedCoins,
  onCoinSelect,
}: {
  row: Row<CoinMarketData>;
  isSelected: boolean;
  hasSelectedCoins: boolean;
  onCoinSelect: (coinId: string, selected: boolean) => void;
}) {
  const price = row.original.quote.USD.price;
  const isLoadingRow = price == null || price <= 0;
  const coinId = String(row.original.id);
  const selectRevealTransition = useSelectRevealTransition();

  const className = cn(
    "grid gap-4 px-4 py-2.5 border-b last:border-b-0 hover:ring-2 hover:ring-inset hover:ring-white/20 hover:rounded-[7px] transition-opacity duration-200",
    isLoadingRow ? "cursor-default" : "hover:bg-primary/[0.02] cursor-pointer",
    hasSelectedCoins && !isSelected && "opacity-40",
  );

  const content = row.getVisibleCells().map((cell, cellIndex) => {
    const meta = cell.column.columnDef.meta;
    const align = meta?.align ?? "right";
    const cellClassName = cn(
      "flex min-w-0 items-center",
      align === "left" ? "justify-start" : "justify-end",
      meta?.interactive && "min-w-[72px] flex-nowrap whitespace-nowrap",
    );

    // First cell — merged select + token: hover reveals the checkbox, click
    // toggles selection (same implementation as the watchlist/chart tables).
    if (cellIndex === 0 && !isLoadingRow) {
      return (
        <div
          key={cell.id}
          className={cellClassName}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.preventDefault(); // Always prevent navigation for first cell (selection mode)
            event.stopPropagation();

            // Let the checkbox handle its own toggling (avoid double-toggle).
            const target = event.target as HTMLElement;
            if (target.closest('[data-screener-row-checkbox="true"]')) return;

            onCoinSelect(coinId, !isSelected);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onCoinSelect(coinId, !isSelected);
          }}
        >
          <motion.div
            className="relative flex h-full w-full min-w-0 items-center justify-start"
            variants={SELECT_CELL_VARIANTS}
            initial="rest"
            animate={hasSelectedCoins ? "revealed" : "rest"}
            whileHover={hasSelectedCoins ? undefined : "revealed"}
          >
            {/* Checkbox - stable DOM to avoid "jump" on select/deselect */}
            <motion.div
              className="absolute left-0 z-10 px-1"
              variants={SELECT_CHECKBOX_VARIANTS}
              transition={selectRevealTransition}
            >
              <Checkbox
                data-screener-row-checkbox="true"
                checked={isSelected}
                tabIndex={hasSelectedCoins ? 0 : -1}
                onCheckedChange={(checked) =>
                  onCoinSelect(coinId, checked === true)
                }
                aria-label={`Select ${row.original.name}`}
              />
            </motion.div>

            {/* Token content slides right to make room for the checkbox */}
            <motion.div
              className="flex min-w-0 items-center"
              variants={SELECT_CONTENT_VARIANTS}
              transition={selectRevealTransition}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </motion.div>
          </motion.div>
        </div>
      );
    }

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
    <Link
      key={row.id}
      href={`/watchlists/${row.original.id}`}
      aria-selected={hasSelectedCoins ? isSelected : undefined}
      onClick={
        hasSelectedCoins
          ? (event) => {
              event.preventDefault();
              onCoinSelect(coinId, !isSelected);
            }
          : undefined
      }
    >
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
// visible rows (each containing lazy inline chart cells). Selection state
// (boolean per row) is compared too; onCoinSelect is identity-stable.
export const ScreenerTableRow = memo(
  ScreenerTableRowInner,
  (prev, next) =>
    prev.row.id === next.row.id &&
    prev.row.original === next.row.original &&
    prev.isSelected === next.isSelected &&
    prev.hasSelectedCoins === next.hasSelectedCoins &&
    prev.onCoinSelect === next.onCoinSelect,
);
