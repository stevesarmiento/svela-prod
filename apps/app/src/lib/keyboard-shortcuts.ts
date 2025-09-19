/**
 * Centralized Keyboard Shortcuts Configuration
 * 
 * This file contains all keyboard shortcuts used throughout the app.
 * Update shortcuts here to maintain consistency across components.
 */

export type ShortcutCategory = 'navigation' | 'actions' | 'chart' | 'global'

export interface KeyboardShortcut {
  key: string
  combination?: string[]
  description: string
  category: ShortcutCategory
  handler?: string // function name or action type
  route?: string
  component?: string // which component uses this shortcut
}

/**
 * Sequential navigation shortcuts (vim-style)
 */
export const SEQUENTIAL_SHORTCUTS = {
  'g': {
    'h': '/watchlist',        // go to home/watchlist
    'w': '/watchlist',       // go to watchlist  
    'c': '/charts',          // go to charts
    'p': '/portfolio',       // go to portfolio
    's': '/settings',        // go to settings
    'n': '/news',           // go to news
  }
} as const;

/**
 * Global shortcuts that work across the entire app
 */
export const GLOBAL_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: 'k',
    combination: ['cmd', 'ctrl'],
    description: 'Open command palette',
    category: 'global',
    handler: 'toggleCommandPalette',
    component: 'CommandSearch'
  },
  {
    key: 'f',
    combination: ['cmd', 'ctrl'],
    description: 'Open filters',
    category: 'actions',
    handler: 'openFilters',
    component: 'WatchlistFilters'
  },
  {
    key: 'a',
    combination: ['shift'],
    description: 'Add token to watchlist',
    category: 'actions',
    handler: 'focusAddToken',
    component: 'CoinSearch'
  },
  {
    key: 'Escape',
    description: 'Close modal, clear filters, exit selection',
    category: 'global',
    handler: 'escape',
    component: 'Global'
  },
  {
    key: '/',
    description: 'Focus search',
    category: 'actions',
    handler: 'focusSearch',
    component: 'CommandSearch'
  }
];

/**
 * Chart-specific shortcuts
 */
export const CHART_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: 'l',
    description: 'Switch to line chart',
    category: 'chart',
    handler: 'setLineChart',
    component: 'PriceChart'
  },
  {
    key: 'c',
    description: 'Switch to candlestick chart',
    category: 'chart',
    handler: 'setCandlestickChart',
    component: 'PriceChart'
  },
  {
    key: '1',
    description: 'Set 1 day timeframe',
    category: 'chart',
    handler: 'setTimeframe',
    component: 'TimeScaleSelector'
  },
  {
    key: '2',
    description: 'Set 1 week timeframe',
    category: 'chart',
    handler: 'setTimeframe',
    component: 'TimeScaleSelector'
  },
  {
    key: '3',
    description: 'Set 1 year timeframe',
    category: 'chart',
    handler: 'setTimeframe',
    component: 'TimeScaleSelector'
  },
  {
    key: '4',
    description: 'Set 2 year timeframe',
    category: 'chart',
    handler: 'setTimeframe',
    component: 'TimeScaleSelector'
  },
  {
    key: 'w',
    combination: ['shift'],
    description: 'Toggle watchlist',
    category: 'actions',
    handler: 'toggleWatchlist',
    component: 'WatchlistButton'
  }
];

/**
 * Navigation shortcuts with their display labels
 */
export const NAVIGATION_SHORTCUTS = {
  '/overview': 'g + h',
  '/watchlist': 'g + h', 
  '/charts': 'g + c',
  '/portfolio': 'g + p',
  '/settings': 'g + s',
  '/news': 'g + n',
} as const;

/**
 * Get shortcut for a specific route
 */
export function getShortcutForRoute(route: string): string | undefined {
  return NAVIGATION_SHORTCUTS[route as keyof typeof NAVIGATION_SHORTCUTS];
}

/**
 * Get all shortcuts for a specific category
 */
export function getShortcutsByCategory(category: ShortcutCategory): KeyboardShortcut[] {
  const allShortcuts = [...GLOBAL_SHORTCUTS, ...CHART_SHORTCUTS];
  return allShortcuts.filter(shortcut => shortcut.category === category);
}

/**
 * Get all shortcuts for a specific component
 */
export function getShortcutsForComponent(component: string): KeyboardShortcut[] {
  const allShortcuts = [...GLOBAL_SHORTCUTS, ...CHART_SHORTCUTS];
  return allShortcuts.filter(shortcut => shortcut.component === component);
}

/**
 * Format shortcut for display (e.g., "⌘K", "g + h")
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  if (shortcut.combination) {
    const modifiers = shortcut.combination.map(mod => {
      switch (mod) {
        case 'cmd': return '⌘';
        case 'ctrl': return 'Ctrl';
        case 'alt': return 'Alt';
        case 'shift': return 'Shift';
        default: return mod;
      }
    });
    return `${modifiers.join(' + ')} + ${shortcut.key.toUpperCase()}`;
  }
  return shortcut.key;
}

/**
 * Check if shortcut matches current key event
 */
export function matchesShortcut(
  event: KeyboardEvent, 
  shortcut: KeyboardShortcut
): boolean {
  const key = event.key.toLowerCase();
  
  if (shortcut.combination) {
    const requiredModifiers = shortcut.combination.filter(mod => 
      ['cmd', 'ctrl', 'alt', 'shift'].includes(mod)
    );
    
    const hasRequiredModifiers = requiredModifiers.every(mod => {
      switch (mod) {
        case 'cmd': return event.metaKey;
        case 'ctrl': return event.ctrlKey;
        case 'alt': return event.altKey;
        case 'shift': return event.shiftKey;
        default: return false;
      }
    });
    
    return hasRequiredModifiers && key === shortcut.key.toLowerCase();
  }
  
  return key === shortcut.key.toLowerCase();
}

/**
 * All available shortcuts grouped by category
 */
export const ALL_SHORTCUTS = {
  sequential: SEQUENTIAL_SHORTCUTS,
  navigation: NAVIGATION_SHORTCUTS,
  global: GLOBAL_SHORTCUTS,
  chart: CHART_SHORTCUTS,
} as const; 