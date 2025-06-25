import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { IconMagnifyingglass, IconCircleSlash, IconCommand, IconBookmarkFill } from "symbols-react";
import {
  CommandPopover,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@v1/ui/command-popover";
import { COMMAND_ITEMS } from './bottom-nav-constants';
import { useCoinSearch, useTopCoins } from '@/hooks/use-coin-search';
import { useWatchlist } from "../../app/[locale]/(dashboard)/watchlist/_components/watchlist-context";
import { useUser } from '@/hooks/use-user';
import { toast } from "@v1/ui/use-toast";
import Image from 'next/image';
import { Skeleton } from "@v1/ui/skeleton";
import { useDebounce } from '@/hooks/use-debounce';

interface CommandSearchProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
}

interface CoinSearchResult {
  id: number;
  name: string;
  symbol: string;
  cmc_rank?: number;
  quote: {
    USD: {
      price: number;
      percent_change_24h: number;
      market_cap: number;
      volume_24h: number;
    };
  };
}

export const CommandSearch = React.memo(({ isOpen, setIsOpen, onCommandSelect }: CommandSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingCoin, setIsAddingCoin] = useState(false);
  
  const { addToWatchlist } = useWatchlist();
  const { user } = useUser();
  
  // Add debouncing back
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Use debounced version for API calls
  const { 
    data: searchResults, 
    isLoading: isSearchLoading 
  } = useCoinSearch(debouncedSearchQuery);
  
  const { 
    data: topCoins, 
    isLoading: isTopCoinsLoading 
  } = useTopCoins();

  // Update display logic to use debounced
  const coinsToDisplay = useMemo(() => {
    if (debouncedSearchQuery.trim()) {
      return (searchResults || []).slice(0, 5);
    }
    return (topCoins || []).slice(0, 5);
  }, [debouncedSearchQuery, searchResults, topCoins]);

  // Add filtering for command items
  const commandItemsToDisplay = useMemo(() => {
    if (!searchQuery.trim()) {
      return COMMAND_ITEMS;
    }
    
    // Filter command items based on search query
    return COMMAND_ITEMS.map(group => ({
      ...group,
      items: group.items.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subtitle?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })).filter(group => group.items.length > 0);
  }, [searchQuery]);

  // Determine if we should show coin results
  const coinResultsLoading = searchQuery.trim() ? isSearchLoading : isTopCoinsLoading;
  
  const handleAddCoin = React.useCallback(async (coin: CoinSearchResult) => {
    if (!user) {
      toast({
        title: "Error",
        description: "Please sign in to add coins to your watchlist",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsAddingCoin(true);
      await addToWatchlist(Number(coin.id));
      
      toast({
        title: "Success",
        description: `Added ${coin.name} to your watchlist`,
      });
      
      setSearchQuery('');
      setIsOpen(false);
    } catch (error) {
      console.error('Error adding coin:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add coin",
        variant: "destructive",
      });
    } finally {
      setIsAddingCoin(false);
    }
  }, [user, addToWatchlist, setIsOpen]);

  const handleCommandSelect = React.useCallback((value: string) => {
    // Check if this is a coin selection (starts with "coin:")
    if (value.startsWith('coin:')) {
      const coinId = parseInt(value.replace('coin:', ''));
      const coin = coinsToDisplay.find(c => c.id === coinId);
      if (coin) {
        handleAddCoin(coin);
      }
      return;
    }
    
    onCommandSelect(value, setIsOpen);
  }, [onCommandSelect, setIsOpen, coinsToDisplay, handleAddCoin]);

  // Focus the input when the command opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Add this after coinsToDisplay
  console.log('Command Search - Query:', debouncedSearchQuery, 'Results:', searchResults?.length, 'Display:', coinsToDisplay.length);

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
              >
                <CommandInput 
                  ref={inputRef}
                  placeholder="Navigate or search tokens..." 
                  className="bg-transparent border-none rounded-2xl h-[53px] pl-2 text-white placeholder:text-white/50" 
                  autoFocus={isOpen}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
              </div>
            </div>
          }
        >
          <CommandList className="z-[100] bg-transparent max-h-[400px]">
            <CommandEmpty>
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <IconCircleSlash className="h-8 w-8 fill-muted-foreground rotate-90" />
                <h3 className="font-medium">No Results Found</h3>
                <p className="text-sm text-muted-foreground">Try searching for something else</p>
              </div>
            </CommandEmpty>
            
            {/* Coin Results - Only show if there are coins to display */}
            {coinsToDisplay.length > 0 && (
              <CommandGroup heading={searchQuery.trim() ? "Tokens" : "Add to Watchlist"}>
                {coinResultsLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
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
                  ))
                ) : (
                  coinsToDisplay.map((coin) => (
                    <CommandItem
                      key={coin.id}
                      value={`coin:${coin.id}`}
                      onSelect={handleCommandSelect}
                      className="cursor-pointer bg-transparent focus:bg-accent focus:text-accent-foreground"
                      disabled={isAddingCoin}
                    >
                      <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                        <div className="flex items-center gap-3 pr-5">
                          <div className="relative">
                            <Image
                              src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`}
                              alt={coin.name}
                              className="w-6 h-6 rounded-full"
                              width={24}
                              height={24}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{coin.name}</span>
                            <span className="text-xs text-muted-foreground">{coin.symbol.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
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
                          <IconBookmarkFill className="h-4 w-4 fill-muted-foreground" />
                        </div>
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            )}
            
            {/* Command Items */}
            {commandItemsToDisplay.map((group) => (
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
          </CommandList>
          
          {/* Footer with shortcuts */}
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
        </CommandPopover>
      </div>
    </div>
  );
});

CommandSearch.displayName = 'CommandSearch';