import { describe, expect, it } from 'bun:test';

import {
    countUnseenFloatingMarketFeedItems,
    DEFAULT_FLOATING_MARKET_FEED_SETTINGS,
    getNextFloatingMarketFeedSize,
    isFloatingMarketFeedSize,
    recordFloatingMarketFeedLastSeen,
    resolveNextFloatingMarketFeedSettings,
    sanitizeFloatingMarketFeedLastSeen,
    sanitizeFloatingMarketFeedSettings,
} from './floating-market-feed-utils';

describe('floating market feed settings', () => {
    it('sanitizes invalid persisted settings to defaults', () => {
        expect(JSON.stringify(sanitizeFloatingMarketFeedSettings(null))).toBe(
            JSON.stringify(DEFAULT_FLOATING_MARKET_FEED_SETTINGS),
        );
        expect(JSON.stringify(sanitizeFloatingMarketFeedSettings({ feedSize: 100 }))).toBe(
            JSON.stringify(DEFAULT_FLOATING_MARKET_FEED_SETTINGS),
        );
    });

    it('keeps a valid persisted feed size', () => {
        expect(sanitizeFloatingMarketFeedSettings({ feedSize: 50 }).feedSize).toBe(50);
    });

    it('drops legacy source fields from persisted settings', () => {
        const sanitized = sanitizeFloatingMarketFeedSettings({ feedSize: 15, showNews: true, showTweets: true });
        expect(JSON.stringify(sanitized)).toBe(JSON.stringify({ feedSize: 15 }));
    });

    it('defaults to 25 pulled items', () => {
        expect(DEFAULT_FLOATING_MARKET_FEED_SETTINGS.feedSize).toBe(25);
    });

    it('accepts only 15, 25, and 50 as feed sizes', () => {
        expect(isFloatingMarketFeedSize(15)).toBe(true);
        expect(isFloatingMarketFeedSize(25)).toBe(true);
        expect(isFloatingMarketFeedSize(50)).toBe(true);
        expect(isFloatingMarketFeedSize(10)).toBe(false);
        expect(isFloatingMarketFeedSize(20)).toBe(false);
    });

    it('cycles feed sizes in display order', () => {
        expect(getNextFloatingMarketFeedSize(15)).toBe(25);
        expect(getNextFloatingMarketFeedSize(25)).toBe(50);
        expect(getNextFloatingMarketFeedSize(50)).toBe(15);
    });

    it('applies patches and sanitizes the result', () => {
        expect(resolveNextFloatingMarketFeedSettings({ feedSize: 25 }, { feedSize: 50 }).feedSize).toBe(50);
        expect(
            resolveNextFloatingMarketFeedSettings({ feedSize: 25 }, { feedSize: 999 as never }).feedSize,
        ).toBe(25);
    });
});

describe('floating market feed last-seen tracking', () => {
    it('sanitizes persisted last-seen maps', () => {
        expect(sanitizeFloatingMarketFeedLastSeen(null)).toEqual({});
        expect(sanitizeFloatingMarketFeedLastSeen([1, 2])).toEqual({});
        expect(
            sanitizeFloatingMarketFeedLastSeen({ bitcoin: 1000, bad: 'nope', zero: 0, neg: -5, inf: Number.POSITIVE_INFINITY }),
        ).toEqual({ bitcoin: 1000 });
    });

    it('records the newest seen timestamp per coin and never regresses', () => {
        const first = recordFloatingMarketFeedLastSeen({}, 'bitcoin', 1000);
        expect(first).toEqual({ bitcoin: 1000 });
        expect(recordFloatingMarketFeedLastSeen(first, 'bitcoin', 500)).toEqual({ bitcoin: 1000 });
        expect(recordFloatingMarketFeedLastSeen(first, 'bitcoin', 2000)).toEqual({ bitcoin: 2000 });
    });

    it('ignores invalid records', () => {
        expect(recordFloatingMarketFeedLastSeen({ bitcoin: 1 }, '', 1000)).toEqual({ bitcoin: 1 });
        expect(recordFloatingMarketFeedLastSeen({ bitcoin: 1 }, 'ethereum', 0)).toEqual({ bitcoin: 1 });
    });

    it('evicts the least recently seen coins past the limit', () => {
        const map = { a: 10, b: 20, c: 30 };
        const next = recordFloatingMarketFeedLastSeen(map, 'd', 40, 3);
        expect(next).toEqual({ b: 20, c: 30, d: 40 });
    });

    it('counts items posted after last seen', () => {
        expect(countUnseenFloatingMarketFeedItems([100, 200, 300, null], 150)).toBe(2);
        expect(countUnseenFloatingMarketFeedItems([100, 200], 0)).toBe(2);
        expect(countUnseenFloatingMarketFeedItems([100, 200], 200)).toBe(0);
        expect(countUnseenFloatingMarketFeedItems([], 0)).toBe(0);
    });
});
