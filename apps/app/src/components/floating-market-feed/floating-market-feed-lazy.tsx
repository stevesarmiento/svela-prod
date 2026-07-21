'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy client mount for the floating market feed so its heavy deps (motion,
 * Convex hooks, dropdown menus) load after hydration instead of shipping in
 * every dashboard route's first-load JS. The feed is a fixed-position
 * bottom-right widget, so there is no layout shift while it loads.
 */
export const FloatingMarketFeedLazy = dynamic(
    () => import('./floating-market-feed').then(module => module.FloatingMarketFeed),
    { ssr: false, loading: () => null },
);
