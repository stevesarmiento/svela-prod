import React, { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { MENU_ITEMS } from './bottom-nav-constants';
import { usePathHelper } from './bottom-nav-hooks';
import { getShortcutForRoute } from '@/lib/keyboard-shortcuts';

type CommandContext = 'overview' | 'watchlist' | 'charts' | 'settings';

interface NavigationItemsProps {
  onOpenCommandSearch: (context: CommandContext | null) => void;
}

export const NavigationItems = React.memo(({ onOpenCommandSearch }: NavigationItemsProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const getCleanPath = usePathHelper();

  const handleItemClick = useCallback((item: typeof MENU_ITEMS[number], isActive: boolean) => {
    return () => {
      if (isActive) {
        onOpenCommandSearch(item.title.toLowerCase() as CommandContext);
      } else {
        router.push(item.href);
      }
    };
  }, [router, onOpenCommandSearch]);

  return (
    <div className="flex items-center gap-2">
      {MENU_ITEMS.map((item) => {
        const isActive = getCleanPath(pathname) === item.href;
        const shortcut = getShortcutForRoute(item.href);
        
        return (
          <Tooltip delayDuration={500} key={item.title}>
            <TooltipTrigger asChild>
              <button
                onClick={handleItemClick(item, isActive)}
                className={`group p-3 rounded-[14px] transition-colors duration-200 hover:bg-transparent ${
                  isActive ? "bg-white/10 hover:bg-white/5" : ""
                }`}
              >
                <item.icon className={`size-4 ${
                  isActive ? 'fill-white' : 'fill-white/40 group-hover:fill-white'
                }`} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={15} className="flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border-zinc=-800/20 border bg-none shadow-none">
              <span className="text-xs text-zinc-400">
                {isActive ? `Search ${item.title}` : item.title}
              </span>
              {shortcut && (
                <kbd className="rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-mono text-zinc-300 uppercase">
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