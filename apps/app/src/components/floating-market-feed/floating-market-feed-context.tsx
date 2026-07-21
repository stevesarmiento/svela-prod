'use client';

import * as React from 'react';

/**
 * Context + provider for the floating market feed, split out from
 * floating-market-feed.tsx so the dashboard layout can import the (tiny)
 * provider without pulling the feed's heavy deps (motion, Convex hooks,
 * dropdowns) into every route's first-load JS. The feed itself is
 * lazy-mounted via floating-market-feed-lazy.tsx.
 */

export interface FloatingMarketFeedPageContextValue {
    displayName: string;
    tokenSymbol?: string;
    tokenLogoURI?: string;
    tokenFeedCoinId?: string;
    hasMobileBottomBar?: boolean;
    suppressFeed?: boolean;
}

interface FloatingMarketFeedContextValue {
    pageContext: FloatingMarketFeedPageContextValue | null;
    setPageContext: React.Dispatch<React.SetStateAction<FloatingMarketFeedPageContextValue | null>>;
    /** Whether the news panel is open. Toggled by the nav trigger. */
    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    /** Loaded articles the user hasn't seen yet (drives the trigger badge). */
    unseenCount: number;
    setUnseenCount: React.Dispatch<React.SetStateAction<number>>;
}

const FloatingMarketFeedContext = React.createContext<FloatingMarketFeedContextValue | null>(null);

export function FloatingMarketFeedProvider({ children }: { children: React.ReactNode }) {
    const [pageContext, setPageContext] = React.useState<FloatingMarketFeedPageContextValue | null>(null);
    const [open, setOpen] = React.useState(false);
    const [unseenCount, setUnseenCount] = React.useState(0);
    const value = React.useMemo(
        () => ({ pageContext, setPageContext, open, setOpen, unseenCount, setUnseenCount }),
        [open, pageContext, unseenCount],
    );

    return <FloatingMarketFeedContext.Provider value={value}>{children}</FloatingMarketFeedContext.Provider>;
}

export function useFloatingMarketFeedContext(): FloatingMarketFeedContextValue {
    const value = React.useContext(FloatingMarketFeedContext);
    if (!value) {
        throw new Error('FloatingMarketFeed must be rendered inside FloatingMarketFeedProvider');
    }
    return value;
}

export function FloatingMarketFeedPageContext(props: FloatingMarketFeedPageContextValue) {
    const { setPageContext } = useFloatingMarketFeedContext();
    const { displayName, hasMobileBottomBar, suppressFeed, tokenFeedCoinId, tokenLogoURI, tokenSymbol } = props;

    React.useEffect(() => {
        setPageContext({
            displayName,
            hasMobileBottomBar,
            suppressFeed,
            tokenFeedCoinId,
            tokenLogoURI,
            tokenSymbol,
        });
        return () => setPageContext(null);
    }, [displayName, hasMobileBottomBar, setPageContext, suppressFeed, tokenFeedCoinId, tokenLogoURI, tokenSymbol]);

    return null;
}
