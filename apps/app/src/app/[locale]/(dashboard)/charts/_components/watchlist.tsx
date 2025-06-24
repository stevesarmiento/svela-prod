'use client'

import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Button } from "@v1/ui/button"
import { X, Coins, TrendingUp, DollarSign, BarChart3, Percent } from "lucide-react"
import { useWatchlist } from "./watchlist-context"
import { useWatchlistCoins } from "@/hooks/use-watchlist-coins"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { CoinSearch } from "./coin-search"
import { toast } from "@v1/ui/use-toast"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table'
import { useState, useMemo, useCallback, memo } from 'react'

// Define the coin type for the table
interface WatchlistCoin {
  id: number;
  name: string;
  symbol: string;
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      market_cap: number;
      volume_24h: number;
    };
  };
  fundingRate: number | null;
}

// Memoize skeleton components
const WatchlistSkeleton = memo(({ rowCount = 3 }: { rowCount?: number }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <div>
        <h4 className="font-medium">Watchlist</h4>
        <p className="text-sm text-muted-foreground">Track your favorite cryptocurrencies</p>
      </div>
      <CoinSearch />
    </div>
    
    <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
      <div className="px-3 py-2">
        <div className="grid grid-cols-7 gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="text-left flex items-center gap-1"><Coins className="w-3 h-3" />Token</div>
          <div className="text-left flex items-center gap-1"><DollarSign className="w-3 h-3" />Price</div>
          <div className="text-left flex items-center gap-1"><TrendingUp className="w-3 h-3" />24h Change</div>
          <div className="text-left flex items-center gap-1"><BarChart3 className="w-3 h-3" />Volume 24h</div>
          <div className="text-left flex items-center gap-1"><BarChart3 className="w-3 h-3" />Market Cap</div>
          <div className="text-left flex items-center gap-1"><Percent className="w-3 h-3" />Funding Rate</div>
          <div className="text-right flex items-center justify-end gap-1"><X className="w-3 h-3" />Remove</div>
        </div>
      </div>
      <div className="bg-white dark:bg-primary/5 border border-border/50 rounded-lg shadow-sm overflow-hidden">
        {Array.from({ length: rowCount }).map((_, index) => (
          <WatchlistRowSkeleton key={index} isLast={index === rowCount - 1} />
        ))}
      </div>
    </div>
  </div>
));

WatchlistSkeleton.displayName = 'WatchlistSkeleton';

const WatchlistRowSkeleton = memo(({ isLast }: { isLast: boolean }) => (
  <div className={`grid grid-cols-7 gap-4 px-4 py-3 ${!isLast ? 'border-b' : ''}`}>
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-6 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
    <div className="flex items-center"><Skeleton className="h-4 w-16" /></div>
    <div className="flex items-center"><Skeleton className="h-4 w-12" /></div>
    <div className="flex items-center"><Skeleton className="h-4 w-16" /></div>
    <div className="flex items-center"><Skeleton className="h-4 w-16" /></div>
    <div className="flex items-center"><Skeleton className="h-4 w-14" /></div>
    <div className="flex items-center justify-end"><Skeleton className="h-8 w-8 rounded" /></div>
  </div>
));

WatchlistRowSkeleton.displayName = 'WatchlistRowSkeleton';

// Move columns outside component to prevent recreation
const createColumns = (handleRemove: (coinId: number) => void): ColumnDef<WatchlistCoin>[] => [
  {
    id: 'token',
    accessorKey: 'name',
    header: () => (
      <div className="text-left flex items-center gap-1">
        <Coins className="w-3 h-3" />
        Token
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Link 
          href={`/charts/${row.original.id}`}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Image
            src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${row.original.id}.png`}
            alt={row.original.name}
            className="w-6 h-6 rounded-full"
            width={24}
            height={24}
          />
          <div>
            <div className="font-semibold text-sm">{row.original.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{row.original.symbol.toUpperCase()}</div>
          </div>
        </Link>
      </div>
    ),
    enableSorting: true,
  },
  {
    id: 'price',
    accessorKey: 'quote.USD.price',
    header: () => (
      <div className="text-left flex items-center gap-1">
        <DollarSign className="w-3 h-3" />
        Price
      </div>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {row.original.quote.USD.price > 0 ? (
          `$${row.original.quote.USD.price.toLocaleString()}`
        ) : (
          <Skeleton className="h-4 w-16" />
        )}
      </span>
    ),
    enableSorting: true,
  },
  {
    id: 'change24h',
    accessorKey: 'quote.USD.percent_change_24h',
    header: () => (
      <div className="text-left flex items-center gap-1">
        <TrendingUp className="w-3 h-3" />
        24h Change
      </div>
    ),
    cell: ({ row }) => (
      row.original.quote.USD.price > 0 ? (
        <span className={cn(
          "font-mono text-sm",
          row.original.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600'
        )}>
          {row.original.quote.USD.percent_change_24h.toFixed(2)}%
        </span>
      ) : (
        <Skeleton className="h-4 w-12" />
      )
    ),
    enableSorting: true,
  },
  {
    id: 'volume',
    accessorKey: 'quote.USD.volume_24h',
    header: () => (
      <div className="text-left flex items-center gap-1">
        <BarChart3 className="w-3 h-3" />
        Volume 24h
      </div>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {row.original.quote.USD.price === 0 ? (
          <Skeleton className="h-4 w-16" />
        ) : (
          `$${formatLargeNumber(row.original.quote.USD.volume_24h || 0)}`
        )}
      </span>
    ),
    enableSorting: true,
  },
  {
    id: 'marketCap',
    accessorKey: 'quote.USD.market_cap',
    header: () => (
      <div className="text-left flex items-center gap-1">
        <BarChart3 className="w-3 h-3" />
        Market Cap
      </div>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {row.original.quote.USD.price === 0 ? (
          <Skeleton className="h-4 w-16" />
        ) : (
          `$${formatLargeNumber(row.original.quote.USD.market_cap || 0)}`
        )}
      </span>
    ),
    enableSorting: true,
  },
  {
    id: 'fundingRate',
    accessorKey: 'fundingRate',
    header: () => (
      <div className="text-left flex items-center gap-1">
        <Percent className="w-3 h-3" />
        Funding Rate
      </div>
    ),
    cell: ({ row }) => (
      <span className={cn(
        "font-mono text-sm",
        {
          'text-green-500': row.original.fundingRate && row.original.fundingRate > 0,
          'text-red-500': row.original.fundingRate && row.original.fundingRate < 0,
          'text-muted-foreground': !row.original.fundingRate
        }
      )}>
        {row.original.fundingRate !== null && row.original.fundingRate !== undefined
          ? `${(row.original.fundingRate * 100).toFixed(4)}%` 
          : 'N/A'}
      </span>
    ),
    enableSorting: true,
  },
  {
    id: 'actions',
    header: () => (
      <div className="text-right flex items-center justify-end gap-1">
        <X className="w-3 h-3" />
        Remove
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRemove(row.original.id)}
          className="h-8 w-8 p-0 bg-transparent hover:bg-rose-500/10 transition-colors group"
        >
          <X className="h-4 w-4 text-muted-foreground group-hover:text-rose-500 transition-colors" />
        </Button>
      </div>
    ),
  },
];

export function Watchlist() {
  const { watchlist, removeFromWatchlist, isLoading: isWatchlistLoading, isInitialized } = useWatchlist()
  const [sorting, setSorting] = useState<SortingState>([])
  
  const stableWatchlist = useMemo(() => watchlist, [watchlist]);
  
  const { 
    data: coins, 
    isLoading: isCoinsLoading, 
    error,
    isRefetching 
  } = useWatchlistCoins(stableWatchlist);

  // Create stable remove handler
  const handleRemove = useCallback((coinId: number) => {
    removeFromWatchlist(coinId);
  }, [removeFromWatchlist]);

  // Memoize columns with stable reference
  const columns = useMemo(() => createColumns(handleRemove), [handleRemove]);

  // Memoize table data to prevent recreation
  const tableData = useMemo(() => coins || [], [coins]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  })

  // Handle errors
  if (error) {
    toast({
      title: "Error",
      description: "Failed to fetch coin data",
      variant: "destructive",
    });
  }

  // Show loading skeleton while initializing or loading data
  if (!isInitialized || isWatchlistLoading || isCoinsLoading) {
    return <WatchlistSkeleton rowCount={3} />
  }

  if (!watchlist.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="font-medium">Watchlist</h4>
            <p className="text-sm text-muted-foreground">Track your favorite cryptocurrencies</p>
          </div>
          <CoinSearch />
        </div>
        
        <div className="py-6 border border-dashed border-border rounded-lg">
          <div className="flex flex-col items-center justify-center gap-3">
            <Coins className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-medium">No coins in watchlist</h3>
              <p className="text-sm text-muted-foreground">Add coins to track their performance</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="font-medium">Watchlist</h4>
          <p className="text-sm text-muted-foreground">
            Track your favorite cryptocurrencies
            {isRefetching && <span className="text-xs ml-2 text-blue-500">Refreshing...</span>}
          </p>
        </div>
        <CoinSearch />
      </div>
      
      <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
        {/* Header */}
        <div className="px-3 py-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {table.getHeaderGroups().map(headerGroup => (
              <div key={headerGroup.id} className="grid grid-cols-7 gap-4">
                {headerGroup.headers.map(header => (
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

        {/* Table Body */}
        <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
          {table.getRowModel().rows.map(row => (
            <div 
              key={row.id}
              className="grid grid-cols-7 gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-primary/[0.02] transition-colors"
            >
              {row.getVisibleCells().map(cell => (
                <div 
                  key={cell.id}
                  className={cn(
                    "flex items-center",
                    cell.column.id === 'actions' ? "justify-end" : "justify-start"
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}