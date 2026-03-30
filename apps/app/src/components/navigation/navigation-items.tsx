import React, { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { MENU_ITEMS } from './bottom-nav-constants';
import { usePathHelper } from './bottom-nav-hooks';
import { getShortcutForRoute } from '@/lib/keyboard-shortcuts';
import { useWatchlistPreservingNavigation } from '@/lib/navigation-utils';

type CommandContext = 'overview' | 'watchlist' | 'charts';

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

  // Map menu items to their preserved URLs
  const getItemUrl = useCallback((item: MenuItem) => {
    switch (item.href) {
      case "/charts":
        return navigation.charts;
      case "/watchlist":
      case "/overview":
        return navigation.overview;
      default:
        return item.href;
    }
  }, [navigation]);

  const handleItemClick = useCallback((item: MenuItem, isActive: boolean) => {
    return () => {
      if (isActive) {
        // Re-clicking the Overview (watchlist) tab should open the same
        // "Add to comparison" flow used in charts.
        if (item.href === "/watchlist" || item.title.toLowerCase() === "overview") {
          onOpenCommandSearch("charts");
          return;
        }

        // Screener is a focused view; for now we don't show a secondary contextual menu
        // on re-click. (We can enable this later by wiring a charts context here.)
        if (item.href === "/charts") {
          return;
        }

        onOpenCommandSearch(item.title.toLowerCase() as CommandContext);
      } else {
        router.push(getItemUrl(item));
      }
    };
  }, [router, onOpenCommandSearch, getItemUrl]);

  return (
    <div className="flex items-center gap-2">
      {(MENU_ITEMS as readonly MenuItem[]).map((item) => {
        const isActive = getCleanPath(pathname) === item.href;
        const shortcut = getShortcutForRoute(item.href);
        const tooltipLabel =
          item.href === "/charts"
            ? "Screener"
            : isActive
              ? item.href === "/watchlist"
                ? "Watchlists"
                : `Search ${item.title}`
              : item.title;
        
        return (
          <Tooltip delayDuration={500} key={item.title}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleItemClick(item, isActive)}
                className={`group p-3 rounded-[14px] transition-colors duration-200 hover:bg-transparent ${
                  isActive 
                    ? "bg-black/10 hover:bg-black/5 dark:bg-white/10 dark:hover:bg-white/5" 
                    : ""
                }`}
              >
                <item.icon className={`size-4 ${
                  isActive 
                    ? 'fill-gray-900 dark:fill-white' 
                    : 'fill-gray-500 group-hover:fill-gray-900 dark:fill-white/40 dark:group-hover:fill-white'
                }`} />
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
                <kbd className="rounded-md bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 text-xs font-diatype-mono text-gray-700 dark:text-zinc-300 uppercase">
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