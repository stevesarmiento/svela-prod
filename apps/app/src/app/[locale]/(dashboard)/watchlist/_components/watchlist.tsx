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
import { WatchlistFilters } from "./watchlist-filters"
import { toast } from "@v1/ui/use-toast"
import { Checkbox } from "@v1/ui/checkbox"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table'
import { useState, useMemo, useCallback, memo } from 'react'
import { Spinner } from "@v1/ui/spinner"

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
  isOptimistic?: boolean;
}

// Filter interface
interface FilterState {
  searchText: string;
  priceRange: [number, number];
  marketCapRange: [number, number];
  volumeRange: [number, number];
  changeFilter: "all" | "positive" | "negative";
  sortBy: "name" | "price" | "change" | "marketCap" | "volume";
  sortOrder: "asc" | "desc";
}

// Memoize skeleton components
const WatchlistSkeleton = memo(({ rowCount = 1 }: { rowCount?: number }) => (
  <div className="space-y-4">
    {/* Empty filter state for skeleton */}
    
    <div className="flex items-center justify-between gap-2">
      <WatchlistFilters
        searchText=""
        priceRange={[0, 1000000]}
        marketCapRange={[0, 10000000000000]}
        volumeRange={[0, 1000000000]}
        changeFilter="all"
        sortBy="name"
        sortOrder="asc"
        selectedCoins={new Set()}
        totalCoins={0}
        onSearchTextChange={() => {}}
        onPriceRangeChange={() => {}}
        onMarketCapRangeChange={() => {}}
        onVolumeRangeChange={() => {}}
        onChangeFilterChange={() => {}}
        onSortByChange={() => {}}
        onSortOrderChange={() => {}}
        onClearAllFilters={() => {}}
        onSelectAll={() => {}}
        onRemoveSelected={() => {}}
      />
      <CoinSearch />
    </div>
    
    <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
      <div className="px-3 py-2">
        <div className="grid grid-cols-8 gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="text-left flex items-center gap-1"><Checkbox disabled /><Coins className="w-3 h-3" />Token</div>
          <div className="text-left flex items-center gap-1"><DollarSign className="w-3 h-3" />Price</div>
          <div className="text-left flex items-center gap-1"><TrendingUp className="w-3 h-3" />24h Change</div>
          <div className="text-left flex items-center gap-1"><BarChart3 className="w-3 h-3" />Volume 24h</div>
          <div className="text-left flex items-center gap-1"><BarChart3 className="w-3 h-3" />Market Cap</div>
          <div className="text-left flex items-center gap-1"><Percent className="w-3 h-3" />Funding Rate</div>
          <div className="text-right flex items-center justify-end gap-1"><X className="w-3 h-3" />Remove</div>
        </div>
      </div>
      <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
        {Array.from({ length: rowCount }).map((_, index) => (
          <WatchlistRowSkeleton key={index} isLast={index === rowCount - 1} />
        ))}
      </div>
    </div>
  </div>
));

WatchlistSkeleton.displayName = 'WatchlistSkeleton';

const WatchlistRowSkeleton = memo(({ isLast }: { isLast: boolean }) => (
  <div className={`grid grid-cols-8 gap-4 px-4 py-3 ${!isLast ? 'border-b' : ''}`}>
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-4" />
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

// Move columns outside component to prevent recreation - COMPLETE VERSION
const createColumns = (
  handleRemove: (coinId: number) => void,
  selectedCoins: Set<string>,
  onCoinSelect: (coinId: string, selected: boolean) => void,
  onSelectAll: (checked: boolean) => void,
  totalCoins: number,
  removingCoins: Set<number>
): ColumnDef<WatchlistCoin>[] => [
  {
    id: 'select',
    header: () => (
      <Checkbox
        checked={selectedCoins.size === totalCoins && totalCoins > 0}
        onCheckedChange={onSelectAll}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={selectedCoins.has(row.original.id.toString())}
        onCheckedChange={(value) => onCoinSelect(row.original.id.toString(), !!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
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
          <div className="relative">
            <Image
              src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${row.original.id}.png`}
              alt={row.original.name}
              className={cn(
                "w-6 h-6 rounded-full",
                row.original.isOptimistic && "opacity-50"
              )}
              width={24}
              height={24}
            />
            {row.original.isOptimistic && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner size={12} />
              </div>
            )}
          </div>
          <div>
            <div className={cn(
              "font-semibold text-sm",
              row.original.isOptimistic && "text-muted-foreground"
            )}>
              {row.original.name}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.symbol.toUpperCase()}
            </div>
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
        {row.original.isOptimistic ? (
          <Skeleton className="h-4 w-16" />
        ) : row.original.quote.USD.price > 0 ? (
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
      row.original.isOptimistic ? (
        <Skeleton className="h-4 w-12" />
      ) : row.original.quote.USD.price > 0 ? (
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
          disabled={removingCoins.has(row.original.id)}
          className="h-8 w-8 p-0 bg-transparent hover:bg-rose-500/10 transition-colors group"
        >
          {removingCoins.has(row.original.id) ? (
            <Spinner size={16} />
          ) : (
            <X className="h-4 w-4 text-muted-foreground group-hover:text-rose-500 transition-colors" />
          )}
        </Button>
      </div>
    ),
  },
];

export function Watchlist() {
  const { watchlist, removeFromWatchlist, removeBulkFromWatchlist, isLoading: isWatchlistLoading, isInitialized } = useWatchlist()
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedCoins, setSelectedCoins] = useState<Set<string>>(new Set())
  const [removingCoins, setRemovingCoins] = useState<Set<number>>(new Set())
  
  // Filter state - increase market cap range to accommodate large coins
  const [filters, setFilters] = useState<FilterState>({
    searchText: "",
    priceRange: [0, 1000000],
    marketCapRange: [0, 10000000000000], // Updated here too
    volumeRange: [0, 1000000000],
    changeFilter: "all",
    sortBy: "name",
    sortOrder: "asc",
  })
  
  const stableWatchlist = useMemo(() => watchlist, [watchlist]);
  
  const { 
    data: coins, 
    isLoading: isCoinsLoading, 
    error,
  } = useWatchlistCoins(stableWatchlist);

  // Filter and sort coins based on filter state
  const filteredCoins = useMemo(() => {
    if (!coins) return [];
    
    console.log('Raw coins data:', coins);
    console.log('Current filters:', filters);
    
    const filtered = coins.filter(coin => {
      // Search filter
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        if (!coin.name.toLowerCase().includes(searchLower) && 
            !coin.symbol.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      
      // Price range filter
      if (coin.quote.USD.price < filters.priceRange[0] || 
          coin.quote.USD.price > filters.priceRange[1]) {
        console.log(`Filtering out ${coin.name} due to price: ${coin.quote.USD.price}`);
        return false;
      }
      
      // Market cap range filter
      if (coin.quote.USD.market_cap < filters.marketCapRange[0] || 
          coin.quote.USD.market_cap > filters.marketCapRange[1]) {
        console.log(`Filtering out ${coin.name} due to market cap: ${coin.quote.USD.market_cap}`);
        return false;
      }
      
      // 24h change filter
      if (filters.changeFilter === "positive" && coin.quote.USD.percent_change_24h <= 0) {
        return false;
      }
      if (filters.changeFilter === "negative" && coin.quote.USD.percent_change_24h >= 0) {
        return false;
      }
      
      return true;
    });
    
    console.log('Filtered coins:', filtered);
    
    // Sort coins
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (filters.sortBy) {
        case "price":
          aValue = a.quote.USD.price;
          bValue = b.quote.USD.price;
          break;
        case "change":
          aValue = a.quote.USD.percent_change_24h;
          bValue = b.quote.USD.percent_change_24h;
          break;
        case "marketCap":
          aValue = a.quote.USD.market_cap;
          bValue = b.quote.USD.market_cap;
          break;
        case "volume":
          aValue = a.quote.USD.volume_24h;
          bValue = b.quote.USD.volume_24h;
          break;
        default: // "name"
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (filters.sortOrder === "desc") {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });
    
    return filtered;
  }, [coins, filters]);

  // Create stable remove handler with optimistic updates
  const handleRemove = useCallback(async (coinId: number) => {
    setRemovingCoins(prev => new Set([...prev, coinId]));
    
    try {
      await removeFromWatchlist(coinId);
      
      toast({
        title: "Removed",
        description: "Coin removed from watchlist",
      });
    } finally {
      setRemovingCoins(prev => {
        const newSet = new Set(prev);
        newSet.delete(coinId);
        return newSet;
      });
    }
  }, [removeFromWatchlist]);

  // Selection handlers
  const handleCoinSelect = useCallback((coinId: string, selected: boolean) => {
    setSelectedCoins(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(coinId);
      } else {
        newSet.delete(coinId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedCoins(new Set(filteredCoins.map(coin => coin.id.toString())));
    } else {
      setSelectedCoins(new Set());
    }
  }, [filteredCoins]);

  const handleRemoveSelected = useCallback(async () => {
    const coinIdsToRemove = Array.from(selectedCoins).map(Number);
    setRemovingCoins(new Set(coinIdsToRemove));
    
    try {
      await removeBulkFromWatchlist(coinIdsToRemove);
      setSelectedCoins(new Set());
      toast({
        title: "Success",
        description: `Removed ${selectedCoins.size} coins from watchlist`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove selected coins",
        variant: "destructive",
      });
    } finally {
      setRemovingCoins(new Set());
    }
  }, [selectedCoins, removeBulkFromWatchlist]);

  // Filter handlers
  const handleClearAllFilters = useCallback(() => {
    setFilters({
      searchText: "",
      priceRange: [0, 1000000],
      marketCapRange: [0, 10000000000000], // Updated here too
      volumeRange: [0, 1000000000],
      changeFilter: "all",
      sortBy: "name",
      sortOrder: "asc",
    });
  }, []);

  // Memoize columns with stable reference
  const columns = useMemo(() => createColumns(
    handleRemove, 
    selectedCoins, 
    handleCoinSelect, 
    handleSelectAll, 
    filteredCoins.length,
    removingCoins
  ), [handleRemove, selectedCoins, handleCoinSelect, handleSelectAll, filteredCoins.length, removingCoins]);

  const table = useReactTable({
    data: filteredCoins,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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

  // No coins in watchlist at all
  if (!watchlist.length) {
    return (
      <div className="space-y-4">
        
        <div className="flex items-center justify-between gap-2">
          <WatchlistFilters
            searchText={filters.searchText}
            priceRange={filters.priceRange}
            marketCapRange={filters.marketCapRange}
            volumeRange={filters.volumeRange}
            changeFilter={filters.changeFilter}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            selectedCoins={selectedCoins}
            totalCoins={0}
            onSearchTextChange={(value) => setFilters(prev => ({ ...prev, searchText: value }))}
            onPriceRangeChange={(range) => setFilters(prev => ({ ...prev, priceRange: range }))}
            onMarketCapRangeChange={(range) => setFilters(prev => ({ ...prev, marketCapRange: range }))}
            onVolumeRangeChange={(range) => setFilters(prev => ({ ...prev, volumeRange: range }))}
            onChangeFilterChange={(value) => setFilters(prev => ({ ...prev, changeFilter: value }))}
            onSortByChange={(value) => setFilters(prev => ({ ...prev, sortBy: value }))}
            onSortOrderChange={(value) => setFilters(prev => ({ ...prev, sortOrder: value }))}
            onClearAllFilters={handleClearAllFilters}
            onSelectAll={handleSelectAll}
            onRemoveSelected={handleRemoveSelected}
            isRemoving={removingCoins.size > 0}
          />
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
      <WatchlistFilters
        searchText={filters.searchText}
        priceRange={filters.priceRange}
        marketCapRange={filters.marketCapRange}
        volumeRange={filters.volumeRange}
        changeFilter={filters.changeFilter}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        selectedCoins={selectedCoins}
        totalCoins={filteredCoins.length}
        onSearchTextChange={(value) => setFilters(prev => ({ ...prev, searchText: value }))}
        onPriceRangeChange={(range) => setFilters(prev => ({ ...prev, priceRange: range }))}
        onMarketCapRangeChange={(range) => setFilters(prev => ({ ...prev, marketCapRange: range }))}
        onVolumeRangeChange={(range) => setFilters(prev => ({ ...prev, volumeRange: range }))}
        onChangeFilterChange={(value) => setFilters(prev => ({ ...prev, changeFilter: value }))}
        onSortByChange={(value) => setFilters(prev => ({ ...prev, sortBy: value }))}
        onSortOrderChange={(value) => setFilters(prev => ({ ...prev, sortOrder: value }))}
        onClearAllFilters={handleClearAllFilters}
        onSelectAll={handleSelectAll}
        onRemoveSelected={handleRemoveSelected}
        isRemoving={removingCoins.size > 0}
      />
        <CoinSearch />
      </div>

      {/* Show empty state if no coins after filtering */}
      {filteredCoins.length === 0 ? (
        <div className="py-6 border border-dashed border-border rounded-lg">
          <div className="flex flex-col items-center justify-center gap-3">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-medium">No coins match your filters</h3>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search or filter criteria
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleClearAllFilters}
                className="mt-2"
              >
                Clear all filters
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
          {/* Header */}
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {table.getHeaderGroups().map(headerGroup => (
                <div key={headerGroup.id} className="grid grid-cols-8 gap-4">
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
                className="grid grid-cols-8 gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-primary/[0.02] transition-colors"
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
      )}
    </div>
  )
}