'use client'

import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Button } from "@v1/ui/button"
import { X, Coins, TrendingUp, DollarSign, BarChart3 } from "lucide-react"
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
import { useState, useMemo, useCallback } from 'react'
import { Spinner } from "@v1/ui/spinner"
import { motion, AnimatePresence } from "framer-motion"

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

// Update the columns definition
const createColumns = (
  handleRemove: (coinId: number) => void,
  selectedCoins: Set<string>,
  onCoinSelect: (coinId: string, selected: boolean) => void,
  onSelectAll: (checked: boolean) => void,
  totalCoins: number,
  removingCoins: Set<number>,
  hoveredRowId: string | null,
  hasSelectedCoins: boolean
): ColumnDef<WatchlistCoin>[] => [
  {
    id: 'select',
    header: () => (
      <div className={cn(
        "transition-opacity duration-200",
        hasSelectedCoins ? "opacity-100" : "opacity-0"
      )}>
        <Checkbox
          checked={selectedCoins.size === totalCoins && totalCoins > 0}
          onCheckedChange={onSelectAll}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => {
      const isHovered = hoveredRowId === row.id;
      
      return (
        <div className="relative w-full h-full flex items-center justify-start overflow-hidden">
          {/* Checkbox - animate only when no selections exist */}
          {hasSelectedCoins ? (
            // Static checkbox when selections exist
            <div className="absolute left-0 z-10 px-1">
              <Checkbox
                checked={selectedCoins.has(row.original.id.toString())}
                onCheckedChange={(value) => onCoinSelect(row.original.id.toString(), !!value)}
                aria-label="Select row"
                className="mt-[6px] data-[state=checked]:mt-[2px]"
              />
            </div>
          ) : (
            // Animated checkbox when no selections exist
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  className="absolute left-0 z-10 px-1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                    mass: 0.5,
                  }}
                >
                  <Checkbox
                    checked={selectedCoins.has(row.original.id.toString())}
                    onCheckedChange={(value) => onCoinSelect(row.original.id.toString(), !!value)}
                    aria-label="Select row"
                    className="mt-[6px] data-[state=checked]:mt-[2px]"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
          
          {/* Token content - no link here, entire row will be linked */}
          {hasSelectedCoins ? (
            // Static position when selections exist
            <div className="translate-x-10 opacity-90 flex items-center gap-2">
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
              <div className="text-white font-bold text-sm">
                  {row.original.symbol.toUpperCase()}
                </div>
                <div className={cn(
                  "",
                  row.original.isOptimistic && "text-muted-foreground font-mono text-sm"
                )}>
                  <span className="text-muted-foreground font-mono text-sm">{row.original.name}</span>
                </div>
            </div>
          ) : (
            // Animated content when no selections exist
            <motion.div
              className="flex items-center gap-2"
              animate={{ 
                x: isHovered ? 40 : 0,
                opacity: isHovered ? 0.9 : 1 
              }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
                mass: 0.5,
              }}
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
              <div className="flex flex-row items-center gap-2">
                <div className="text-white font-bold text-sm">
                  {row.original.symbol.toUpperCase()}
                </div>
                <div className={cn(
                  "",
                  row.original.isOptimistic && "text-muted-foreground font-mono text-sm"
                )}>
                  <span className="text-muted-foreground font-mono text-sm">{row.original.name}</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'token-sort',
    accessorKey: 'name',
    header: () => (
      <div className="text-left flex items-center gap-1">
        <Coins className="w-3 h-3" />
        Token
      </div>
    ),
    cell: () => null,
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
          <Skeleton className="h-4 w-16 rounded-full" />
        ) : row.original.quote.USD.price > 0 ? (
          `$${row.original.quote.USD.price.toLocaleString()}`
        ) : (
          <Skeleton className="h-4 w-16 rounded-full" />
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
        <Skeleton className="h-4 w-12 rounded-full" />
      ) : row.original.quote.USD.price > 0 ? (
        <span className={cn(
          "font-mono text-sm",
          row.original.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600'
        )}>
          {row.original.quote.USD.percent_change_24h.toFixed(2)}%
        </span>
      ) : (
        <Skeleton className="h-4 w-12 rounded-full" />
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
          <Skeleton className="h-4 w-16 rounded-full" />
        ) : (
          `$${formatLargeNumber(row.original.quote.USD.volume_24h || 0)}`
        )}
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
          onClick={(e) => {
            e.preventDefault(); // Prevent row link navigation
            e.stopPropagation();
            handleRemove(row.original.id);
          }}
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
  const { watchlist, removeFromWatchlist, removeBulkFromWatchlist, isInitialized } = useWatchlist()
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedCoins, setSelectedCoins] = useState<Set<string>>(new Set())
  const [removingCoins, setRemovingCoins] = useState<Set<number>>(new Set())
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  
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
    //isLoading: isCoinsLoading, 
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

  const hasSelectedCoins = selectedCoins.size > 0;

  // Memoize columns with hover state
  const columns = useMemo(() => createColumns(
    handleRemove, 
    selectedCoins, 
    handleCoinSelect, 
    handleSelectAll, 
    filteredCoins.length,
    removingCoins,
    hoveredRowId,
    hasSelectedCoins
  ), [handleRemove, selectedCoins, handleCoinSelect, handleSelectAll, filteredCoins.length, removingCoins, hoveredRowId, hasSelectedCoins]);

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
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={24} />
      </div>
    )
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
          {/* Header - adjust grid to account for merged columns */}
        <div className="px-3 py-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {table.getHeaderGroups().map(headerGroup => (
                <div key={headerGroup.id} className="grid grid-cols-5 gap-4">
                  {headerGroup.headers.slice(0, 1).map(header => ( // Show first header (select/token merged)
                    <div 
                      key={header.id}
                      className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground"
                      onClick={() => table.getColumn('token-sort')?.toggleSorting()} // Sort by token
                    >
                      <Coins className="w-3 h-3" />
                      Token
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

        {/* Table Body */}
        <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
          {table.getRowModel().rows.map(row => {
            const isSelected = selectedCoins.has(row.original.id.toString());
            const hasAnySelections = selectedCoins.size > 0;
            
            return (
              <Link 
                key={row.id}
                href={`/charts/${row.original.id}`}
                className={cn(
                  "grid grid-cols-5 gap-4 px-4 py-2.5 border-b last:border-b-0 hover:bg-primary/[0.02] transition-opacity duration-200 cursor-pointer",
                  hasAnySelections ? (isSelected ? "opacity-100" : "opacity-40") : "opacity-100"
                )}
              >
                {/* First cell - merged select + token with specific hover */}
                <div 
                  className="flex items-center"
                  onMouseEnter={() => setHoveredRowId(row.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  onClick={(e) => {
                    e.preventDefault(); // Always prevent navigation for first cell
                    e.stopPropagation();
                    
                    // Toggle checkbox selection when clicking anywhere in first cell
                    const isCurrentlySelected = selectedCoins.has(row.original.id.toString());
                    handleCoinSelect(row.original.id.toString(), !isCurrentlySelected);
                  }}
                >
                  {(() => {
                    const firstCell = row.getVisibleCells()[0];
                    return firstCell && flexRender(firstCell.column.columnDef.cell, firstCell.getContext());
                  })()}
                </div>
                
                {/* Rest of the cells (skip the hidden token-sort column and removed market cap) */}
                {row.getVisibleCells().slice(2, -1).map(cell => ( // Exclude last cell (actions)
                  <div 
                    key={cell.id}
                    className="flex items-center justify-start"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
                
                {/* Actions cell - prevent navigation */}
                <div 
                  className="flex items-center justify-end"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  {(() => {
                    const lastCell = row.getVisibleCells()[row.getVisibleCells().length - 1];
                    return lastCell && flexRender(lastCell.column.columnDef.cell, lastCell.getContext());
                  })()}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      )}
    </div>
  )
}