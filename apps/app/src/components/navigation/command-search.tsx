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
import { Skeleton } from "@v1/ui/skeleton";
import { useRouter } from 'next/navigation';
import { useWatchlistPreservingNavigation } from '@/lib/navigation-utils';

// Custom hooks
import { useCommandInput } from '@/hooks/use-command-input';
import { useHybridCoinSearch, useHybridTopCoins } from '@/hooks/use-hybrid-coin-search';
import { useContextualCommands } from '@/hooks/use-contextual-commands';
import { useAddCoinToWatchlist } from '@/hooks/use-add-coin-to-watchlist';
import { BackgroundPattern } from './background-pattern';
import { formatUsdPrice } from "@/lib/format-usd";
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides";
import { TokenLogo } from "@/components/token-logo";
import { cn } from "@v1/ui/cn";

type CommandContext = 'overview' | 'watchlist' | 'charts' | null;

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
  const isCoinResultsContext = true;
  const coinSelectMode: "watchlist-add" | "navigate" =
    context === "charts" || context === "watchlist" ? "watchlist-add" : "navigate";
  
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

  // Reset search when closing; blur so global shortcuts are not stuck on a hidden input
  useEffect(() => {
    if (!isOpen) {
      clearSearch();
      inputRef.current?.blur();
    }
  }, [isOpen, clearSearch, inputRef]);

  // Get page-specific placeholder text
  const getPlaceholder = () => {
    if (context === 'watchlist') return "Search tokens or manage watchlist...";
    if (context === 'charts') return "Search charts or add tokens...";
    if (context === 'overview') return "Search market data and insights...";
    return "Navigate or search tokens...";
  };

  return (
    <div className="group relative rounded-[20px] bg-zinc-800/80 backdrop-blur-md border border-transparent overflow-hidden px-2 py-0 hover:bg-zinc-800/90 transition-colors duration-150 cursor-pointer
                   shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
      
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
                    <IconMagnifyingglass className="h-4 w-4 fill-white/70 group-hover:fill-white" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={25}
                    className="dark flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-sm"
                  >
                    <span className="text-xs text-zinc-400">Quick Actions</span>
                        <kbd className="flex items-center gap-1 rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-berkeley-mono text-zinc-200 uppercase">
                            <IconCommand className="h-2.5 w-2.5 fill-zinc-200" />
                            <span>+ K</span>
                        </kbd>
                    </TooltipContent>
                </Tooltip>
              </Button>
              <div
                className={cn(
                  "overflow-hidden transition-[width,opacity] duration-[var(--motion-nav-duration)] ease-[var(--motion-nav-ease-out)] motion-reduce:transition-none",
                  isOpen ? "w-[445px] opacity-100" : "w-0 opacity-0",
                )}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <CommandInput 
                  ref={inputRef}
                  placeholder={getPlaceholder()}
                  className="bg-transparent border-none rounded-2xl h-[53px] pl-2 text-white placeholder:text-white/50" 
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
                  <IconCircleSlash className="h-8 w-8 fill-white/30 rotate-90" />
                  <h3 className="font-medium text-white">No Results Found</h3>
                  <p className="text-sm text-white/60">Try searching for something else</p>
                </div>
              </CommandEmpty>
            )}
            
            {/* Contextual Commands - Show when context is provided but not charts */}
            {hasContextualCommands && context !== 'charts' && contextualCommands.map((group) => (
              <CommandGroup
                key={group.group}
                heading={group.group}
                className="text-white [&_[cmdk-group-heading]]:text-white/60"
              >
                {group.items.map((item) => (
                  <CommandItem
                    key={item.title}
                    value={item.action ? `action:${item.action}` : item.title}
                    onSelect={handleCommandSelect}
                    className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
                  >
                    <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                      <div className="flex items-center gap-3 pr-5">
                        <div className="flex items-center justify-center p-2 bg-primary/10 rounded-lg">
                          <item.icon className="size-4 fill-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{item.title}</span>
                          <span className="text-xs text-white/60">{item.subtitle}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {item.shortcut ? (
                          <kbd className="rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-berkeley-mono text-zinc-200 uppercase">
                            {item.shortcut}
                          </kbd>
                        ) : item.href ? (
                          <span className="text-xs px-2 py-1 bg-zinc-800/60 text-zinc-200 rounded">Page</span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-white/10 text-white rounded">Action</span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {/* Token Results */}
            {(coinResultsLoading || coinsToDisplay.length > 0) && (
              <CommandGroup
                heading={
                  coinSelectMode === "watchlist-add"
                    ? hasSearch
                      ? "Add Tokens"
                      : "Add to Watchlist"
                    : hasSearch
                      ? "Tokens"
                      : "Popular Tokens"
                }
                className="text-white [&_[cmdk-group-heading]]:text-white/60"
              >
                {coinResultsLoading ? (
                  Array.from({ length: 5 }, (_, i) => `skeleton-${i}`).map((skeletonKey) => (
                    <CommandItem key={skeletonKey} disabled>
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
                      value={
                        coinSelectMode === "watchlist-add"
                          ? `watchlist-add:${coin.id}`
                          : `coin:${coin.id}`
                      }
                      onSelect={handleCommandSelect}
                      className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
                      disabled={isAddingCoin}
                    >
                      <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                        <div className="flex items-center gap-3 pr-5">
                          <div className="relative">
                            <TokenLogo
                              src={(() => {
                                const logoUrl = getTokenLogoURL(coin.symbol, coin.image)
                                return logoUrl?.startsWith("http") || logoUrl?.startsWith("/") ? logoUrl : undefined
                              })()}
                              alt={cleanTokenName(coin.name)}
                              sizePx={24}
                              fallbackText={coin.symbol}
                              className="ring-1 ring-zinc-200 dark:ring-zinc-950 bg-zinc-800 shadow-sm shadow-zinc-950"
                              quality={70}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-white">{cleanTokenName(coin.name)}</span>
                            <span className="text-xs text-white/60">{coin.symbol.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-sm font-berkeley-mono text-white">
                              {formatUsdPrice(coin.quote.USD.price)}
                            </div>
                            <div className={`text-xs font-berkeley-mono ${
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
              <CommandGroup
                key={group.group}
                heading={group.group}
                className="text-white [&_[cmdk-group-heading]]:text-white/60"
              >
                {group.items.map((item) => (
                  <CommandItem
                    key={item.title}
                    value={item.title}
                    onSelect={handleCommandSelect}
                    className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
                  >
                    <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                      <div className="flex items-center gap-3 pr-5">
                        <div className="flex items-center justify-center p-2 bg-zinc-800/50 rounded-lg">
                          <item.icon className="size-4 fill-white/30" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{item.title}</span>
                          <span className="text-xs text-white/60">{item.subtitle}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {'href' in item && item.shortcut ? (
                          <kbd className="rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-berkeley-mono text-zinc-200 uppercase">
                            {item.shortcut}
                          </kbd>
                        ) : 'href' in item ? (
                          <span className="text-xs px-2 py-1 bg-zinc-800/60 text-zinc-200 rounded">Page</span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-white/10 text-white rounded">Action</span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          
          {/* Footer with shortcuts */}
          <div className="border-t border-zinc-800 p-2">
            <div className="flex items-center justify-between gap-4 px-2 text-xs text-zinc-400">
              <div className="flex items-center gap-1">
                <span>navigate</span>
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">↑</kbd>
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">↓</kbd>
              </div>
              <div className="flex items-center gap-1">
                <span>select</span>
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">enter</kbd>
              </div>
              <div className="flex items-center gap-1">
                <span>close</span>
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">esc</kbd>
              </div>
            </div>
          </div>
        </CommandPopover>
      </div>
    </div>
  );
});

CommandSearch.displayName = 'CommandSearch';