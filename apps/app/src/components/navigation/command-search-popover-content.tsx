import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@v1/ui/button";
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPopover,
} from "@v1/ui/command-popover";
import { Skeleton } from "@v1/ui/skeleton";
import { useRouter } from "next/navigation";
import { IconCircleSlash } from "symbols-react";
import { useWatchlistPreservingNavigation } from "@/lib/navigation-utils";
import { useCommandInput } from "@/hooks/use-command-input";
import {
  useHybridCoinSearch,
  useHybridTopCoins,
} from "@/hooks/use-hybrid-coin-search";
import { useContextualCommands } from "@/hooks/use-contextual-commands";
import { useAddCoinToWatchlist } from "@/hooks/use-add-coin-to-watchlist";
import { BackgroundPattern } from "./background-pattern";
import { formatUsdPrice } from "@/lib/format-usd";
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides";
import { TokenLogo } from "@/components/token-logo";
import { cn } from "@v1/ui/cn";
import { SearchIcon } from "./search-icon";
import { CommandSearchTrigger } from "./command-search-trigger";

import type { CommandContext } from "./bottom-nav-context";

interface CommandSearchPopoverContentProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
  context?: CommandContext;
}

export const CommandSearchPopoverContent = React.memo(
  function CommandSearchPopoverContent({
    isOpen,
    setIsOpen,
    onCommandSelect,
    context,
  }: CommandSearchPopoverContentProps) {
    const router = useRouter();
    const navigation = useWatchlistPreservingNavigation();
    const { inputRef } = useCommandInput(isOpen);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, { wait: 150 });

    const { data: searchResults, isLoading: isSearchLoading } =
      useHybridCoinSearch(debouncedSearchQuery, {
        limit: 5,
      });

    const { data: topCoins, isLoading: isTopCoinsLoading } =
      useHybridTopCoins(5);

    const hasSearch = debouncedSearchQuery.trim().length > 0;

    const coinsToDisplay = useMemo(() => {
      if (hasSearch) {
        return searchResults || [];
      }
      return topCoins || [];
    }, [hasSearch, searchResults, topCoins]);

    const coinResultsLoading = hasSearch ? isSearchLoading : isTopCoinsLoading;

    const coinSelectMode: "watchlist-add" | "navigate" =
      context === "charts" || context === "watchlist"
        ? "watchlist-add"
        : "navigate";

    const clearSearch = useCallback(() => {
      setSearchQuery("");
    }, []);

    const { contextualCommands, globalCommands, hasContextualCommands } =
      useContextualCommands(debouncedSearchQuery, context);

    const { handleAddCoin, isAddingCoin } = useAddCoinToWatchlist();

    const handleTokenNavigation = useCallback(
      (coinId: string) => {
        clearSearch();
        setIsOpen(false);
        router.push(navigation.buildUrl(`/charts/${coinId}`));
      },
      [clearSearch, navigation, router, setIsOpen],
    );

    const handleContextualAction = useCallback(
      (action: string) => {
        clearSearch();
        setIsOpen(false);

        switch (action) {
          case "top-gainers":
            router.push(navigation.buildUrl("/overview?filter=gainers"));
            break;
          case "market-overview":
            router.push(navigation.buildUrl("/overview?view=market"));
            break;
          case "trending-tokens":
            router.push(navigation.buildUrl("/overview?filter=trending"));
            break;
          case "share-chart":
            navigator.clipboard?.writeText(window.location.href);
            break;
        }
      },
      [clearSearch, navigation, router, setIsOpen],
    );

    const handleCommand = useCallback(
      async (value: string) => {
        if (value.startsWith("watchlist-add:")) {
          const coinId = value.replace("watchlist-add:", "");
          const coin = coinsToDisplay.find((c) => c.id === coinId);
          if (coin) {
            const success = await handleAddCoin(coin);
            if (success) {
              clearSearch();
              setIsOpen(false);
            }
          }
          return;
        }

        if (value.startsWith("coin:")) {
          const coinId = value.replace("coin:", "");
          handleTokenNavigation(coinId);
          return;
        }

        if (value.startsWith("action:")) {
          const action = value.replace("action:", "");
          handleContextualAction(action);
          return;
        }

        if (value.startsWith("href:")) {
          const href = value.replace("href:", "");
          clearSearch();
          setIsOpen(false);
          router.push(navigation.buildUrl(href));
          return;
        }

        onCommandSelect(value, setIsOpen);
      },
      [
        clearSearch,
        coinsToDisplay,
        handleAddCoin,
        handleContextualAction,
        handleTokenNavigation,
        navigation,
        onCommandSelect,
        router,
        setIsOpen,
      ],
    );

    useEffect(() => {
      if (!isOpen) {
        clearSearch();
        // Return focus to the trigger when the palette closes while focus is
        // still inside the input (e.g. Escape); otherwise leave focus alone.
        if (document.activeElement === inputRef.current) {
          triggerRef.current?.focus();
        } else {
          inputRef.current?.blur();
        }
      }
    }, [clearSearch, inputRef, isOpen]);

    const getPlaceholder = () => {
      if (context === "watchlist") return "Search tokens or manage watchlist...";
      if (context === "charts") return "Search charts or add tokens...";
      if (context === "overview") return "Search market data and insights...";
      return "Navigate or search tokens...";
    };

    return (
      <div className="group relative rounded-[20px] bg-zinc-800 backdrop-blur-md border border-transparent overflow-hidden px-2 py-0 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.6)]">
        <BackgroundPattern />

        <div className="relative z-10">
          <CommandPopover
            open={isOpen}
            onOpenChange={setIsOpen}
            shouldFilter={false}
            trigger={
              <div className="flex items-center">
                <CommandSearchTrigger
                  onOpen={() => setIsOpen(true)}
                  buttonRef={triggerRef}
                />
                <div
                  className={cn(
                    "overflow-hidden transition-[width,opacity] duration-[var(--motion-nav-duration)] ease-[var(--motion-nav-ease-out)] motion-reduce:transition-none",
                    isOpen
                      ? "w-[min(445px,calc(100vw-7rem))] opacity-100"
                      : "w-0 opacity-0",
                  )}
                  onMouseDown={(event) => event.stopPropagation()}
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
              {!coinResultsLoading && (
                <CommandEmpty>
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <IconCircleSlash className="h-8 w-8 fill-white/30 rotate-90" />
                    <h3 className="font-medium text-white">No Results Found</h3>
                    <p className="text-sm text-white/60">
                      Try searching for something else
                    </p>
                  </div>
                </CommandEmpty>
              )}

              {hasContextualCommands &&
              context !== "charts" &&
              contextualCommands.map((group) => (
                <CommandGroup
                  key={group.group}
                  heading={group.group}
                  className="text-white [&_[cmdk-group-heading]]:text-white/60"
                >
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.title}
                      value={
                        item.action
                          ? `action:${item.action}`
                          : item.href
                            ? `href:${item.href}`
                            : item.title
                      }
                      onSelect={handleCommand}
                      className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
                    >
                      <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                        <div className="flex items-center gap-3 pr-5">
                          <div className="flex items-center justify-center p-2 bg-primary/10 rounded-lg">
                            <item.icon className="size-4 fill-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-white">
                              {item.title}
                            </span>
                            <span className="text-xs text-white/60">
                              {item.subtitle}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.shortcut ? (
                            <kbd className="rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-berkeley-mono text-zinc-200 uppercase">
                              {item.shortcut}
                            </kbd>
                          ) : item.href ? (
                            <span className="text-xs px-2 py-1 bg-zinc-800/60 text-zinc-200 rounded">
                              Page
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 bg-white/10 text-white rounded">
                              Action
                            </span>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

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
                    Array.from({ length: 5 }, (_, index) => `skeleton-${index}`).map(
                      (skeletonKey) => (
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
                      ),
                    )
                  ) : (
                    coinsToDisplay.map((coin) => (
                      <CommandItem
                        key={coin.id}
                        value={
                          coinSelectMode === "watchlist-add"
                            ? `watchlist-add:${coin.id}`
                            : `coin:${coin.id}`
                        }
                        onSelect={handleCommand}
                        className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
                        disabled={isAddingCoin}
                      >
                        <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                          <div className="flex items-center gap-3 pr-5">
                            <div className="relative">
                              <TokenLogo
                                src={(() => {
                                  const logoUrl = getTokenLogoURL(
                                    coin.symbol,
                                    coin.image,
                                  );
                                  return logoUrl?.startsWith("http") ||
                                    logoUrl?.startsWith("/")
                                    ? logoUrl
                                    : undefined;
                                })()}
                                alt={cleanTokenName(coin.name)}
                                sizePx={24}
                                fallbackText={coin.symbol}
                                className="ring-1 ring-zinc-200 dark:ring-zinc-950 bg-zinc-800 shadow-sm shadow-zinc-950"
                                quality={70}
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-white">
                                {cleanTokenName(coin.name)}
                              </span>
                              <span className="text-xs text-white/60">
                                {coin.symbol.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <div className="text-sm font-berkeley-mono text-white">
                                {formatUsdPrice(coin.quote.USD.price)}
                              </div>
                              <div
                                className={`text-xs font-berkeley-mono ${
                                  coin.quote.USD.percent_change_24h > 0
                                    ? "text-green-400"
                                    : "text-red-400"
                                }`}
                              >
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

              {!context &&
                globalCommands.map((group) => (
                  <CommandGroup
                    key={group.group}
                    heading={group.group}
                    className="text-white [&_[cmdk-group-heading]]:text-white/60"
                  >
                    {group.items.map((item) => (
                      <CommandItem
                        key={item.title}
                        value={item.title}
                        onSelect={handleCommand}
                        className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
                      >
                        <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                          <div className="flex items-center gap-3 pr-5">
                            <div className="flex items-center justify-center p-2 bg-zinc-800/50 rounded-lg">
                              <item.icon className="size-4 fill-white/30" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-white">
                                {item.title}
                              </span>
                              <span className="text-xs text-white/60">
                                {item.subtitle}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {"href" in item && item.shortcut ? (
                              <kbd className="rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-berkeley-mono text-zinc-200 uppercase">
                                {item.shortcut}
                              </kbd>
                            ) : "href" in item ? (
                              <span className="text-xs px-2 py-1 bg-zinc-800/60 text-zinc-200 rounded">
                                Page
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-1 bg-white/10 text-white rounded">
                                Action
                              </span>
                            )}
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
            </CommandList>

            <div className="border-t border-zinc-800 p-2">
              <div className="flex items-center justify-between gap-4 px-2 text-xs text-zinc-400">
                <div className="flex items-center gap-1">
                  <span>navigate</span>
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">
                    ↑
                  </kbd>
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">
                    ↓
                  </kbd>
                </div>
                <div className="flex items-center gap-1">
                  <span>select</span>
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">
                    enter
                  </kbd>
                </div>
                <div className="flex items-center gap-1">
                  <span>close</span>
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">
                    esc
                  </kbd>
                </div>
              </div>
            </div>
          </CommandPopover>
        </div>
      </div>
    );
  },
);

CommandSearchPopoverContent.displayName = "CommandSearchPopoverContent";
