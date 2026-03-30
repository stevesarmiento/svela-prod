"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@v1/ui/input";
import { Button } from "@v1/ui/button";
import { Badge } from "@v1/ui/badge";
import { Label } from "@v1/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@v1/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@v1/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { ListFilter, X } from "lucide-react";
import { Kbd } from "@v1/ui/kbd";
import { IconCommand, IconReturn } from "symbols-react";
import { useBottomNav } from "@/components/navigation/bottom-nav-context"

interface FilterChip {
  key: string;
  label: string;
  value: string;
}

interface WatchlistFiltersProps {
  // Filter state
  searchText: string;
  priceRange: [number, number];
  marketCapRange: [number, number];
  volumeRange: [number, number];
  changeFilter: "all" | "positive" | "negative";
  sortBy: "name" | "price" | "change" | "marketCap" | "volume";
  sortOrder: "asc" | "desc";
  
  // Selection state
  selectedCoins: Set<string>;
  totalCoins: number;
  
  // Filter handlers
  onSearchTextChange: (value: string) => void;
  onPriceRangeChange: (range: [number, number]) => void;
  onMarketCapRangeChange: (range: [number, number]) => void;
  onVolumeRangeChange: (range: [number, number]) => void;
  onChangeFilterChange: (value: "all" | "positive" | "negative") => void;
  onSortByChange: (value: "name" | "price" | "change" | "marketCap" | "volume") => void;
  onSortOrderChange: (value: "asc" | "desc") => void;
  onClearAllFilters: () => void;
  
  // Selection handlers
  onSelectAll: (checked: boolean) => void;
  onRemoveSelected: () => void;
  
  // Loading states
  isRemoving?: boolean;

  // Layout
  align?: "left" | "right";
}

export function WatchlistFilters({
  searchText,
  priceRange,
  marketCapRange,
  volumeRange,
  changeFilter,
  sortBy,
  sortOrder,
  selectedCoins,
  totalCoins,
  onSearchTextChange,
  onPriceRangeChange,
  onMarketCapRangeChange,
  onVolumeRangeChange,
  onChangeFilterChange,
  onSortByChange,
  onSortOrderChange,
  onClearAllFilters,
  onSelectAll,
  onRemoveSelected,
  isRemoving,
  align = "left",
}: WatchlistFiltersProps) {
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchText);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const { setNavigationMode, setSelectionMode } = useBottomNav()

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsFilterPopoverOpen(true);
        return;
      }

      // Calculate hasActiveFilters inside the effect to avoid dependency issues
      const currentHasActiveFilters = !!(
        searchText ||
        priceRange[0] > 0 || priceRange[1] < 1000000 ||
        marketCapRange[0] > 0 || marketCapRange[1] < 1000000000000 ||
        volumeRange[0] > 0 || volumeRange[1] < 1000000000 ||
        changeFilter !== "all" ||
        // Default sort is volume desc (highest volume first)
        sortBy !== "volume" || sortOrder !== "desc"
      );

      // Check for Escape to clear filters (only if popover is not open and there are active filters)
      if (e.key === 'Escape' && !isFilterPopoverOpen && currentHasActiveFilters) {
        e.preventDefault();
        onClearAllFilters();
        setInputValue("");
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFilterPopoverOpen, searchText, priceRange, marketCapRange, volumeRange, changeFilter, sortBy, sortOrder, onClearAllFilters]);

  // Focus input when popover opens
  useEffect(() => {
    if (isFilterPopoverOpen && inputRef.current) {
      // Small delay to ensure the popover is fully rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isFilterPopoverOpen]);

  // ✅ LEGITIMATE: Synchronize with external system (bottom navigation context)
  // This useEffect is correct because it syncs React state with external navigation system
  useEffect(() => {
    if (selectedCoins.size > 0) {
      setSelectionMode({
        selectedCoins,
        totalCoins,
        onSelectAll,
        onRemoveSelected,
        isRemoving: isRemoving || false,
      })
    } else {
      setNavigationMode()
    }
  }, [selectedCoins, totalCoins, onSelectAll, onRemoveSelected, isRemoving, setSelectionMode, setNavigationMode])

  const getActiveFilters = (): FilterChip[] => {
    const chips: FilterChip[] = [];

    if (searchText) {
      chips.push({ key: "searchText", label: "Search", value: searchText });
    }

    if (priceRange[0] > 0 || priceRange[1] < 1000000) {
      chips.push({
        key: "priceRange",
        label: "Price",
        value: `$${priceRange[0]} - $${priceRange[1]}`,
      });
    }

    if (marketCapRange[0] > 0 || marketCapRange[1] < 1000000000000) {
      chips.push({
        key: "marketCapRange",
        label: "Market Cap",
        value: `$${marketCapRange[0]}B - $${marketCapRange[1]}B`,
      });
    }

    if (volumeRange[0] > 0 || volumeRange[1] < 1000000000) {
      chips.push({
        key: "volumeRange",
        label: "Volume",
        value: `$${volumeRange[0]}M - $${volumeRange[1]}M`,
      });
    }

    if (changeFilter !== "all") {
      chips.push({
        key: "changeFilter",
        label: "24h Change",
        value: changeFilter === "positive" ? "Positive" : "Negative",
      });
    }

    if (sortBy !== "volume" || sortOrder !== "desc") {
      chips.push({
        key: "sort",
        label: "Sort",
        value: `${sortBy} ${sortOrder}`,
      });
    }

    return chips;
  };

  const removeFilter = (key: string) => {
    switch (key) {
      case "searchText":
        onSearchTextChange("");
        setInputValue("");
        break;
      case "priceRange":
        onPriceRangeChange([0, 1000000]);
        break;
      case "marketCapRange":
        onMarketCapRangeChange([0, 1000000000000]);
        break;
      case "volumeRange":
        onVolumeRangeChange([0, 1000000000]);
        break;
      case "changeFilter":
        onChangeFilterChange("all");
        break;
      case "sort":
        // Reset to default sort (highest volume first)
        onSortByChange("volume");
        onSortOrderChange("desc");
        break;
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearchTextChange(inputValue);
      setIsFilterPopoverOpen(false);
    } else if (e.key === 'Escape') {
      setIsFilterPopoverOpen(false);
    }
  };

  const activeFilters = getActiveFilters();
  const hasActiveFilters = activeFilters.length > 0;
  const hasSelectedCoins = selectedCoins.size > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Regular Filter UI */}
      <div className="flex items-center justify-between w-full">
        {/* Filter Button and Active Filters Row */}
        <div
          className={`flex items-center gap-2 flex-1 min-w-0 ${align === "right" ? "flex-row-reverse justify-start" : ""}`}
        >
          <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      ref={filterButtonRef}
                      variant="ghost"
                      size="icon"
                      className={`group h-7 w-7 p-0 rounded-md bg-accent hover:bg-accent/90 hover:ring-1 ring-primary/10 ${
                        hasActiveFilters ? "text-blue-600 dark:text-blue-400" : ""
                      } ${hasSelectedCoins ? "ring-2 ring-red-500/50" : ""}`}
                    >
                      <ListFilter className="h-4 w-4" />
                      {hasActiveFilters && (
                        <div className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full" />
                      )}
                      {hasSelectedCoins && (
                        <div className="absolute -top-1 -left-1 h-2 w-2 bg-red-500 rounded-full" />
                      )}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent
                  side={align === "right" ? "left" : "right"}
                  className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs"
                >
                  <span>Filters</span>
                  <Kbd><IconCommand className="h-2.5 w-2.5 fill-primary/70" /></Kbd>
                  <span>+</span>
                  <Kbd>F</Kbd>
                </TooltipContent>
              </Tooltip>
            <PopoverContent
              className="rounded-xl bg-white dark:bg-zinc-900 p-2 ml-2"
              align={align === "right" ? "end" : "start"}
              side={align === "right" ? "left" : "right"}
            >
              {/* Search Input - Top Level */}
              <div className="">
                <div className="relative">
                  <Input
                    ref={inputRef}
                    placeholder="Search coins by name or symbol..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="h-8"
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    <Kbd className="text-xs"><IconReturn className="h-2.5 w-2.5 fill-zinc-900 dark:fill-white/50" /></Kbd>
                  </div>
                </div>
              </div>

              {/* Filter Options */}
              <div className="p-2.5 space-y-3">
                <div className="flex items-center gap-1">
                  <ListFilter className="h-2.5 w-2.5 text-primary/30" />
                  <h4 className="font-medium text-xs text-primary/50 uppercase">Filters</h4>
                </div>

                {/* 24h Change Filter */}
                <div className="space-y-2">
                  <Label className="text-[11px] text-primary/80 uppercase flex items-center gap-1">
                    24h Change
                  </Label>
                  <Select value={changeFilter} onValueChange={onChangeFilterChange}>
                    <SelectTrigger className="h-8 rounded-lg">
                      <SelectValue placeholder="All changes" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover rounded-lg" side="right">
                      <SelectItem value="all">All changes</SelectItem>
                      <SelectItem value="positive">Positive only</SelectItem>
                      <SelectItem value="negative">Negative only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort Options */}
                <div className="space-y-2">
                  <Label className="text-[11px] text-primary/80 uppercase">Sort By</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={sortBy} onValueChange={onSortByChange}>
                      <SelectTrigger className="h-8 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover rounded-lg" side="right">
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="price">Price</SelectItem>
                        <SelectItem value="change">24h Change</SelectItem>
                        <SelectItem value="marketCap">Market Cap</SelectItem>
                        <SelectItem value="volume">Volume</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortOrder} onValueChange={onSortOrderChange}>
                      <SelectTrigger className="h-8 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover rounded-lg" side="right">
                        <SelectItem value="asc">Ascending</SelectItem>
                        <SelectItem value="desc">Descending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Active Filters - Inline */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 min-w-0 items-center">
              {activeFilters.map((filter) => (
                <Badge
                  key={filter.key}
                  variant="secondary"
                  className="h-6 gap-1 pr-1 py-0 bg-primary/5 text-primary/50 hover:text-primary cursor-crosshair border-border border-dashed flex-shrink-0"
                >
                  <span className="text-xs font-medium opacity-50">{filter.label}</span>
                  <div className="h-[24px] w-[1px] bg-border mx-1" />
                  <span className="text-xs">{filter.value}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => removeFilter(filter.key)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
              <span className="text-[10px] uppercase text-muted-foreground ml-1">
                press <Kbd className="font-bold w-8">esc</Kbd> to clear
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}