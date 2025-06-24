import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MENU_ITEMS } from './bottom-nav-constants';
import { usePathHelper } from './bottom-nav-hooks';

export const NavigationItems = React.memo(() => {
  const pathname = usePathname();
  const getCleanPath = usePathHelper();

  return (
    <div className="flex items-center gap-1">
      {MENU_ITEMS.map((item) => {
        const isActive = getCleanPath(pathname) === item.href;
        return (
          <Link
            key={item.title}
            href={item.href}
            className={`group p-3 rounded-xl transition-colors duration-200 hover:bg-transparent ${
              isActive ? "bg-transparent" : ""
            }`}
            title={item.title}
          >
            <item.icon className={`size-4 ${
              isActive ? 'fill-white' : 'fill-white/40 group-hover:fill-white'
            }`} />
          </Link>
        );
      })}
    </div>
  );
});

NavigationItems.displayName = 'NavigationItems';