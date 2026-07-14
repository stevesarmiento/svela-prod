'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAction, useConvexAuth, useMutation, useQuery as useConvexQuery } from 'convex/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Info, Settings2 } from 'lucide-react';
import {
    IconArrowTriangleheadClockwise,
    IconArrowTurnDownRight,
    IconNewspaper,
    IconRighttriangleFill,
    IconThermometerLow,
    IconThermometerSnowflake,
    IconThermometerSun,
    IconTriangleFill,
} from 'symbols-react';

import { cn } from '@v1/ui/cn';
import { Badge } from '@v1/ui/badge';
import { Button } from '@v1/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@v1/ui/dropdown-menu';
import { Skeleton } from '@v1/ui/skeleton';
import { Spinner } from '@v1/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@v1/ui/tooltip';
import { useScreenerTopMarkets } from '@/hooks/use-screener-top-markets';
import type { CoinMarketData } from '@/types/coins';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
    countUnseenFloatingMarketFeedItems,
    DEFAULT_FLOATING_MARKET_FEED_SETTINGS,
    FLOATING_MARKET_FEED_SIZE_OPTIONS,
    getFloatingMarketFeedTitle,
    getNextFloatingMarketFeedSize,
    recordFloatingMarketFeedLastSeen,
    resolveNextFloatingMarketFeedSettings,
    sanitizeFloatingMarketFeedLastSeen,
    sanitizeFloatingMarketFeedSettings,
    type FloatingMarketFeedSettings,
} from './floating-market-feed-utils';

type FeedSentiment = 'bullish' | 'bearish' | 'neutral';

/** Article stored in Convex for a specific coin (carries AI sentiment). */
interface ConvexNewsArticle {
    articleId: Id<'coingeckoNewsArticles'>;
    title: string;
    url: string;
    sourceName: string | null;
    postedAtIso: string | null;
    postedAtMs: number;
    sentiment: FeedSentiment | null;
    sentimentConfidence: number | null;
    sentimentUpdatedAt: number | null;
}

/** Normalized row rendered by the feed. */
interface FeedItem {
    key: string;
    title: string;
    url: string;
    sourceName: string | null;
    postedAtMs: number | null;
    sentiment: FeedSentiment | null;
    /** True for articles whose AI sentiment hasn't been computed yet. */
    sentimentPending: boolean;
}

const FLOATING_MARKET_FEED_SETTINGS_KEY = 'svela:floating-market-feed-settings:v1';
const FLOATING_MARKET_FEED_LAST_SEEN_KEY = 'svela:floating-market-feed-last-seen:v1';

/** Stable keys for static skeleton rows (not derived from map index). */
const NEWS_SKELETON_ROW_KEYS = ['feed-sk-1', 'feed-sk-2', 'feed-sk-3', 'feed-sk-4', 'feed-sk-5'] as const;

/**
 * The feed renders on every dashboard page for now. Keep this hook so specific
 * routes can opt out later.
 */
function shouldHideFloatingMarketFeed(_pathname: string | null): boolean {
    return false;
}

interface FloatingMarketFeedPageContextValue {
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

function useFloatingMarketFeedContext(): FloatingMarketFeedContextValue {
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

/** Resolved ms from article fields; prefers numeric `postedAtMs`. */
function getPostedAtMs(iso: string | null, postedAtMs: number): number | null {
    if (Number.isFinite(postedAtMs) && postedAtMs > 0) return postedAtMs;
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? null : t;
}

/** Human-relative time like "20 min ago" / "2 days ago"; falls back to short date when very old. */
function formatPostedRelative(postedMs: number, nowMs: number): string | null {
    if (!Number.isFinite(postedMs)) return null;
    const diffMs = nowMs - postedMs;
    if (diffMs < 0) return 'just now';

    const sec = Math.floor(diffMs / 1000);
    if (sec < 10) return 'just now';
    if (sec < 60) return `${sec} sec ago`;

    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? '1 min ago' : `${min} min ago`;

    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? '1 hr ago' : `${hr} hr ago`;

    const day = Math.floor(hr / 24);
    if (day < 30) return day === 1 ? '1 day ago' : `${day} days ago`;

    return new Date(postedMs).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function sentimentLabel(s: FeedSentiment): string {
    if (s === 'bullish') return 'Bullish';
    if (s === 'bearish') return 'Bearish';
    return 'Neutral';
}

function sentimentBadgeVariant(s: FeedSentiment): 'success' | 'destructive' | 'warning' {
    if (s === 'bullish') return 'success';
    if (s === 'bearish') return 'destructive';
    return 'warning';
}

function formatPercent(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '--';
    const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${prefix}${Math.abs(value).toFixed(2)}%`;
}

function readFloatingMarketFeedSettings(): FloatingMarketFeedSettings {
    try {
        const raw = window.localStorage.getItem(FLOATING_MARKET_FEED_SETTINGS_KEY);
        if (!raw) return DEFAULT_FLOATING_MARKET_FEED_SETTINGS;
        return sanitizeFloatingMarketFeedSettings(JSON.parse(raw) as unknown);
    } catch {
        return DEFAULT_FLOATING_MARKET_FEED_SETTINGS;
    }
}

function persistFloatingMarketFeedSettings(settings: FloatingMarketFeedSettings) {
    try {
        window.localStorage.setItem(FLOATING_MARKET_FEED_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Ignore storage failures. The in-memory state still updates for the current session.
    }
}

function readLastSeenMs(coinId: string): number {
    try {
        const raw = window.localStorage.getItem(FLOATING_MARKET_FEED_LAST_SEEN_KEY);
        if (!raw) return 0;
        return sanitizeFloatingMarketFeedLastSeen(JSON.parse(raw) as unknown)[coinId] ?? 0;
    } catch {
        return 0;
    }
}

function persistLastSeenMs(coinId: string, seenAtMs: number) {
    try {
        const raw = window.localStorage.getItem(FLOATING_MARKET_FEED_LAST_SEEN_KEY);
        const map = raw ? sanitizeFloatingMarketFeedLastSeen(JSON.parse(raw) as unknown) : {};
        const next = recordFloatingMarketFeedLastSeen(map, coinId, seenAtMs);
        window.localStorage.setItem(FLOATING_MARKET_FEED_LAST_SEEN_KEY, JSON.stringify(next));
    } catch {
        // Ignore storage failures. The in-memory state still updates for the current session.
    }
}

function useFloatingMarketFeedSettings() {
    const [settings, setSettingsState] = React.useState<FloatingMarketFeedSettings>(DEFAULT_FLOATING_MARKET_FEED_SETTINGS);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        setSettingsState(readFloatingMarketFeedSettings());
        setLoaded(true);
    }, []);

    React.useEffect(() => {
        if (!loaded) return;
        persistFloatingMarketFeedSettings(settings);
    }, [loaded, settings]);

    const setSettings = React.useCallback((patch: Partial<FloatingMarketFeedSettings>) => {
        setSettingsState(previous => resolveNextFloatingMarketFeedSettings(previous, patch));
    }, []);

    return { settings, setSettings };
}

function NewsFlameIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 19 23" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
            <path
                d="M15.5426 5.41676C15.4708 5.34319 15.3794 5.29308 15.2799 5.27279C15.1803 5.25249 15.0772 5.26291 14.9835 5.30273C14.8897 5.34256 14.8096 5.40999 14.7532 5.49651C14.6968 5.58303 14.6667 5.68476 14.6667 5.78882C14.6667 8.0048 13.608 9.528 12.8037 10.1756C13.5067 5.9317 12.3207 1.09884 9.1851 0.0267794C9.1079 0.000539394 9.0258 -0.00655056 8.9454 0.00609944C8.8651 0.0187394 8.7888 0.0507595 8.7229 0.0995295C8.657 0.148289 8.6032 0.212399 8.5662 0.286599C8.5291 0.360799 8.5097 0.442959 8.5096 0.526329C8.5096 3.80508 6.5104 5.5935 4.3939 7.4868C2.67924 9.0203 0.905979 10.6073 0.315719 13.0289C-0.645821 16.9737 0.583809 19.9317 4.0752 22.0717C4.1682 22.1289 4.2764 22.1544 4.3843 22.1446C4.4923 22.1348 4.5945 22.0901 4.6761 22.0171C4.7578 21.944 4.8148 21.8462 4.8389 21.7378C4.863 21.6295 4.853 21.516 4.8103 21.4139C3.5013 18.1939 4.2473 14.398 6.7385 12.1624C7.0377 11.8939 7.4905 12.1262 7.5541 12.5232C7.8929 14.6366 9.3425 15.0411 9.5184 17.4051C9.5385 17.6751 9.7526 17.9028 10.0211 17.8683C10.5126 17.8051 10.9853 17.6257 11.4011 17.3415C11.7992 17.0693 12.1308 16.7106 12.3741 16.2935C12.5246 16.0354 12.8521 15.9047 13.0845 16.0925C14.6504 17.3581 14.469 20.1637 12.2923 21.9915C12.2798 22.0008 12.1991 22.0635 12.1875 22.0738C12.1079 22.1437 12.0509 22.2369 12.0245 22.341C11.9981 22.4451 12.0033 22.555 12.0396 22.6559C12.0759 22.7568 12.1415 22.8439 12.2275 22.9054C12.3136 22.9669 12.4159 22.9999 12.5208 23C12.5558 23.0003 12.5908 22.9965 12.625 22.9887C15.4124 22.3956 17.6266 20.1508 18.5481 16.9862C19.7219 12.9548 18.5705 8.5218 15.5426 5.41676Z"
                fill="currentColor"
            />
        </svg>
    );
}

/**
 * Nav button that toggles the news panel. Sits next to the watchlist (star)
 * button in the token page top nav; only renders in a token page context.
 */
export function FloatingMarketFeedTrigger() {
    const { pageContext, open, setOpen, unseenCount } = useFloatingMarketFeedContext();
    const coinId = pageContext?.tokenFeedCoinId?.trim() ?? '';

    if (coinId.length === 0 || pageContext?.suppressFeed === true) return null;

    const showUnseenBadge = !open && unseenCount > 0;
    const unseenLabel = unseenCount > 9 ? '9+' : String(unseenCount);

    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    data-floating-market-feed-trigger
                    aria-expanded={open}
                    aria-label={
                        open
                            ? 'Hide latest news'
                            : showUnseenBadge
                              ? `Show latest news (${unseenCount} new)`
                              : 'Show latest news'
                    }
                    onClick={() => setOpen(value => !value)}
                    className={cn('relative z-10 rounded-lg p-1 size-7', open && 'bg-white/10')}
                >
                    <NewsFlameIcon
                        className={cn('h-4 w-4', open ? 'text-white' : 'text-gray-500 dark:text-zinc-400')}
                    />
                    {showUnseenBadge ? (
                        <span
                            aria-hidden
                            className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-400 px-[3px] text-[9px] font-semibold leading-none text-black tabular-nums ring-2 ring-background"
                        >
                            {unseenLabel}
                        </span>
                    ) : null}
                </Button>
            </TooltipTrigger>
            <TooltipContent
                side="bottom"
                sideOffset={10}
                className="bg-white/95 dark:bg-zinc-900 p-2 py-1 rounded-lg flex items-center gap-2 opacity-100 border border-gray-200 dark:border-zinc-800"
            >
                <p className="text-gray-900 dark:text-white text-xs">
                    {open
                        ? 'Hide latest news'
                        : showUnseenBadge
                          ? `${unseenCount} new article${unseenCount === 1 ? '' : 's'}`
                          : 'Latest news'}
                </p>
            </TooltipContent>
        </Tooltip>
    );
}

export function FloatingMarketFeed() {
    const { pageContext, open, setOpen, setUnseenCount } = useFloatingMarketFeedContext();
    const pathname = usePathname();
    const coinIdFromContext = pageContext?.tokenFeedCoinId?.trim() ?? '';
    // The feed only lives on individual token pages (which set a coin page context).
    const hideFeed =
        shouldHideFloatingMarketFeed(pathname) ||
        pageContext?.suppressFeed === true ||
        coinIdFromContext.length === 0;
    const [settingsMenuOpen, setSettingsMenuOpen] = React.useState(false);
    const { settings, setSettings } = useFloatingMarketFeedSettings();
    const rootRef = React.useRef<HTMLDivElement>(null);
    const shouldReduceMotion = useReducedMotion();
    const feedTitle = getFloatingMarketFeedTitle(settings);
    const coinId = coinIdFromContext;

    const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
    const refreshNewsForCoinNow = useAction(api.coingeckoNews.refreshNewsForCoinNow);
    const requestSentimentForArticles = useMutation(api.coingeckoNews.requestSentimentForArticles);

    const [nowMs, setNowMs] = React.useState(() => Date.now());
    React.useEffect(() => {
        setNowMs(Date.now());
        const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    // Articles come from Convex (with AI sentiment).
    const coinArticles = useConvexQuery(
        api.coingeckoNews.listNewsByCoinId,
        !hideFeed && coinId.length > 0 ? { coingeckoId: coinId, limit: settings.feedSize } : 'skip',
    ) as ConvexNewsArticle[] | undefined;

    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [refreshError, setRefreshError] = React.useState<string | null>(null);
    const requestedKeyRef = React.useRef<string>('');
    const autoRefreshKeyRef = React.useRef<string>('');

    React.useEffect(() => {
        setRefreshError(null);
    }, []);

    const missingSentimentIds = React.useMemo(() => {
        if (!coinArticles) return [];
        return coinArticles.filter(a => a.sentiment === null).map(a => a.articleId);
    }, [coinArticles]);

    // Ask the backend to compute sentiment for freshly ingested articles.
    React.useEffect(() => {
        if (!isAuthenticated || isAuthLoading) return;
        if (missingSentimentIds.length === 0) return;

        const key = missingSentimentIds.join(',');
        if (requestedKeyRef.current === key) return;
        requestedKeyRef.current = key;

        requestSentimentForArticles({ articleIds: missingSentimentIds }).catch(() => {});
    }, [isAuthenticated, isAuthLoading, missingSentimentIds, requestSentimentForArticles]);

    // First visit to a coin with no cached news: fetch it once automatically.
    React.useEffect(() => {
        if (hideFeed) return;
        if (!isAuthenticated || isAuthLoading) return;
        if (coinArticles === undefined) return;
        if (coinArticles.length > 0) return;
        if (isRefreshing) return;

        const key = `${coinId}-empty`;
        if (autoRefreshKeyRef.current === key) return;
        autoRefreshKeyRef.current = key;

        setIsRefreshing(true);
        setRefreshError(null);
        refreshNewsForCoinNow({ coingeckoId: coinId })
            .catch((err: unknown) => {
                const message = err instanceof Error ? err.message : 'Failed to fetch latest news.';
                setRefreshError(message);
            })
            .finally(() => setIsRefreshing(false));
    }, [coinArticles, coinId, hideFeed, isAuthenticated, isAuthLoading, isRefreshing, refreshNewsForCoinNow]);

    const onRefresh = React.useCallback(async () => {
        if (coinId.length === 0 || isRefreshing) return;
        setIsRefreshing(true);
        setRefreshError(null);
        try {
            await refreshNewsForCoinNow({ coingeckoId: coinId });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to fetch latest news.';
            setRefreshError(message);
        } finally {
            setIsRefreshing(false);
        }
    }, [coinId, isRefreshing, refreshNewsForCoinNow]);

    const items = React.useMemo<FeedItem[]>(
        () =>
            (coinArticles ?? []).map(article => ({
                key: `${article.articleId}`,
                title: article.title,
                url: article.url,
                sourceName: article.sourceName,
                postedAtMs: getPostedAtMs(article.postedAtIso, article.postedAtMs),
                sentiment: article.sentiment,
                sentimentPending: article.sentiment === null,
            })),
        [coinArticles],
    );

    const isFeedLoading = coinArticles === undefined;
    const displayName = pageContext?.displayName ?? 'Markets';

    // Unseen tracking: compare loaded articles against the persisted per-coin
    // "last seen" timestamp. The Convex query streams while the panel is
    // closed, so the trigger badge updates live as news arrives.
    const [lastSeenMs, setLastSeenMs] = React.useState(0);

    React.useEffect(() => {
        setLastSeenMs(coinId.length > 0 ? readLastSeenMs(coinId) : 0);
    }, [coinId]);

    const latestPostedMs = React.useMemo(
        () => items.reduce((max, item) => (item.postedAtMs !== null && item.postedAtMs > max ? item.postedAtMs : max), 0),
        [items],
    );

    const unseenCount = React.useMemo(() => {
        if (hideFeed || isFeedLoading) return 0;
        return countUnseenFloatingMarketFeedItems(
            items.map(item => item.postedAtMs),
            lastSeenMs,
        );
    }, [hideFeed, isFeedLoading, items, lastSeenMs]);

    React.useEffect(() => {
        setUnseenCount(unseenCount);
        return () => setUnseenCount(0);
    }, [setUnseenCount, unseenCount]);

    // Everything currently loaded counts as seen while the panel is open.
    React.useEffect(() => {
        if (!open || hideFeed) return;
        if (coinId.length === 0 || latestPostedMs <= lastSeenMs) return;
        setLastSeenMs(latestPostedMs);
        persistLastSeenMs(coinId, latestPostedMs);
    }, [coinId, hideFeed, lastSeenMs, latestPostedMs, open]);

    // useScreenerTopMarkets gates on limit > 0, so a hidden feed skips the fetch.
    const { data: topMarketsData, isLoading: trendingTokensLoading } = useScreenerTopMarkets(hideFeed ? 0 : 8);
    const tickerTokens = React.useMemo(
        () =>
            (topMarketsData ?? [])
                .slice(0, 8)
                .map((coin: CoinMarketData) => ({
                    id: coin.id,
                    symbol: (coin.symbol || '').toUpperCase(),
                    priceChange24hPercent: coin.quote.USD.percent_change_24h ?? 0,
                })),
        [topMarketsData],
    );
    const tickerRail = React.useMemo(() => [...tickerTokens, ...tickerTokens], [tickerTokens]);

    React.useEffect(() => {
        if (!open || hideFeed) return;

        function handlePointerDown(event: PointerEvent) {
            if (settingsMenuOpen) return;

            const target = event.target;
            if (!(target instanceof Node)) return;
            if (rootRef.current?.contains(target)) return;
            if (target instanceof Element && target.closest('[data-floating-market-feed-menu]')) return;
            // Let the nav trigger's own click handle the toggle.
            if (target instanceof Element && target.closest('[data-floating-market-feed-trigger]')) return;
            setOpen(false);
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== 'Escape' || settingsMenuOpen) return;
            setOpen(false);
        }

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [hideFeed, open, setOpen, settingsMenuOpen]);

    if (hideFeed) return null;

    return (
        <div
            ref={rootRef}
            className="svela-floating-market-feed fixed right-10 top-28 z-40 hidden max-w-[calc(100vw-2.5rem)] flex-col items-end sm:right-16 sm:flex lg:right-24"
        >
            <AnimatePresence initial={false}>
                {open ? (
                    <motion.aside
                        key="market-feed"
                        aria-label={`${displayName} market feed`}
                        initial={shouldReduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                        style={{ transformOrigin: 'top right' }}
                        className="flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-3 overflow-visible"
                    >
                        <FloatingMarketTickerBanner tokens={tickerRail} isLoading={trendingTokensLoading} />
                        <FloatingMarketNewsPanel
                            items={items}
                            isLoading={isFeedLoading}
                            displayName={displayName}
                            isRefreshing={isRefreshing}
                            refreshError={refreshError}
                            canRefresh={isAuthenticated && !isAuthLoading}
                            onRefresh={onRefresh}
                            nowMs={nowMs}
                            title={feedTitle}
                            settings={settings}
                            onSettingsChange={setSettings}
                            settingsMenuOpen={settingsMenuOpen}
                            onSettingsMenuOpenChange={setSettingsMenuOpen}
                        />
                    </motion.aside>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

function FloatingMarketTickerBanner({
    tokens,
    isLoading,
}: {
    tokens: Array<{ id: string; symbol: string; priceChange24hPercent: number }>;
    isLoading?: boolean;
}) {
    return (
        <section
            aria-label="Trending market tickers"
            className="overflow-hidden rounded-[19px] border border-zinc-800/70 bg-zinc-900/60 shadow-[0_14px_36px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
            <TickerRail tokens={tokens} isLoading={isLoading} />
        </section>
    );
}

function FloatingMarketNewsPanel({
    items,
    isLoading,
    displayName,
    isRefreshing,
    refreshError,
    canRefresh,
    onRefresh,
    nowMs,
    title,
    settings,
    onSettingsChange,
    settingsMenuOpen,
    onSettingsMenuOpenChange,
}: {
    items: FeedItem[];
    isLoading?: boolean;
    displayName: string;
    isRefreshing: boolean;
    refreshError: string | null;
    canRefresh: boolean;
    onRefresh: () => void;
    nowMs: number;
    title: string;
    settings: FloatingMarketFeedSettings;
    onSettingsChange: (patch: Partial<FloatingMarketFeedSettings>) => void;
    settingsMenuOpen: boolean;
    onSettingsMenuOpenChange: (open: boolean) => void;
}) {
    return (
        <section
            aria-label={`${displayName} market news`}
            className={cn(
                'overflow-hidden rounded-[27px] border border-zinc-800/70 bg-zinc-900/50 shadow-[0_22px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl',
                isRefreshing && 'opacity-90',
            )}
        >
            <div className="flex items-center justify-between gap-3 px-3.5 pt-2.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <ActivityFeedIcon />
                    <h2 className="min-w-0 truncate text-base font-semibold text-white">{title}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        onClick={onRefresh}
                        disabled={!canRefresh || isRefreshing}
                        aria-label="Refresh latest news"
                        className="shrink-0 rounded-[8px] size-6 group"
                    >
                        <IconArrowTriangleheadClockwise
                            className="size-3 shrink-0 fill-primary/60 group-hover:rotate-[30deg] transition-transform duration-200"
                            aria-hidden
                        />
                    </Button>
                    <FloatingMarketFeedSettingsMenu
                        settings={settings}
                        onSettingsChange={onSettingsChange}
                        open={settingsMenuOpen}
                        onOpenChange={onSettingsMenuOpenChange}
                    />
                </div>
            </div>

            <div className="mt-3 max-h-[20rem] overflow-hidden rounded-[29px] border border-zinc-800/70 bg-black">
                <div className="market-feed-news-scroll max-h-[20rem] overflow-y-auto scrollbar-hide">
                    <NewsFeed
                        items={items}
                        isLoading={isLoading}
                        displayName={displayName}
                        isRefreshing={isRefreshing}
                        refreshError={refreshError}
                        nowMs={nowMs}
                    />
                </div>
            </div>
        </section>
    );
}

function ActivityFeedIcon() {
    return (
        <span className="flex size-[18px] shrink-0 items-center justify-center text-white/40" aria-hidden>
            <svg className="size-[18px]" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    d="M13.5 11.5H25.5C26.8807 11.5 28 10.3807 28 9C28 7.61929 26.8807 6.5 25.5 6.5H13.5C12.1193 6.5 11 7.61929 11 9C11 10.3807 12.1193 11.5 13.5 11.5Z"
                    fill="currentColor"
                />
                <path
                    d="M6.5 6.5C5.11929 6.5 4 7.61929 4 9C4 10.3807 5.11929 11.5 6.5 11.5C7.88071 11.5 9 10.3807 9 9C9 7.61929 7.88071 6.5 6.5 6.5Z"
                    fill="currentColor"
                />
                <path
                    d="M6.5 13.5C5.11929 13.5 4 14.6193 4 16C4 17.3807 5.11929 18.5 6.5 18.5C7.88071 18.5 9 17.3807 9 16C9 14.6193 7.88071 13.5 6.5 13.5Z"
                    fill="currentColor"
                />
                <path
                    d="M6.5 20.5C5.11929 20.5 4 21.6193 4 23C4 24.3807 5.11929 25.5 6.5 25.5C7.88071 25.5 9 24.3807 9 23C9 21.6193 7.88071 20.5 6.5 20.5Z"
                    fill="currentColor"
                />
                <path
                    d="M13.5 18.5H25.5C26.8807 18.5 28 17.3807 28 16C28 14.6193 26.8807 13.5 25.5 13.5H13.5C12.1193 13.5 11 14.6193 11 16C11 17.3807 12.1193 18.5 13.5 18.5Z"
                    fill="currentColor"
                />
                <path
                    d="M13.5 25.5H25.5C26.8807 25.5 28 24.3807 28 23C28 21.6193 26.8807 20.5 25.5 20.5H13.5C12.1193 20.5 11 21.6193 11 23C11 24.3807 12.1193 25.5 13.5 25.5Z"
                    fill="currentColor"
                />
            </svg>
        </span>
    );
}

function FloatingMarketFeedSettingsMenu({
    settings,
    onSettingsChange,
    open,
    onOpenChange,
}: {
    settings: FloatingMarketFeedSettings;
    onSettingsChange: (patch: Partial<FloatingMarketFeedSettings>) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Feed settings"
                    title="Feed settings"
                    className="shrink-0 rounded-[8px] size-6"
                >
                    <Settings2 className="size-3 shrink-0" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={8}
                data-floating-market-feed-menu
                className="w-48 rounded-2xl border-zinc-800 bg-zinc-950 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.55)]"
            >
                <TooltipProvider delayDuration={200}>
                    <FloatingMarketFeedPullCycle
                        feedSize={settings.feedSize}
                        onCycle={() => onSettingsChange({ feedSize: getNextFloatingMarketFeedSize(settings.feedSize) })}
                    />
                </TooltipProvider>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function FloatingMarketFeedPullCycle({
    feedSize,
    onCycle,
}: {
    feedSize: FloatingMarketFeedSettings['feedSize'];
    onCycle: () => void;
}) {
    return (
        <div className="flex min-h-10 w-full items-center gap-3 rounded-xl px-2 py-1.5">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-white/60">
                Pull
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            aria-label="What pull means"
                            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 cursor-help"
                        >
                            <Info className="size-3.5" aria-hidden />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent
                        side="top"
                        align="center"
                        className="max-w-48 rounded-xl bg-[#111111] px-3 py-2 text-xs leading-4 text-white shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
                    >
                        Sets how many feed items are requested.
                    </TooltipContent>
                </Tooltip>
            </span>
            <button
                type="button"
                aria-label={`Pull ${feedSize} items. Click to choose the next amount.`}
                onClick={onCycle}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-[transform,background-color] duration-150 ease-out hover:bg-white/[0.06] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 cursor-pointer"
            >
                <span className="shrink-0 text-sm font-semibold text-white">{feedSize} items</span>
                <span className="flex shrink-0 flex-col items-center gap-1" aria-hidden>
                    {FLOATING_MARKET_FEED_SIZE_OPTIONS.map(option => (
                        <span
                            key={option}
                            className={cn(
                                'size-1 rounded-full transition-colors',
                                option === feedSize ? 'bg-white' : 'bg-white/25',
                            )}
                        />
                    ))}
                </span>
            </button>
        </div>
    );
}

function TickerRail({
    tokens,
    isLoading,
}: {
    tokens: Array<{ id: string; symbol: string; priceChange24hPercent: number }>;
    isLoading?: boolean;
}) {
    return (
        <div className="market-feed-ticker-viewport relative overflow-hidden py-1.5">
            {tokens.length === 0 || isLoading ? (
                <div className="flex h-7 items-center gap-2 px-2">
                    {[72, 88, 76, 92, 80].map(width => (
                        <Skeleton
                            key={width}
                            className="h-7 shrink-0 rounded-full bg-white/10"
                            style={{ width }}
                        />
                    ))}
                </div>
            ) : (
                <div className="market-feed-ticker flex w-max items-center gap-2 px-2">
                    {tokens.map((token, index) => (
                        <TickerPill key={`${token.id}-${index}`} token={token} />
                    ))}
                </div>
            )}
        </div>
    );
}

function TickerPill({ token }: { token: { id: string; symbol: string; priceChange24hPercent: number } }) {
    const isPositive = token.priceChange24hPercent >= 0;
    const href = `/watchlists/${encodeURIComponent(token.id)}`;

    return (
        <Link
            href={href}
            className="flex h-7 shrink-0 items-center gap-2 rounded-full bg-black px-3 text-xs font-medium text-white/60 ring-1 ring-white/10 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
            <span className="max-w-16 truncate text-white">{token.symbol || '???'}</span>
            <span
                className={cn(
                    'inline-flex items-center gap-1 tabular-nums',
                    isPositive ? 'text-emerald-400' : 'text-red-400',
                )}
            >
                <IconTriangleFill className={cn('size-2 fill-current', !isPositive && 'rotate-180')} aria-hidden />
                {formatPercent(token.priceChange24hPercent)}
            </span>
        </Link>
    );
}

function NewsFeed({
    items,
    isLoading,
    displayName,
    isRefreshing,
    refreshError,
    nowMs,
}: {
    items: FeedItem[];
    isLoading?: boolean;
    displayName: string;
    isRefreshing: boolean;
    refreshError: string | null;
    nowMs: number;
}) {
    if (isLoading) {
        return <NewsFeedSkeleton />;
    }

    if (items.length === 0) {
        return (
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                <IconNewspaper className="size-10 shrink-0 fill-primary/35" aria-hidden />
                <div className="max-w-[18rem] space-y-2">
                    <p className="text-xs font-medium font-berkeley-mono text-primary/20 text-pretty">
                        {isRefreshing
                            ? 'Fetching latest news…'
                            : refreshError
                              ? 'Couldn’t fetch the latest news.'
                              : `No recent news for ${displayName}.`}
                    </p>
                    {refreshError ? (
                        <p className="text-xs text-rose-300/80 text-pretty break-words">{refreshError}</p>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <ul className="divide-y divide-white/10">
            {items.map(item => {
                const dateLabel = item.postedAtMs !== null ? formatPostedRelative(item.postedAtMs, nowMs) : null;
                const sentiment = item.sentiment ?? 'neutral';

                return (
                    <li key={item.key} className="min-w-0">
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                'group block min-w-0 px-4 py-3 text-left transition-colors duration-200',
                                'hover:bg-white/[0.06]',
                                'focus-visible:outline-none focus-visible:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20',
                            )}
                        >
                            <div className="flex items-start gap-1.5">
                                <span className="text-xs font-semibold text-white group-hover:text-white/95 text-pretty line-clamp-3 flex-1 min-w-0">
                                    {item.title}
                                </span>
                                <IconRighttriangleFill
                                    className="size-2.5 shrink-0 fill-primary/30 rotate-[-90deg] mt-0.5 opacity-0 group-hover:opacity-100"
                                    aria-hidden
                                />
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 pointer-events-none">
                                {dateLabel ? (
                                    <div className="flex items-center gap-1.5">
                                        <IconArrowTurnDownRight className="size-3 shrink-0 fill-primary/50" aria-hidden />
                                        <span className="text-xs text-primary/50">{dateLabel}</span>
                                    </div>
                                ) : null}

                                {item.sentiment ? (
                                    <Badge variant={sentimentBadgeVariant(sentiment)} className="gap-1">
                                        {sentiment === 'bullish' ? (
                                            <IconThermometerSun className="size-3 shrink-0 fill-emerald-400" aria-hidden />
                                        ) : sentiment === 'bearish' ? (
                                            <IconThermometerSnowflake className="size-3 shrink-0 fill-rose-400" aria-hidden />
                                        ) : (
                                            <IconThermometerLow className="size-3 shrink-0 fill-amber-400" aria-hidden />
                                        )}
                                        <span
                                            className={cn(
                                                'text-xs',
                                                sentiment === 'bullish'
                                                    ? 'text-emerald-400'
                                                    : sentiment === 'bearish'
                                                      ? 'text-rose-400'
                                                      : 'text-amber-400',
                                            )}
                                        >
                                            {sentimentLabel(sentiment)}
                                        </span>
                                    </Badge>
                                ) : item.sentimentPending ? (
                                    <Badge className="border-white/10 bg-white/5 text-muted-foreground">
                                        <Spinner className="size-3 shrink-0 fill-primary/50" aria-hidden />
                                        Sentiment pending
                                    </Badge>
                                ) : null}

                                {item.sourceName ? (
                                    <Badge className="flex items-center gap-1.5 border-white/10 bg-white/5 lowercase max-w-full truncate">
                                        <IconNewspaper className="size-2.5 shrink-0 fill-primary/60" aria-hidden />
                                        <span className="text-xs text-primary/50">{item.sourceName}</span>
                                    </Badge>
                                ) : null}
                            </div>
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

function NewsFeedSkeleton() {
    return (
        <ul className="divide-y divide-white/10" aria-busy="true" aria-label="Loading latest news">
            {NEWS_SKELETON_ROW_KEYS.map(rowKey => (
                <li key={rowKey} className="space-y-1.5 px-4 py-3">
                    <div className="h-3.5 rounded bg-white/10 w-full" />
                    <div className="h-2.5 rounded bg-white/5 w-1/3" />
                </li>
            ))}
        </ul>
    );
}
