'use client'

import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
} from '@tanstack/react-table'
import type React from 'react'
import type { CoinMarketData } from "@/types/coins"
import { ScreenerTableBody } from "./screener-table-body"
import { createScreenerColumns } from "./screener-columns"
import type { ScreenerTableStatus } from "./screener-table-types"

export function ScreenerTableSection({
  coins,
  sorting,
  onSortingChange,
  status = null,
  tokenHeaderCountBadge = null,
}: {
  coins: Array<CoinMarketData>
  sorting: SortingState
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>
  status?: ScreenerTableStatus | null
  tokenHeaderCountBadge?: { count: number } | null
}) {
  const columns = useMemo(() => createScreenerColumns(), [])

  const table = useReactTable({
    data: coins,
    columns,
    getRowId: (row) => row.id.toString(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange,
    state: { sorting },
  })

  return (
    <ScreenerTableBody
      table={table}
      status={status}
      tokenHeaderCountBadge={tokenHeaderCountBadge}
    />
  )
}
