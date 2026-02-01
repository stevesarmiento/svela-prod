import React, { useCallback, useEffect, useState, useMemo, useDeferredValue } from 'react';
import { useDebouncedValue } from "@tanstack/react-pacer";
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
import Image from 'next/image';
import { Skeleton } from "@v1/ui/skeleton";
import { useRouter } from 'next/navigation';
import { useWatchlistPreservingNavigation } from '@/lib/navigation-utils';

// Custom hooks
import { useCommandInput } from '@/hooks/use-command-input';
import { useHybridCoinSearch, useHybridTopCoins } from '@/hooks/use-hybrid-coin-search';
import { useContextualCommands } from '@/hooks/use-contextual-commands';
import { useAddCoinToWatchlist } from '@/hooks/use-add-coin-to-watchlist';
import { BackgroundPattern } from './background-pattern';

type CommandContext = 'overview' | 'watchlist' | 'charts' | 'portfolio' | null;

interface CommandSearchProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
  context?: CommandContext;
}

export const CommandSearch = React.memo(({ isOpen, setIsOpen, onCommandSelect, context = null }: CommandSearchProps) => {
  const router = useRouter();
  const navigation = useWatchlistPreservingNavigation();
  
  // Custom hooks
  const { inputRef } = useCommandInput(isOpen);
  
  // TanStack Pacer + React: debounce typing + defer expensive search work
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, { wait: 300 });
  const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
  
  // React 19: Use hybrid search hooks with deferred values for better performance
  const { 
    data: searchResults, 
    isLoading: isSearchLoading 
  } = useHybridCoinSearch(deferredSearchQuery, {
    limit: 5 // Limit for command search
  });
  
  const { 
    data: topCoins, 
    isLoading: isTopCoinsLoading 
  } = useHybridTopCoins(5);

  // React 19: Determine which coins to display with deferred values
  const coinsToDisplay = useMemo(() => {
    if (deferredSearchQuery.trim()) {
      return searchResults || [];
    }
    return topCoins || [];
  }, [deferredSearchQuery, searchResults, topCoins]);

  // React 19: Determine loading state with deferred values
  const coinResultsLoading = useMemo(() => {
    if (deferredSearchQuery.trim()) {
      return isSearchLoading;
    }
    return isTopCoinsLoading;
  }, [deferredSearchQuery, isSearchLoading, isTopCoinsLoading]);

  const hasSearch = deferredSearchQuery.trim().length > 0;
  const isCoinResultsContext = context === 'charts' || context === null;
  
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);
  
  const { 
    contextualCommands, 
    globalCommands, 
    hasContextualCommands
  } = useContextualCommands(deferredSearchQuery, context);

  const { handleAddCoin, isAddingCoin } = useAddCoinToWatchlist();

  // Handle token navigation
  const handleTokenNavigation = useCallback((coinId: string) => {
    clearSearch();
    setIsOpen(false);
    router.push(navigation.buildUrl(`/charts/${coinId}`));
  }, [clearSearch, setIsOpen, router, navigation]);

  // Handle contextual command actions
  const handleContextualAction = useCallback((action: string) => {
    clearSearch();
    setIsOpen(false);
    
    // Handle different contextual actions
    switch (action) {
      case 'top-gainers':
        router.push(navigation.buildUrl('/overview?filter=gainers'));
        break;
      case 'market-overview':
        router.push(navigation.buildUrl('/overview?view=market'));
        break;
      case 'trending-tokens':
        router.push(navigation.buildUrl('/overview?filter=trending'));
        break;
      case 'add-token':
        // Could open a modal or focus search
        console.log('Open add token modal');
        break;
      case 'sort-price':
        // Could trigger sort functionality
        console.log('Sort by price');
        break;
      case 'export-watchlist':
        // Could trigger export
        console.log('Export watchlist');
        break;
      case 'timeframe-1h':
      case 'timeframe-1d':
      case 'timeframe-1w':
        // Could change chart timeframe
        console.log('Change timeframe:', action);
        break;
      case 'share-chart':
        // Could copy current chart URL
        navigator.clipboard?.writeText(window.location.href);
        break;
      default:
        console.log('Unknown action:', action);
    }
  }, [clearSearch, setIsOpen, router, navigation]);

  // Handle command selection
  const handleCommandSelect = useCallback(async (value: string) => {
    // Check if this is a watchlist add action (starts with "watchlist-add:")
    if (value.startsWith('watchlist-add:')) {
      const coinId = value.replace('watchlist-add:', '');
      const coin = coinsToDisplay.find(c => c.id === coinId);
      if (coin) {
        const success = await handleAddCoin(coin);
        if (success) {
          clearSearch();
          setIsOpen(false);
        }
      }
      return;
    }

    // Check if this is a coin selection (starts with "coin:")
    if (value.startsWith('coin:')) {
      const coinId = value.replace('coin:', '');
      handleTokenNavigation(coinId);
      return;
    }

    // Check if this is a contextual action (starts with "action:")
    if (value.startsWith('action:')) {
      const action = value.replace('action:', '');
      handleContextualAction(action);
      return;
    }
    
    // Handle regular command selection
    onCommandSelect(value, setIsOpen);
  }, [onCommandSelect, setIsOpen, handleTokenNavigation, handleContextualAction, coinsToDisplay, clearSearch, handleAddCoin]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      clearSearch();
    }
  }, [isOpen, clearSearch]);

  // Get page-specific placeholder text
  const getPlaceholder = () => {
    if (context === 'watchlist') return "Search tokens or manage watchlist...";
    if (context === 'charts') return "Search charts or add tokens...";
    if (context === 'portfolio') return "Search portfolio...";
    if (context === 'overview') return "Search market data and insights...";
    return "Navigate or search tokens...";
  };

  return (
    <div className="group relative rounded-[20px] bg-white/95 backdrop-blur-md border border-gray-200/50 dark:bg-zinc-900 dark:border-transparent overflow-hidden px-2 py-0 hover:bg-gray-50/80 dark:hover:bg-zinc-800/80 transition-colors duration-150 cursor-pointer
                   shadow-[0_4px_8px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)]
                   dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
      
      {/* React 19: Optimized shared background pattern */}
      <BackgroundPattern />
      
      <div className="relative z-10">
        <CommandPopover
          open={isOpen}
          onOpenChange={setIsOpen}
          shouldFilter={false}
          trigger={
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
                    <IconMagnifyingglass className="h-4 w-4 fill-gray-600 group-hover:fill-gray-900 dark:fill-white/70 dark:group-hover:fill-white" />
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={25} className="flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border-gray-200 dark:border-zinc-800 border bg-white/95 dark:bg-zinc-900/95 shadow-sm">
                    <span className="text-xs text-gray-600 dark:text-zinc-400">Quick Actions</span>
                        <kbd className="flex items-center gap-1 rounded-md bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 text-xs font-diatype-mono text-gray-700 dark:text-zinc-300 uppercase">
                            <IconCommand className="h-2.5 w-2.5 fill-gray-700 dark:fill-zinc-300" />
                            <span>+ K</span>
                        </kbd>
                    </TooltipContent>
                </Tooltip>
              </Button>
              <div 
                className={`overflow-hidden ${isOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <CommandInput 
                  ref={inputRef}
                  placeholder={getPlaceholder()}
                  className="bg-transparent border-none rounded-2xl h-[53px] pl-2 text-gray-900 placeholder:text-gray-500 dark:text-white dark:placeholder:text-white/50" 
                  autoFocus={isOpen}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
              </div>
            </div>
          }
        >
          <CommandList className="z-[100] bg-transparent border-transparent max-h-[400px]">
            {(!isCoinResultsContext || !coinResultsLoading) && (
              <CommandEmpty>
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <IconCircleSlash className="h-8 w-8 fill-muted-foreground rotate-90" />
                  <h3 className="font-medium">No Results Found</h3>
                  <p className="text-sm text-muted-foreground">Try searching for something else</p>
                </div>
              </CommandEmpty>
            )}
            
            {/* Contextual Commands - Show when context is provided but not charts */}
            {hasContextualCommands && context !== 'charts' && contextualCommands.map((group) => (
              <CommandGroup key={group.group} heading={group.group}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.title}
                    value={item.action ? `action:${item.action}` : item.title}
                    onSelect={handleCommandSelect}
                    className="cursor-pointer bg-transparent focus:bg-accent focus:text-accent-foreground"
                  >
                    <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                      <div className="flex items-center gap-3 pr-5">
                        <div className="flex items-center justify-center p-2 bg-primary/10 rounded-lg">
                          <item.icon className="size-4 fill-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{item.title}</span>
                          <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {item.shortcut ? (
                          <kbd className="rounded-md bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 text-xs font-diatype-mono text-gray-700 dark:text-zinc-300 uppercase">
                            {item.shortcut}
                          </kbd>
                        ) : item.href ? (
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

            {/* Charts Token Results - Only show when context is 'charts' */}
            {context === 'charts' && (coinResultsLoading || coinsToDisplay.length > 0) && (
              <CommandGroup heading={hasSearch ? "Add Tokens" : "Add to Watchlist"}>
                {coinResultsLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <CommandItem key={`skeleton-${index}`} disabled>
                      <div className="flex items-center justify-between w-full bg-transparent p-2 rounded-lg">
                        <div className="flex items-center gap-3 pr-5">
                          <Skeleton className="h-6 w-6 rounded-full" />
                          <div className="flex flex-col gap-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-12" />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-3 w-10" />
                        </div>
                      </div>
                    </CommandItem>
                  ))
                ) : (
                  coinsToDisplay.map((coin) => (
                    <CommandItem
                      key={coin.id}
                      value={`watchlist-add:${coin.id}`}
                      onSelect={handleCommandSelect}
                      className="cursor-pointer bg-transparent focus:bg-accent focus:text-accent-foreground"
                      disabled={isAddingCoin}
                    >
                      <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                        <div className="flex items-center gap-3 pr-5">
                          <div className="relative">
                            <Image
                              src={coin.image?.startsWith('http') || coin.image?.startsWith('/') ? coin.image : '/favicon.ico'}
                              alt={coin.name}
                              className="w-6 h-6 rounded-full ring-1 ring-zinc-200 dark:ring-zinc-950 bg-zinc-800 shadow-sm shadow-zinc-950"
                              width={24}
                              height={24}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = '/favicon.ico';
                              }}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{coin.name}</span>
                            <span className="text-xs text-muted-foreground">{coin.symbol.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-sm font-diatype-mono">
                              ${coin.quote.USD.price.toLocaleString()}
                            </div>
                            <div className={`text-xs font-diatype-mono ${
                              coin.quote.USD.percent_change_24h > 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {coin.quote.USD.percent_change_24h.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            )}

            {/* Regular Coin Results - Only show when there's no context */}
            {!context && (coinResultsLoading || coinsToDisplay.length > 0) && (
              <CommandGroup heading={hasSearch ? "Tokens" : "Popular Tokens"}>
                {coinResultsLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <CommandItem key={`skeleton-${index}`} disabled>
                      <div className="flex items-center justify-between w-full bg-transparent p-2 rounded-lg">
                        <div className="flex items-center gap-3 pr-5">
                          <Skeleton className="h-6 w-6 rounded-full" />
                          <div className="flex flex-col gap-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-12" />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-3 w-10" />
                        </div>
                      </div>
                    </CommandItem>
                  ))
                ) : (
                  coinsToDisplay.map((coin) => (
                    <CommandItem
                      key={coin.id}
                      value={`coin:${coin.id}`}
                      onSelect={handleCommandSelect}
                      className="cursor-pointer bg-transparent focus:bg-accent focus:text-accent-foreground"
                    >
                      <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                        <div className="flex items-center gap-3 pr-5">
                          <div className="relative">
                            <Image
                              src={coin.image?.startsWith('http') || coin.image?.startsWith('/') ? coin.image : '/favicon.ico'}
                              alt={coin.name}
                              className="w-6 h-6 rounded-full ring-1 ring-zinc-200 dark:ring-zinc-950 bg-zinc-800 shadow-sm shadow-zinc-950"
                              width={24}
                              height={24}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = '/favicon.ico';
                              }}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{coin.name}</span>
                            <span className="text-xs text-muted-foreground">{coin.symbol.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-sm font-diatype-mono">
                              ${coin.quote.USD.price.toLocaleString()}
                            </div>
                            <div className={`text-xs font-diatype-mono ${
                              coin.quote.USD.percent_change_24h > 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {coin.quote.USD.percent_change_24h.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            )}
            
            {/* Global Command Items - Only show when there's no context */}
            {!context && globalCommands.map((group) => (
              <CommandGroup key={group.group} heading={group.group}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.title}
                    value={item.title}
                    onSelect={handleCommandSelect}
                    className="cursor-pointer bg-transparent focus:bg-accent focus:text-accent-foreground"
                  >
                    <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                      <div className="flex items-center gap-3 pr-5">
                        <div className="flex items-center justify-center p-2 bg-gray-100/50 dark:bg-zinc-800/50 rounded-lg">
                          <item.icon className="size-4 fill-gray-500 dark:fill-white/30" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{item.title}</span>
                          <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {'href' in item && item.shortcut ? (
                          <kbd className="rounded-md bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 text-xs font-diatype-mono text-gray-700 dark:text-zinc-300 uppercase">
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
          </CommandList>
          
          {/* Footer with shortcuts */}
          <div className="border-t border-gray-200 dark:border-border p-2">
            <div className="flex items-center justify-between gap-4 px-2 text-xs text-gray-600 dark:text-muted-foreground">
              <div className="flex items-center gap-1">
                <span>navigate</span>
                <kbd className="rounded border border-gray-300 dark:border-border bg-gray-100 dark:bg-muted px-1.5 font-diatype-mono text-gray-700 dark:text-muted-foreground">↑</kbd>
                <kbd className="rounded border border-gray-300 dark:border-border bg-gray-100 dark:bg-muted px-1.5 font-diatype-mono text-gray-700 dark:text-muted-foreground">↓</kbd>
              </div>
              <div className="flex items-center gap-1">
                <span>select</span>
                <kbd className="rounded border border-gray-300 dark:border-border bg-gray-100 dark:bg-muted px-1.5 font-diatype-mono text-gray-700 dark:text-muted-foreground">enter</kbd>
              </div>
              <div className="flex items-center gap-1">
                <span>close</span>
                <kbd className="rounded border border-gray-300 dark:border-border bg-gray-100 dark:bg-muted px-1.5 font-diatype-mono text-gray-700 dark:text-muted-foreground">esc</kbd>
              </div>
            </div>
          </div>
        </CommandPopover>
      </div>
    </div>
  );
});

CommandSearch.displayName = 'CommandSearch';