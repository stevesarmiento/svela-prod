"use client";

import type { CoinMarketData } from "@/types/coins";
import {
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import type React from "react";
import { createScreenerColumns } from "./screener-columns";
import { ScreenerTableBody } from "./screener-table-body";
import type {
  ScreenerTableMeta,
  ScreenerTableStatus,
} from "./screener-table-types";

export function ScreenerTableSection({
  coins,
  sorting,
  onSortingChange,
  status = null,
  tokenHeaderCountBadge = null,
}: {
  coins: Array<CoinMarketData>;
  sorting: SortingState;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  status?: ScreenerTableStatus | null;
  tokenHeaderCountBadge?: { count: number } | null;
}) {
  const columns = useMemo(() => createScreenerColumns(), []);
  const meta = useMemo<ScreenerTableMeta>(
    () => ({ tokenHeaderCountBadge }),
    [tokenHeaderCountBadge],
  );

  const table = useReactTable({
    data: coins,
    columns,
    meta,
    getRowId: (row) => row.id.toString(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange,
    state: { sorting },
  });

  return <ScreenerTableBody table={table} status={status} />;
}
