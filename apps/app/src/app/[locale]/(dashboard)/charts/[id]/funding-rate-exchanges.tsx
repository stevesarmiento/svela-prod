'use client'

import React, { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"
import { useFundingRateExchanges } from '@/hooks/use-funding-rate-exchange'
import { TrendingDown, TrendingUp, Clock, Building2 } from 'lucide-react'
import { cn } from "@v1/ui/cn"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table'

interface FundingRateExchangesProps {
  coinId: string
  className?: string
}

interface FlatFundingRate {
  exchange: string
  fundingRate: number
  fundingRateInterval: number
  nextFundingTime: number
  marginType: 'stablecoin' | 'token'
}

const createColumns = (): ColumnDef<FlatFundingRate>[] => [
  {
    id: 'exchange',
    accessorKey: 'exchange',
    header: () => (
      <div className="text-left flex items-center gap-1">
        <Building2 className="h-3 w-3" />
        Exchange
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="font-medium">{row.original.exchange}</div>
        <div className={cn(
          "px-1.5 py-0.5 rounded text-xs font-diatype-mono",
          row.original.marginType === 'stablecoin' 
            ? "bg-blue-500/10 text-blue-400"
            : "bg-orange-500/10 text-orange-400"
        )}>
          {row.original.marginType === 'stablecoin' ? 'USDT' : 'Coin'}
        </div>
      </div>
    ),
    enableSorting: true,
  },
  {
    id: 'fundingRate',
    accessorKey: 'fundingRate',
    header: () => (
      <div className="text-right flex items-center justify-end gap-1">
        Rate
      </div>
    ),
    cell: ({ row }) => {
      const rate = row.original.fundingRate
      const percentage = (rate * 100).toFixed(4)
      
      return (
        <div className="text-right">
          <div className={cn(
            "font-diatype-mono text-sm font-medium",
            rate > 0 ? 'text-green-500' : rate < 0 ? 'text-red-500' : 'text-muted-foreground'
          )}>
            {rate > 0 ? '+' : ''}{percentage}%
          </div>
        </div>
      )
    },
    enableSorting: true,
  },
  {
    id: 'interval',
    accessorKey: 'fundingRateInterval',
    header: () => (
      <div className="text-center flex items-center justify-center gap-1">
        <Clock className="h-3 w-3" />
        Interval
      </div>
    ),
    cell: ({ row }) => (
      <div className="text-center font-diatype-mono text-sm">
        {row.original.fundingRateInterval}h
      </div>
    ),
    enableSorting: true,
  },
  {
    id: 'nextFunding',
    accessorKey: 'nextFundingTime',
    header: () => (
      <div className="text-right flex items-center justify-end gap-1">
        Next Funding
      </div>
    ),
    cell: ({ row }) => {
      const nextTime = new Date(row.original.nextFundingTime)
      const now = new Date()
      const timeDiff = nextTime.getTime() - now.getTime()
      const hoursRemaining = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60)))
      const minutesRemaining = Math.max(0, Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60)))
      
      return (
        <div className="text-right">
          <div className="font-diatype-mono text-xs text-muted-foreground">
            {nextTime.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            })}
          </div>
          <div className="font-diatype-mono text-xs">
            {timeDiff > 0 ? `${hoursRemaining}h ${minutesRemaining}m` : 'Now'}
          </div>
        </div>
      )
    },
    enableSorting: true,
  },
]

export function FundingRateExchanges({ coinId, className }: FundingRateExchangesProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'fundingRate', desc: true } // Default sort by highest rates
  ])
  
  const { data, isLoading, error } = useFundingRateExchanges({
    symbol: coinId,
  })

  // Flatten data for table
  const tableData = useMemo(() => {
    if (!data?.data?.length) return []
    
    const flattened: FlatFundingRate[] = []
    
    data.data.forEach(coinData => {
      // Add stablecoin margin rates
      coinData.stablecoinMarginList.forEach(rate => {
        flattened.push({
          ...rate,
          marginType: 'stablecoin'
        })
      })
      
      // Add token margin rates
      coinData.tokenMarginList.forEach(rate => {
        flattened.push({
          ...rate,
          marginType: 'token'
        })
      })
    })
    
    return flattened
  }, [data])

  // Calculate stats
  const stats = useMemo(() => {
    if (!tableData.length) return { avgRate: 0, highestRate: 0, lowestRate: 0, totalExchanges: 0 }
    
    const rates = tableData.map(item => item.fundingRate)
    const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length
    const highestRate = Math.max(...rates)
    const lowestRate = Math.min(...rates)
    const totalExchanges = new Set(tableData.map(item => item.exchange)).size
    
    return { avgRate, highestRate, lowestRate, totalExchanges }
  }, [tableData])

  const columns = useMemo(() => createColumns(), [])

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  })

  if (isLoading) {
    return (
      <div className={cn("border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]", className)}>
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader className="p-6 pt-4 pr-5">
              <CardTitle>
                <Skeleton className="h-5 w-48" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pl-8">
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !data?.success) {
    return (
      <div className={cn("border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]", className)}>
        <Card className="border-none bg-transparent">
          <CardHeader>
            <CardTitle className="text-destructive">Failed to load funding rate data</CardTitle>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className={cn("border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]", className)}>
      <div className="p-0 relative">
        <div
          className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />
        <Card className="border-none bg-transparent">
          <CardHeader className="p-6 pt-4 pr-5">
            <CardTitle className="flex flex-col items-left">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg font-diatype-mono">
                  Funding Rates - {data.coinInfo?.name || data.symbol}
                </span>
              </div>
              
              {/* Stats */}
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3 w-3 text-blue-500" />
                  <span className="font-medium">{stats.totalExchanges}</span>
                  <span className="text-muted-foreground">Exchanges</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span className="font-medium font-diatype-mono">
                    {(stats.highestRate * 100).toFixed(4)}%
                  </span>
                  <span className="text-muted-foreground">Highest</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  <span className="font-medium font-diatype-mono">
                    {(stats.lowestRate * 100).toFixed(4)}%
                  </span>
                  <span className="text-muted-foreground">Lowest</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium font-diatype-mono">
                    {(stats.avgRate * 100).toFixed(4)}%
                  </span>
                  <span className="text-muted-foreground">Average</span>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          
          <CardContent className="pl-8">
            <div className="space-y-4">
              {/* Table Header */}
              <div className="px-3 py-1">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {table.getHeaderGroups().map(headerGroup => (
                    <div key={headerGroup.id} className="grid grid-cols-4 gap-4">
                      {headerGroup.headers.map(header => (
                        <div 
                          key={header.id}
                          className={cn(
                            "flex items-center gap-1",
                            header.column.getCanSort() ? "cursor-pointer select-none hover:text-foreground" : "",
                            header.id === 'fundingRate' || header.id === 'nextFunding' ? "justify-end" : 
                            header.id === 'interval' ? "justify-center" : "justify-start"
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

              {/* Table Body */}
              <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
                {table.getRowModel().rows.map(row => (
                  <div 
                    key={row.id}
                    className="grid grid-cols-4 gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-primary/[0.02] transition-colors"
                  >
                    {row.getVisibleCells().map(cell => (
                      <div 
                        key={cell.id}
                        className={cn(
                          "flex items-center",
                          cell.column.id === 'fundingRate' || cell.column.id === 'nextFunding' ? "justify-end" :
                          cell.column.id === 'interval' ? "justify-center" : "justify-start"
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}