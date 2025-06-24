import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { MENU_ITEMS } from './bottom-nav-constants';
import { usePathHelper } from './bottom-nav-hooks';

// Map routes to keyboard shortcuts
const KEYBOARD_SHORTCUTS: Record<string, string> = {
  '/overview': 'g + h',
  '/watchlist': 'g + w', 
  '/charts': 'g + c',
  '/settings': 'g + s',
};

export const NavigationItems = React.memo(() => {
  const pathname = usePathname();
  const getCleanPath = usePathHelper();

  return (
    <div className="flex items-center gap-1">
      {MENU_ITEMS.map((item) => {
        const isActive = getCleanPath(pathname) === item.href;
        const shortcut = KEYBOARD_SHORTCUTS[item.href];
        
        return (
          <Tooltip delayDuration={500} key={item.title}>
            <TooltipTrigger asChild>
              <Link
                href={item.href}
                className={`group p-3 rounded-[14px] transition-colors duration-200 hover:bg-transparent ${
                  isActive ? "bg-white/10 hover:bg-white/5" : ""
                }`}
              >
                <item.icon className={`size-4 ${
                  isActive ? 'fill-white' : 'fill-white/40 group-hover:fill-white'
                }`} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={15} className="flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border-zinc=-800/20 border bg-none shadow-none">
              <span className="text-xs text-zinc-400">{item.title}</span>
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