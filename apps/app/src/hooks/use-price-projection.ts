'use client';

import { useMemo } from 'react';
import type { Time } from 'lightweight-charts';
import { timeToEpochSeconds } from '@/hooks/use-chart-instance/utils';
import { calculateBBWP } from '@/hooks/market-vision/bbwp';
import { calculateRsiDivergences } from '@/hooks/market-vision/rsi-divergences';
import {
    computePriceProjection,
    olsSlope,
    type ProjectionInputPoint,
    type ProjectionModifiers,
} from '@/lib/price-projection';

interface ProjectionInputBar {
    time: Time;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface PriceProjectionSeries {
    base: Array<{ time: Time; value: number }>;
    bull: Array<{ time: Time; value: number }>;
    bear: Array<{ time: Time; value: number }>;
}

/** Bars of smoother (Hull) history used for the trend-slope blend. */
const SMOOTHER_SLOPE_WINDOW = 20;
/** Divergences older than this fraction of the series don't tilt the cone. */
const DIVERGENCE_RECENCY_RATIO = 0.25;

/**
 * Hull MA slope (log-space, per bar) over its most recent window.
 * Returns null when there isn't enough usable history.
 */
function computeSmootherSlopePerBar(
    smootherLine: Array<{ time: Time; value: number }> | null | undefined,
): number | null {
    if (!smootherLine || smootherLine.length < 10) return null;
    const logValues: number[] = [];
    for (const point of smootherLine.slice(-SMOOTHER_SLOPE_WINDOW)) {
        if (Number.isFinite(point.value) && point.value > 0) logValues.push(Math.log(point.value));
    }
    if (logValues.length < 10) return null;
    return olsSlope(logValues)?.slope ?? null;
}

/** Latest BBWP percentile (0-100), or null when not computable. */
function computeVolRegimePercentile(
    bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>,
): number | null {
    const { bbwp } = calculateBBWP(bars);
    for (let i = bbwp.length - 1; i >= 0; i--) {
        const value = bbwp[i]?.value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
}

/**
 * Sentiment tilt from the most recent RSI divergence (+1 bullish, -1 bearish),
 * ignored when it ended too far back to still be relevant.
 */
function computeSentimentTilt(
    bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>,
): number | null {
    const { divergences } = calculateRsiDivergences(bars);
    if (!divergences.length) return null;

    const recencyCutoff = bars.length - Math.max(8, Math.round(bars.length * DIVERGENCE_RECENCY_RATIO));
    let latest: (typeof divergences)[number] | null = null;
    for (const divergence of divergences) {
        if (divergence.endIndex < recencyCutoff) continue;
        if (!latest || divergence.endIndex > latest.endIndex) latest = divergence;
    }
    if (!latest) return null;
    return latest.type === 'bullish' || latest.type === 'h_bullish' ? 1 : -1;
}

/**
 * Compute a forward price projection (base drift path + bull/bear cone) from
 * historical OHLC closes, modulated by on-page indicators:
 * - Hull MA slope blends 50/50 with the OLS drift (responsive trend)
 * - BBWP percentile scales cone width (vol regime, mean-reverting)
 * - Latest RSI divergence tilts bull/bear band widths (sentiment)
 *
 * Mirrors the use-hull-suite wiring: a single useMemo keyed on data identity.
 * Realtime ~1s ticks flow via `livePriceUsd` and never change `ohlcData`
 * identity, so the projection only recomputes on refetch / timeframe switch.
 */
export function usePriceProjection(
    ohlcData: ProjectionInputBar[],
    enabled: boolean,
    smootherLine?: Array<{ time: Time; value: number }> | null,
): PriceProjectionSeries | null {
    return useMemo(() => {
        if (!enabled || ohlcData.length === 0) return null;

        const inputPoints: ProjectionInputPoint[] = [];
        const indicatorBars: Array<{
            time: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
        }> = [];
        for (const bar of ohlcData) {
            const timeEpochSec = timeToEpochSeconds(bar.time);
            if (timeEpochSec == null) continue;
            inputPoints.push({ timeEpochSec, close: bar.close });
            indicatorBars.push({
                time: timeEpochSec,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: 0,
            });
        }

        const modifiers: ProjectionModifiers = {
            smootherSlopePerBar: computeSmootherSlopePerBar(smootherLine),
            volRegimePercentile: computeVolRegimePercentile(indicatorBars),
            sentimentTilt: computeSentimentTilt(indicatorBars),
        };

        const result = computePriceProjection(inputPoints, modifiers);
        if (!result) return null;

        const toChartPoints = (points: Array<{ timeEpochSec: number; value: number }>) =>
            points.map((point) => ({ time: point.timeEpochSec as Time, value: point.value }));

        return {
            base: toChartPoints(result.base),
            bull: toChartPoints(result.bull),
            bear: toChartPoints(result.bear),
        };
    }, [ohlcData, enabled, smootherLine]);
}
