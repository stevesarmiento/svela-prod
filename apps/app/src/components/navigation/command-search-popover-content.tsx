import { useWatchlist } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context";
import { TokenLogo } from "@/components/token-logo";
import { WatchlistGroupIcon } from "@/components/watchlist-group-icon";
import { useAddCoinToWatchlist } from "@/hooks/use-add-coin-to-watchlist";
import { useCommandInput } from "@/hooks/use-command-input";
import { useContextualCommands } from "@/hooks/use-contextual-commands";
import {
  type HybridCoinSearchResult,
  useHybridCoinSearch,
  useHybridTopCoins,
} from "@/hooks/use-hybrid-coin-search";
import {
  WATCHLIST_PICKER_STACK_SIZE,
  useWatchlistPickerExtras,
} from "@/hooks/use-watchlist-picker-extras";
import { formatUsdPrice } from "@/lib/format-usd";
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides";
import { useWatchlistPreservingNavigation } from "@/lib/navigation-utils";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/cn";
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconCheckmark, IconCircleSlash } from "symbols-react";
import { BackgroundPattern } from "./background-pattern";
import { CommandSearchTrigger } from "./command-search-trigger";
import { SearchIcon } from "./search-icon";
import { WatchlistTargetPill } from "./watchlist-target-pill";

import type { CommandContext } from "./bottom-nav-context";

interface CommandSearchPopoverContentProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
  context?: CommandContext;
}

type WatchlistData = ReturnType<typeof useWatchlist>;
type WatchlistGroup = WatchlistData["watchlistGroups"][number];
type SelectedWatchlistGroup = WatchlistData["selectedGroup"];
type WatchlistExtrasMap = ReturnType<
  typeof useWatchlistPickerExtras
>["extrasByGroupId"];
type CommandGroupList = ReturnType<
  typeof useContextualCommands
>["contextualCommands"];
type GlobalCommandGroupList = ReturnType<
  typeof useContextualCommands
>["globalCommands"];
type CommandInputRef = ReturnType<typeof useCommandInput>["inputRef"];
type CoinSelectMode = "watchlist-add" | "navigate";

/**
 * Defer the top-coins fetch off the page's critical loading path: warm it
 * on browser idle, on hover/focus/touch intent, or when the palette opens —
 * whichever comes first. React Query caches it for an hour after that.
 */
function useDeferredWarmup(isOpen: boolean) {
  const [isWarm, setIsWarm] = useState(false);
  const warmUp = useCallback(() => setIsWarm(true), []);
  useEffect(() => {
    if (isWarm) return;
    if (isOpen) {
      setIsWarm(true);
      return;
    }
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(() => setIsWarm(true), {
        timeout: 5000,
      });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = setTimeout(() => setIsWarm(true), 3000);
    return () => clearTimeout(timer);
  }, [isOpen, isWarm]);
  return { isWarm, warmUp };
}

/**
 * Controlled cmdk highlight. With async results the item list is replaced
 * after fetch; cmdk's highlight would keep pointing at an unmounted item,
 * making Enter a silent no-op. Re-anchor to the first visible item
 * whenever the displayed set changes. (cmdk stores values lowercased.)
 */
function useAnchoredHighlight({
  showWatchlistPicker,
  filteredWatchlistGroups,
  hasContextualCommands,
  context,
  contextualCommands,
  coinResultsLoading,
  coinsToDisplay,
  coinSelectMode,
  globalCommands,
}: {
  showWatchlistPicker: boolean;
  filteredWatchlistGroups: WatchlistGroup[];
  hasContextualCommands: boolean;
  context?: CommandContext;
  contextualCommands: CommandGroupList;
  coinResultsLoading: boolean;
  coinsToDisplay: HybridCoinSearchResult[];
  coinSelectMode: CoinSelectMode;
  globalCommands: GlobalCommandGroupList;
}) {
  const [highlightedValue, setHighlightedValue] = useState("");
  const displayedValues = useMemo(() => {
    if (showWatchlistPicker) {
      return filteredWatchlistGroups.map((group) =>
        `watchlist-select:${group.slug}`.trim().toLowerCase(),
      );
    }
    const values: string[] = [];
    if (hasContextualCommands && context !== "charts") {
      for (const group of contextualCommands) {
        for (const item of group.items) {
          values.push(
            item.action
              ? `action:${item.action}`
              : item.href
                ? `href:${item.href}`
                : item.title,
          );
        }
      }
    }
    if (!coinResultsLoading) {
      for (const coin of coinsToDisplay) {
        values.push(
          coinSelectMode === "watchlist-add"
            ? `watchlist-add:${coin.id}`
            : `coin:${coin.id}`,
        );
      }
    }
    if (!context) {
      for (const group of globalCommands) {
        for (const item of group.items) {
          values.push(item.title);
        }
      }
    }
    return values.map((value) => value.trim().toLowerCase());
  }, [
    hasContextualCommands,
    context,
    contextualCommands,
    coinResultsLoading,
    coinsToDisplay,
    coinSelectMode,
    globalCommands,
    showWatchlistPicker,
    filteredWatchlistGroups,
  ]);

  useEffect(() => {
    if (!displayedValues.includes(highlightedValue)) {
      setHighlightedValue(displayedValues[0] ?? "");
    }
  }, [displayedValues, highlightedValue]);

  return { highlightedValue, setHighlightedValue };
}

/**
 * Resolves a selected cmdk value to its action: switch target watchlist,
 * add a token, navigate to a token/page, or run a contextual action.
 */
function useCommandDispatch({
  clearSearch,
  setIsOpen,
  onCommandSelect,
  coinsToDisplay,
  watchlistGroups,
  selectWatchlistGroup,
  setListMode,
  inputRef,
}: {
  clearSearch: () => void;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
  coinsToDisplay: HybridCoinSearchResult[];
  watchlistGroups: WatchlistGroup[];
  selectWatchlistGroup: WatchlistData["selectWatchlistGroup"];
  setListMode: (mode: "tokens" | "watchlists") => void;
  inputRef: CommandInputRef;
}) {
  const router = useRouter();
  const navigation = useWatchlistPreservingNavigation();
  const { handleAddCoin, isAddingCoin } = useAddCoinToWatchlist();

  const handleTokenNavigation = useCallback(
    (coinId: string) => {
      clearSearch();
      setIsOpen(false);
      router.push(navigation.buildUrl(`/watchlists/${coinId}`));
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
      if (value.startsWith("watchlist-select:")) {
        // Picking a target watchlist: switch it, then flip back to token
        // results with the palette still open so tokens can be added next.
        const slug = value.replace("watchlist-select:", "");
        const group = watchlistGroups.find(
          (g) => g.slug.toLowerCase() === slug,
        );
        if (group) {
          selectWatchlistGroup(group);
        }
        setListMode("tokens");
        clearSearch();
        inputRef.current?.focus();
        return;
      }

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
      inputRef,
      navigation,
      onCommandSelect,
      router,
      selectWatchlistGroup,
      setIsOpen,
      setListMode,
      watchlistGroups,
    ],
  );

  return { handleCommand, isAddingCoin };
}

/** Watchlist picker list: pick the target watchlist for token adds. */
function WatchlistPickerGroup({
  groups,
  extrasByGroupId,
  selectedGroup,
  onToggleListMode,
  onSelect,
}: {
  groups: WatchlistGroup[];
  extrasByGroupId: WatchlistExtrasMap;
  selectedGroup: SelectedWatchlistGroup;
  onToggleListMode: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <CommandGroup
      heading={
        <span className="flex items-center gap-1.5">
          <span>Add to</span>
          <WatchlistTargetPill
            selectedGroup={selectedGroup}
            active
            interactive
            onToggle={onToggleListMode}
          />
        </span>
      }
      className="text-white [&_[cmdk-group-heading]]:text-white/60"
    >
      {groups.map((group) => {
        const extras = extrasByGroupId.get(group._id);
        return (
          <CommandItem
            key={group._id}
            value={`watchlist-select:${group.slug}`}
            onSelect={onSelect}
            className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
          >
            <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
              <div className="flex items-center gap-3 pr-5">
                <div className="flex size-9 shrink-0 items-center justify-center bg-white/10 rounded-lg">
                  <WatchlistGroupIcon
                    icon={group.icon}
                    size={16}
                    className="text-white/80"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-white">{group.name}</span>
                  <span className="text-xs text-white/60">
                    {extras
                      ? `${extras.count} ${extras.count === 1 ? "token" : "tokens"}`
                      : null}
                    {extras && group.isDefault ? " · " : null}
                    {group.isDefault ? "Default" : null}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pr-1">
                {extras && extras.logos.length > 0 && (
                  <div className="flex -space-x-2">
                    {extras.logos.map((logo) => (
                      <TokenLogo
                        key={logo.coinId}
                        src={logo.src}
                        alt={logo.symbol}
                        sizePx={20}
                        fallbackText={logo.symbol}
                        quality={70}
                        className="ring-2 ring-zinc-900 bg-zinc-800"
                      />
                    ))}
                    {extras.count > WATCHLIST_PICKER_STACK_SIZE && (
                      <div className="z-10 flex size-5 items-center justify-center rounded-full bg-zinc-800 ring-2 ring-zinc-900 text-[9px] font-berkeley-mono text-white/80">
                        +{extras.count - WATCHLIST_PICKER_STACK_SIZE}
                      </div>
                    )}
                  </div>
                )}
                {selectedGroup?._id === group._id && (
                  <IconCheckmark className="size-3.5 fill-white/80" />
                )}
              </div>
            </div>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

/** Context-specific command groups shown above token results. */
function ContextualCommandGroups({
  groups,
  onSelect,
}: {
  groups: CommandGroupList;
  onSelect: (value: string) => void;
}) {
  return (
    <>
      {groups.map((group) => (
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
              onSelect={onSelect}
              className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
            >
              <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                <div className="flex items-center gap-3 pr-5">
                  <div className="flex items-center justify-center p-2 bg-primary/10 rounded-lg">
                    <item.icon className="size-4 fill-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-white">{item.title}</span>
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
    </>
  );
}

/** Token results (or loading skeletons) for search / popular coins. */
function CoinResultsGroup({
  coinResultsLoading,
  coinsToDisplay,
  coinSelectMode,
  hasSearch,
  selectedGroup,
  canPickWatchlist,
  onToggleListMode,
  isAddingCoin,
  onSelect,
}: {
  coinResultsLoading: boolean;
  coinsToDisplay: HybridCoinSearchResult[];
  coinSelectMode: CoinSelectMode;
  hasSearch: boolean;
  selectedGroup: SelectedWatchlistGroup;
  canPickWatchlist: boolean;
  onToggleListMode: () => void;
  isAddingCoin: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <CommandGroup
      heading={
        coinSelectMode === "watchlist-add" ? (
          <span className="flex items-center gap-1.5">
            <span>Add to</span>
            <WatchlistTargetPill
              selectedGroup={selectedGroup}
              active={false}
              interactive={canPickWatchlist}
              onToggle={onToggleListMode}
            />
          </span>
        ) : hasSearch ? (
          "Tokens"
        ) : (
          "Popular Tokens"
        )
      }
      className="text-white [&_[cmdk-group-heading]]:text-white/60"
    >
      {coinResultsLoading
        ? Array.from({ length: 5 }, (_, index) => `skeleton-${index}`).map(
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
        : coinsToDisplay.map((coin) => (
            <CommandItem
              key={coin.id}
              value={
                coinSelectMode === "watchlist-add"
                  ? `watchlist-add:${coin.id}`
                  : `coin:${coin.id}`
              }
              onSelect={onSelect}
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
          ))}
    </CommandGroup>
  );
}

/** Global command groups shown when there is no page context. */
function GlobalCommandGroups({
  groups,
  onSelect,
}: {
  groups: GlobalCommandGroupList;
  onSelect: (value: string) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <CommandGroup
          key={group.group}
          heading={group.group}
          className="text-white [&_[cmdk-group-heading]]:text-white/60"
        >
          {group.items.map((item) => (
            <CommandItem
              key={item.title}
              value={item.title}
              onSelect={onSelect}
              className="cursor-pointer bg-transparent aria-selected:bg-zinc-800/30 aria-selected:text-white"
            >
              <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                <div className="flex items-center gap-3 pr-5">
                  <div className="flex items-center justify-center p-2 bg-zinc-800/50 rounded-lg">
                    <item.icon className="size-4 fill-white/30" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-white">{item.title}</span>
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
                  ) : (
                    <span className="text-xs px-2 py-1 bg-zinc-800/60 text-zinc-200 rounded">
                      Page
                    </span>
                  )}
                </div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
}

/** Keyboard-hint footer under the command list. */
function CommandFooterHints({
  canPickWatchlist,
  showWatchlistPicker,
}: {
  canPickWatchlist: boolean;
  showWatchlistPicker: boolean;
}) {
  return (
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
        {canPickWatchlist && (
          <div className="flex items-center gap-1">
            <span>{showWatchlistPicker ? "tokens" : "watchlists"}</span>
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">
              tab
            </kbd>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span>close</span>
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 font-berkeley-mono text-zinc-200">
            esc
          </kbd>
        </div>
      </div>
    </div>
  );
}

export const CommandSearchPopoverContent = React.memo(
  function CommandSearchPopoverContent({
    isOpen,
    setIsOpen,
    onCommandSelect,
    context,
  }: CommandSearchPopoverContentProps) {
    const { inputRef } = useCommandInput(isOpen);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, {
      wait: 150,
    });

    const { data: searchResults, isLoading: isSearchLoading } =
      useHybridCoinSearch(debouncedSearchQuery, {
        limit: 5,
      });

    const { isWarm, warmUp } = useDeferredWarmup(isOpen);

    const { data: topCoins, isLoading: isTopCoinsLoading } = useHybridTopCoins(
      5,
      { enabled: isWarm },
    );

    const hasSearch = debouncedSearchQuery.trim().length > 0;

    const coinsToDisplay = useMemo(() => {
      if (hasSearch) {
        return searchResults || [];
      }
      return topCoins || [];
    }, [hasSearch, searchResults, topCoins]);

    const coinResultsLoading = hasSearch ? isSearchLoading : isTopCoinsLoading;

    const coinSelectMode: CoinSelectMode =
      context === "charts" || context === "watchlist"
        ? "watchlist-add"
        : "navigate";

    const clearSearch = useCallback(() => {
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change -- reset-on-close; isCommandOpen is context state toggled externally, event-based reset needs a state lift (follow-up)
      setSearchQuery("");
    }, []);

    const { watchlistGroups, selectedGroup, selectWatchlistGroup } =
      useWatchlist();

    // Tab flips the palette list between token results and a watchlist picker
    // so the add-target can be chosen without leaving the keyboard.
    const [listMode, setListMode] = useState<"tokens" | "watchlists">("tokens");
    const canPickWatchlist =
      coinSelectMode === "watchlist-add" && watchlistGroups.length > 0;
    const showWatchlistPicker = listMode === "watchlists" && canPickWatchlist;

    const filteredWatchlistGroups = useMemo(() => {
      if (!showWatchlistPicker) return [];
      // Groups arrive newest-first from the backend; show oldest first so the
      // list order stays stable as new watchlists are created.
      const sorted = [...watchlistGroups].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      const query = debouncedSearchQuery.trim().toLowerCase();
      if (!query) return sorted;
      return sorted.filter((group) => group.name.toLowerCase().includes(query));
    }, [showWatchlistPicker, watchlistGroups, debouncedSearchQuery]);

    const toggleListMode = useCallback(() => {
      setListMode((mode) => (mode === "tokens" ? "watchlists" : "tokens"));
      setSearchQuery("");
      inputRef.current?.focus();
    }, [inputRef]);

    // Token counts + logo stacks for picker rows; fetched only once the
    // picker is first shown.
    const { extrasByGroupId: watchlistExtrasByGroupId } =
      useWatchlistPickerExtras(showWatchlistPicker);

    const { contextualCommands, globalCommands, hasContextualCommands } =
      useContextualCommands(debouncedSearchQuery, context);

    const { highlightedValue, setHighlightedValue } = useAnchoredHighlight({
      showWatchlistPicker,
      filteredWatchlistGroups,
      hasContextualCommands,
      context,
      contextualCommands,
      coinResultsLoading,
      coinsToDisplay,
      coinSelectMode,
      globalCommands,
    });

    const { handleCommand, isAddingCoin } = useCommandDispatch({
      clearSearch,
      setIsOpen,
      onCommandSelect,
      coinsToDisplay,
      watchlistGroups,
      selectWatchlistGroup,
      setListMode,
      inputRef,
    });

    useEffect(() => {
      if (!isOpen) {
        clearSearch();
        // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change -- reset-on-close; isCommandOpen is context state toggled externally, event-based reset needs a state lift (follow-up)
        setListMode("tokens");
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
      if (showWatchlistPicker) return "Search watchlists...";
      if (context === "watchlist")
        return "Search tokens or manage watchlist...";
      if (context === "charts") return "Search charts or add tokens...";
      if (context === "overview") return "Search market data and insights...";
      return "Navigate or search tokens...";
    };

    // NB: no backdrop-blur on the pill — bg-zinc-800 is fully opaque, the filter would burn paint time invisibly
    return (
      <div className="group relative rounded-[20px] bg-zinc-800 border border-transparent overflow-hidden px-2 py-0 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.6)]">
        <BackgroundPattern />

        <div className="relative z-10">
          <CommandPopover
            open={isOpen}
            onOpenChange={setIsOpen}
            shouldFilter={false}
            value={highlightedValue}
            onValueChange={setHighlightedValue}
            trigger={
              <div className="flex items-center">
                <CommandSearchTrigger
                  onOpen={() => setIsOpen(true)}
                  onIntent={warmUp}
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
                    onKeyDown={(event) => {
                      // Tab flips between token results and the watchlist picker.
                      if (
                        event.key === "Tab" &&
                        !event.shiftKey &&
                        canPickWatchlist
                      ) {
                        event.preventDefault();
                        toggleListMode();
                      }
                    }}
                  />
                </div>
              </div>
            }
          >
            <CommandList className="z-[100] bg-transparent border-transparent max-h-[400px]">
              {(showWatchlistPicker || !coinResultsLoading) && (
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

              {showWatchlistPicker && (
                <WatchlistPickerGroup
                  groups={filteredWatchlistGroups}
                  extrasByGroupId={watchlistExtrasByGroupId}
                  selectedGroup={selectedGroup}
                  onToggleListMode={toggleListMode}
                  onSelect={handleCommand}
                />
              )}

              {!showWatchlistPicker &&
                hasContextualCommands &&
                context !== "charts" && (
                  <ContextualCommandGroups
                    groups={contextualCommands}
                    onSelect={handleCommand}
                  />
                )}

              {!showWatchlistPicker &&
                (coinResultsLoading || coinsToDisplay.length > 0) && (
                  <CoinResultsGroup
                    coinResultsLoading={coinResultsLoading}
                    coinsToDisplay={coinsToDisplay}
                    coinSelectMode={coinSelectMode}
                    hasSearch={hasSearch}
                    selectedGroup={selectedGroup}
                    canPickWatchlist={canPickWatchlist}
                    onToggleListMode={toggleListMode}
                    isAddingCoin={isAddingCoin}
                    onSelect={handleCommand}
                  />
                )}

              {!showWatchlistPicker && !context && (
                <GlobalCommandGroups
                  groups={globalCommands}
                  onSelect={handleCommand}
                />
              )}
            </CommandList>

            <CommandFooterHints
              canPickWatchlist={canPickWatchlist}
              showWatchlistPicker={showWatchlistPicker}
            />
          </CommandPopover>
        </div>
      </div>
    );
  },
);

CommandSearchPopoverContent.displayName = "CommandSearchPopoverContent";
