import React, { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { MENU_ITEMS } from './bottom-nav-constants';
import { usePathHelper } from './bottom-nav-hooks';
import { getShortcutForRoute } from '@/lib/keyboard-shortcuts';
import { useWatchlistPreservingNavigation } from '@/lib/navigation-utils';
import { prefetchDashboardRoute } from '@/lib/prefetch-routes';
import { useTokenHeader } from '@/hooks/use-token-header';
import { TokenLogo } from '@/components/token-logo';

import type { CommandContext } from './bottom-nav-context';

interface MenuItem {
  href: string
  title: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavigationItemsProps {
  onOpenCommandSearch: (context: CommandContext | null) => void;
}

export const NavigationItems = React.memo(({ onOpenCommandSearch }: NavigationItemsProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const getCleanPath = usePathHelper();
  const navigation = useWatchlistPreservingNavigation();
  const { isChartDetailPage, tokenData } = useTokenHeader();

  // Map menu items to their preserved URLs
  const getItemUrl = useCallback((item: MenuItem) => {
    switch (item.href) {
      case "/screener":
        return navigation.screener;
      case "/overview":
        return navigation.overview;
      case "/watchlists":
        return navigation.watchlist;
      default:
        return item.href;
    }
  }, [navigation]);

  const handleItemClick = useCallback((item: MenuItem, isExactActive: boolean) => {
    return () => {
      // On a nested page (e.g. a token chart under /watchlists/[id]) the tab
      // is highlighted but not exact — clicking it navigates back to the tab
      // root instead of opening the contextual command menu.
      if (isExactActive) {
        if (item.href === "/overview") {
          return;
        }

        // Re-clicking the Watchlists tab should open the same
        // "Add to comparison" flow used in charts.
        if (item.href === "/watchlists") {
          onOpenCommandSearch("charts");
          return;
        }

        // Screener is a focused view; for now we don't show a secondary contextual menu
        // on re-click. (We can enable this later by wiring a charts context here.)
        if (item.href === "/screener") {
          return;
        }

        // Sector comparison is a focused view — no contextual menu on re-click.
        if (item.href === "/comparison") {
          return;
        }

        onOpenCommandSearch(item.title.toLowerCase() as CommandContext);
      } else {
        router.push(getItemUrl(item));
      }
    };
  }, [router, onOpenCommandSearch, getItemUrl]);

  const handleItemPrefetch = useCallback((item: MenuItem) => {
    prefetchDashboardRoute(router, getItemUrl(item))
  }, [getItemUrl, router])

  return (
    <div className="flex items-center gap-2">
      {(MENU_ITEMS as readonly MenuItem[]).map((item) => {
        const cleanPath = getCleanPath(pathname);
        const isExactActive = cleanPath === item.href;
        // Keep the tab highlighted on nested routes (e.g. /watchlists/[id]).
        const isActive = isExactActive || cleanPath.startsWith(`${item.href}/`);
        const showTokenBadge =
          item.href === "/watchlists" && isActive && isChartDetailPage && !!tokenData;
        const shortcut = getShortcutForRoute(item.href);
        const tooltipLabel =
          item.href === "/screener"
            ? "Screener"
            : item.href === "/comparison"
            ? "Compare"
            : showTokenBadge
              ? `${tokenData.symbol} · Back to Watchlists`
              : isActive
                ? item.href === "/overview"
                  ? "Overview"
                  : item.href === "/watchlists"
                  ? "Watchlists"
                  : `Search ${item.title}`
                : item.title;

        return (
          <Tooltip delayDuration={500} key={item.title}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleItemClick(item, isExactActive)}
                onMouseEnter={() => handleItemPrefetch(item)}
                onFocus={() => handleItemPrefetch(item)}
                aria-label={
                  showTokenBadge
                    ? `${item.title} — viewing ${tokenData.symbol} chart`
                    : item.title
                }
                aria-current={isExactActive ? "page" : isActive ? "true" : undefined}
                className={`group relative p-2 rounded-[13px] transition-colors duration-100 cursor-pointer active:scale-[0.98] hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus:[&_svg]:!text-white focus-visible:[&_svg]:!text-white dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-800 after:absolute after:-inset-1 after:content-[''] ${
                  isActive 
                    ? "bg-black/10 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15" 
                    : ""
                }`}
              >
                <item.icon
                  className={`size-5 ${
                    isActive
                      ? "text-white"
                      : "text-gray-500 group-hover:text-gray-700 dark:text-white/50 dark:group-hover:text-white/50"
                  }`}
                />
                {showTokenBadge ? (
                  <span className="pointer-events-none absolute -top-0.5 -right-0.5 z-10">
                    <TokenLogo
                      src={tokenData.logoUrl}
                      alt={`${tokenData.symbol} logo`}
                      sizePx={18}
                      fallbackText={tokenData.symbol}
                      className="ring-2 ring-white dark:ring-zinc-800 shadow-sm"
                    />
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={15}
              className="dark flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-sm"
            >
              <span className="text-xs text-gray-600 dark:text-zinc-400">
                {tooltipLabel}
              </span>
              {shortcut && (
                <kbd className="rounded-md bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 text-xs font-berkeley-mono text-gray-700 dark:text-zinc-300 uppercase">
                  {shortcut}
                </kbd>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
});

NavigationItems.displayName = 'NavigationItems';
