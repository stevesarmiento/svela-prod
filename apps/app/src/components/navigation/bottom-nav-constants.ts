import type { ComponentType } from "react";
import { BookmarkIcon } from "./bookmark-icon";
import { ComparisonIcon } from "./comparison-icon";
import { ExploreIcon } from "./explore-icon";
import { HomeIcon } from "./home-icon";
import { isAlphaFeaturesEnabled } from "@/lib/feature-flags";
import { getShortcutForRoute } from "@/lib/keyboard-shortcuts";

export const MENU_ITEMS = [
  {
    title: "Overview",
    href: "/overview",
    icon: HomeIcon,
  },
  {
    title: "Watchlists",
    href: "/watchlists",
    icon: BookmarkIcon,
  },
  {
    title: "Compare",
    href: "/comparison",
    icon: ComparisonIcon,
  },
  {
    title: "Screener",
    href: "/screener",
    icon: ExploreIcon,
  },
] as const;
  
const watchlistCommandItem = {
  title: "Watchlists",
  subtitle: "Your cryptocurrency watchlist",
  href: "/watchlists",
  icon: BookmarkIcon,
  shortcut: getShortcutForRoute("/watchlists"),
} as const;

const comparisonCommandItem = {
  title: "Sector comparison",
  subtitle: "Aggregate view across all your watchlists",
  href: "/comparison",
  icon: ComparisonIcon,
  shortcut: getShortcutForRoute("/comparison"),
} as const;

const screenerCommandItem = {
  title: "Screener",
  subtitle: "Filter and browse all watchlist coins",
  href: "/screener",
  icon: ExploreIcon,
  shortcut: getShortcutForRoute("/screener"),
} as const;

const overviewCommandItem = {
  title: "Overview",
  subtitle: "View dashboard and watchlist",
  href: "/overview",
  icon: HomeIcon,
  shortcut: getShortcutForRoute("/overview"),
} as const;

export const COMMAND_ITEMS = isAlphaFeaturesEnabled()
  ? ([
      {
        group: "Navigation",
        items: [watchlistCommandItem, comparisonCommandItem, screenerCommandItem],
      },
    ] as const)
  : ([
      {
        group: "Navigation",
        items: [
          overviewCommandItem,
          watchlistCommandItem,
          comparisonCommandItem,
          screenerCommandItem,
        ],
      },
    ] as const);

export type NavigationItem = {
  title: string;
  subtitle: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  shortcut?: string;
};
