"use client";

import React, { useCallback, useEffect } from 'react';
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { IconMagnifyingglass, IconCircleSlash, IconCommand } from "symbols-react";
import {
  CommandPopover,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@v1/ui/command-popover";
import { Skeleton } from "@v1/ui/skeleton";
import Image from 'next/image';

// Hooks
import { useCommandSearch } from '@/hooks/use-command-search';
import { useCommandItems } from '@/hooks/use-command-items';
import { useCommandInput } from '@/hooks/use-command-input';
import { useAddCoinToWatchlist } from '@/hooks/use-add-coin-to-watchlist';

// Add these imports at the top
import type { CoinSearchResult } from '@/hooks/use-command-search';
import type { CommandItem as CommandItemType } from '@/components/navigation/bottom-nav-constants';

interface CommandSearchProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
}

export const CommandSearch = React.memo(({ isOpen, setIsOpen, onCommandSelect }: CommandSearchProps) => {
  const { inputRef } = useCommandInput(isOpen);
  const { handleAddCoin, isAddingCoin } = useAddCoinToWatchlist();
  
  const {
    searchQuery,
    setSearchQuery,
    coinsToDisplay,
    isLoading: coinResultsLoading,
    clearSearch,
    hasSearch
  } = useCommandSearch();

  const commandItemsToDisplay = useCommandItems(searchQuery);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      clearSearch();
    }
  }, [isOpen, clearSearch]);

  const handleCommandSelect = useCallback((value: string) => {
    // Handle coin selection
    if (value.startsWith('coin:')) {
      const coinId = parseInt(value.replace('coin:', ''));
      const coin = coinsToDisplay.find(c => c.id === coinId);
      if (coin) {
        handleAddCoin(coin).then((success) => {
          if (success) {
            clearSearch();
            setIsOpen(false);
          }
        });
      }
      return;
    }
    
    // Handle regular command selection
    onCommandSelect(value, setIsOpen);
  }, [onCommandSelect, setIsOpen, coinsToDisplay, handleAddCoin, clearSearch]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, [setIsOpen]);

  return (
    <div className="relative rounded-[20px] bg-zinc-900 overflow-hidden px-2 py-0 hover:bg-zinc-800/80 transition-all duration-200 cursor-pointer
                   shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                   dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
      
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
            radial-gradient(circle at 75% 75%, white 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
      />
      
      <div className="relative z-10">
        <CommandPopover
          open={isOpen}
          onOpenChange={handleOpenChange}
          shouldFilter={false}
          trigger={
            <SearchTrigger isOpen={isOpen} setIsOpen={setIsOpen} />
          }
        >
          <CommandList className="z-[100] bg-transparent max-h-[400px]">
            <SearchInput
              ref={inputRef}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isOpen={isOpen}
            />
            
            <CommandEmpty>
              <EmptyState />
            </CommandEmpty>
            
            {/* Coin Results */}
            {coinsToDisplay.length > 0 && (
              <CoinResults
                coins={coinsToDisplay}
                isLoading={coinResultsLoading}
                isAddingCoin={isAddingCoin}
                hasSearch={hasSearch}
                onSelect={handleCommandSelect}
              />
            )}
            
            {/* Command Items */}
            <CommandItems
              groups={commandItemsToDisplay}
              onSelect={handleCommandSelect}
            />
          </CommandList>
          
          <CommandFooter />
        </CommandPopover>
      </div>
    </div>
  );
});

CommandSearch.displayName = 'CommandSearch';

// Extracted sub-components for better organization and performance

const SearchTrigger = React.memo(({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) => (
  <div className="flex items-center">
    <Button 
      variant="ghost" 
      size="icon" 
      className="hover:bg-transparent p-0" 
      onClick={() => setIsOpen(true)}
      aria-label="Search and quick actions"
    >
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <IconMagnifyingglass className="h-4 w-4 fill-white/70 hover:fill-white" />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={25} className="flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border-zinc=-800/20 border bg-none shadow-none">
          <span className="text-xs text-zinc-400">Quick Actions</span>
          <kbd className="flex items-center gap-1 rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-mono text-zinc-300 uppercase">
            <IconCommand className="h-2.5 w-2.5 fill-zinc-300" />
            <span>+ K</span>
          </kbd>
        </TooltipContent>
      </Tooltip>
    </Button>
    <div 
      className={`overflow-hidden transition-all motion-ease-spring-bouncy motion-duration-200 ${isOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0'}`}
      onClick={(e) => e.stopPropagation()}
    />
  </div>
));
SearchTrigger.displayName = 'SearchTrigger';

const SearchInput = React.forwardRef<HTMLInputElement, {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isOpen: boolean;
}>(({ searchQuery, setSearchQuery, isOpen }, ref) => (
  <CommandInput 
    ref={ref}
    placeholder="Navigate or search tokens..." 
    className="bg-transparent border-none rounded-2xl h-[53px] pl-2 text-white placeholder:text-white/50" 
    autoFocus={isOpen}
    value={searchQuery}
    onValueChange={setSearchQuery}
  />
));
SearchInput.displayName = 'SearchInput';

const EmptyState = React.memo(() => (
  <div className="flex flex-col items-center justify-center py-6 gap-2">
    <IconCircleSlash className="h-8 w-8 fill-muted-foreground rotate-90" />
    <h3 className="font-medium">No Results Found</h3>
    <p className="text-sm text-muted-foreground">Try searching for something else</p>
  </div>
));
EmptyState.displayName = 'EmptyState';

const CoinResults = React.memo(({
  coins,
  isLoading,
  isAddingCoin,
  hasSearch,
  onSelect
}: {
  coins: CoinSearchResult[];
  isLoading: boolean;
  isAddingCoin: boolean;
  hasSearch: boolean;
  onSelect: (value: string) => void;
}) => (
  <CommandGroup heading={hasSearch ? "Tokens" : "Add to Watchlist"}>
    {isLoading ? (
      <CoinSkeletons />
    ) : (
      coins.map((coin) => (
        <CoinItem
          key={coin.id}
          coin={coin}
          isDisabled={isAddingCoin}
          onSelect={onSelect}
        />
      ))
    )}
  </CommandGroup>
));
CoinResults.displayName = 'CoinResults';

const CoinSkeletons = React.memo(() => (
  <>
    {Array.from({ length: 3 }).map((_, index) => (
      <CommandItem key={`skeleton-${index}`} disabled>
        <div className="flex items-center gap-3 w-full p-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      </CommandItem>
    ))}
  </>
));
CoinSkeletons.displayName = 'CoinSkeletons';

const CoinItem = React.memo(({
  coin,
  isDisabled,
  onSelect
}: {
  coin: CoinSearchResult;
  isDisabled: boolean;
  onSelect: (value: string) => void;
}) => (
  <CommandItem
    value={`coin:${coin.id}`}
    onSelect={onSelect}
    className="cursor-pointer bg-transparent focus:bg-accent focus:text-accent-foreground"
    disabled={isDisabled}
  >
    <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
      <div className="flex items-center gap-3 pr-5">
        <Image
          src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`}
          alt={coin.name}
          className="w-6 h-6 rounded-full"
          width={24}
          height={24}
        />
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{coin.name}</span>
          <span className="text-xs text-muted-foreground">{coin.symbol.toUpperCase()}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono">
          ${coin.quote.USD.price.toLocaleString()}
        </div>
        <div className={`text-xs font-mono ${
          coin.quote.USD.percent_change_24h > 0 ? 'text-green-400' : 'text-red-400'
        }`}>
          {coin.quote.USD.percent_change_24h.toFixed(2)}%
        </div>
      </div>
    </div>
  </CommandItem>
));
CoinItem.displayName = 'CoinItem';

const CommandItems = React.memo(({
  groups,
  onSelect
}: {
  groups: Array<{
    group: string;
    items: CommandItemType[];
  }>;
  onSelect: (value: string) => void;
}) => (
  <>
    {groups.map((group) => (
      <CommandGroup key={group.group} heading={group.group}>
        {group.items.map((item: CommandItemType) => (
          <CommandItem
            key={item.title}
            value={item.title}
            onSelect={onSelect}
            className="cursor-pointer bg-transparent focus:bg-accent focus:text-accent-foreground"
          >
            <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
              <div className="flex items-center gap-3 pr-5">
                <div className="flex items-center justify-center p-2 bg-zinc-800/50 rounded-lg">
                  <item.icon className="size-4 fill-white/30" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {'href' in item && item.shortcut ? (
                  <kbd className="rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-mono text-zinc-300 uppercase">
                    {item.shortcut}
                  </kbd>
                ) : 'href' in item ? (
                  <span className="text-xs px-2 py-1 bg-accent rounded">Page</span>
                ) : (
                  <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">Action</span>
                )}
              </div>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    ))}
  </>
));
CommandItems.displayName = 'CommandItems';

const CommandFooter = React.memo(() => (
  <div className="border-t border-border p-2">
    <div className="flex items-center justify-between gap-4 px-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <span>navigate</span>
        <kbd className="rounded border border-border bg-muted px-1.5 font-mono">↑</kbd>
        <kbd className="rounded border border-border bg-muted px-1.5 font-mono">↓</kbd>
      </div>
      <div className="flex items-center gap-1">
        <span>select</span>
        <kbd className="rounded border border-border bg-muted px-1.5 font-mono">enter</kbd>
      </div>
      <div className="flex items-center gap-1">
        <span>close</span>
        <kbd className="rounded border border-border bg-muted px-1.5 font-mono">esc</kbd>
      </div>
    </div>
  </div>
));
CommandFooter.displayName = 'CommandFooter'; 