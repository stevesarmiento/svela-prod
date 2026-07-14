export type FloatingMarketFeedSize = 15 | 25 | 50;

export interface FloatingMarketFeedSettings {
    feedSize: FloatingMarketFeedSize;
}

export const FLOATING_MARKET_FEED_SIZE_OPTIONS = [15, 25, 50] as const satisfies readonly FloatingMarketFeedSize[];

export const DEFAULT_FLOATING_MARKET_FEED_SETTINGS: FloatingMarketFeedSettings = {
    feedSize: 25,
};

function isSettingsRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isFloatingMarketFeedSize(value: unknown): value is FloatingMarketFeedSize {
    return FLOATING_MARKET_FEED_SIZE_OPTIONS.includes(value as FloatingMarketFeedSize);
}

export function getNextFloatingMarketFeedSize(current: FloatingMarketFeedSize): FloatingMarketFeedSize {
    const currentIndex = FLOATING_MARKET_FEED_SIZE_OPTIONS.indexOf(current);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % FLOATING_MARKET_FEED_SIZE_OPTIONS.length;
    return FLOATING_MARKET_FEED_SIZE_OPTIONS[nextIndex] ?? DEFAULT_FLOATING_MARKET_FEED_SETTINGS.feedSize;
}

export function sanitizeFloatingMarketFeedSettings(value: unknown): FloatingMarketFeedSettings {
    if (!isSettingsRecord(value)) return DEFAULT_FLOATING_MARKET_FEED_SETTINGS;

    const feedSize = isFloatingMarketFeedSize(value.feedSize)
        ? value.feedSize
        : DEFAULT_FLOATING_MARKET_FEED_SETTINGS.feedSize;

    return { feedSize };
}

export function resolveNextFloatingMarketFeedSettings(
    previous: FloatingMarketFeedSettings,
    patch: Partial<FloatingMarketFeedSettings>,
): FloatingMarketFeedSettings {
    return sanitizeFloatingMarketFeedSettings({
        ...previous,
        ...patch,
    });
}

export function getFloatingMarketFeedTitle(_settings: FloatingMarketFeedSettings): string {
    return 'Latest News';
}

/** Per-coin "news last seen at" timestamps, persisted in localStorage. */
export type FloatingMarketFeedLastSeenMap = Record<string, number>;

export const FLOATING_MARKET_FEED_LAST_SEEN_LIMIT = 100;

export function sanitizeFloatingMarketFeedLastSeen(value: unknown): FloatingMarketFeedLastSeenMap {
    if (!isSettingsRecord(value)) return {};

    const out: FloatingMarketFeedLastSeenMap = {};
    for (const [coinId, seenAtMs] of Object.entries(value)) {
        if (typeof seenAtMs === 'number' && Number.isFinite(seenAtMs) && seenAtMs > 0) {
            out[coinId] = seenAtMs;
        }
    }
    return out;
}

/**
 * Records when a coin's news was last seen. Keeps the map bounded by evicting
 * the least recently seen coins once past `limit`.
 */
export function recordFloatingMarketFeedLastSeen(
    map: FloatingMarketFeedLastSeenMap,
    coinId: string,
    seenAtMs: number,
    limit: number = FLOATING_MARKET_FEED_LAST_SEEN_LIMIT,
): FloatingMarketFeedLastSeenMap {
    if (!coinId || !Number.isFinite(seenAtMs) || seenAtMs <= 0) return map;

    const next: FloatingMarketFeedLastSeenMap = {
        ...map,
        [coinId]: Math.max(seenAtMs, map[coinId] ?? 0),
    };

    const coinIds = Object.keys(next);
    if (coinIds.length <= limit) return next;

    const evictable = coinIds.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0)).slice(0, coinIds.length - limit);
    for (const evicted of evictable) delete next[evicted];
    return next;
}

/** How many items were posted after the news was last seen. */
export function countUnseenFloatingMarketFeedItems(
    postedAtTimes: ReadonlyArray<number | null>,
    lastSeenMs: number,
): number {
    let unseen = 0;
    for (const postedAtMs of postedAtTimes) {
        if (postedAtMs !== null && Number.isFinite(postedAtMs) && postedAtMs > lastSeenMs) unseen++;
    }
    return unseen;
}
