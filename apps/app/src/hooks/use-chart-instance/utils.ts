import type { Time } from 'lightweight-charts';
import { withAlpha } from '@/lib/oklch';

export function formatUsdVolume(value: number) {
    if (!Number.isFinite(value)) return '$0';
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
}

export function formatUsdPrice(value: number) {
    if (!Number.isFinite(value)) return '$0.00';
    return (
        `$${value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`
    );
}

export function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

interface BusinessDay {
    year: number;
    month: number;
    day: number;
}

function isBusinessDay(value: unknown): value is BusinessDay {
    if (!value || typeof value !== 'object') return false;
    return (
        'year' in value &&
        'month' in value &&
        'day' in value &&
        typeof (value as { year?: unknown }).year === 'number' &&
        typeof (value as { month?: unknown }).month === 'number' &&
        typeof (value as { day?: unknown }).day === 'number'
    );
}

export function normalizeChartTime(time: Time): Time {
    // Birdeye returns seconds, but callers sometimes pass milliseconds.
    if (typeof time === 'number') return (time > 1e10 ? Math.floor(time / 1000) : Math.floor(time)) as Time;
    return time;
}

export function timeToEpochSeconds(time: Time): number | null {
    const normalized = normalizeChartTime(time);
    if (typeof normalized === 'number') return normalized;
    if (typeof normalized === 'string') {
        const ms = Date.parse(normalized);
        if (!Number.isFinite(ms)) return null;
        return Math.floor(ms / 1000);
    }
    if (isBusinessDay(normalized)) {
        const ms = Date.UTC(normalized.year, normalized.month - 1, normalized.day, 0, 0, 0, 0);
        return Math.floor(ms / 1000);
    }
    return null;
}

export function isTimeInEpochRange(time: Time, fromEpochSec: number, toEpochSec: number): boolean {
    const t = timeToEpochSeconds(time);
    if (t == null) return false;
    return t >= fromEpochSec && t < toEpochSec;
}

/**
 * Set the alpha of an `oklch()` color string (all chart colors are oklch;
 * the custom colorParsers bridge handles canvas parsing). Non-oklch inputs
 * are returned unchanged.
 */
export function toRgba(color: string, alpha: number): string {
    return withAlpha(color.trim(), clampNumber(alpha, 0, 1));
}

export function getSeriesValue(data: unknown): number | null {
    if (!data || typeof data !== 'object') return null;
    if ('close' in data && typeof (data as { close?: unknown }).close === 'number')
        return (data as { close: number }).close;
    if ('value' in data && typeof (data as { value?: unknown }).value === 'number')
        return (data as { value: number }).value;
    return null;
}
