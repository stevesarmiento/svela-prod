'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartHighlightRange, OHLCVDataPoint, UseChartInstanceOptions } from './types';
import { createChartController, type ChartController } from './controller/create-chart-controller';
import { timeToEpochSeconds } from './utils';

export type { ChartHighlightRange, HullSuiteOverlay, UseChartInstanceOptions } from './types';

export function useChartInstance(ohlcvData: OHLCVDataPoint[], options: UseChartInstanceOptions = {}) {
    const {
        chartType = 'candlestick',
        showVolume = true,
        livePriceUsd = null,
        onCrosshairMove,
        onCrosshairTimeMove,
        isDarkMode,
        hullSuite = null,
        highlightRange = null,
    } = options;

    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
    const chartContainerRef = useCallback((node: HTMLDivElement | null) => {
        setContainerEl(node)
    }, [])
    const controllerRef = useRef<ChartController | null>(null);

    const callbacksRef = useRef<Pick<UseChartInstanceOptions, 'onCrosshairMove' | 'onCrosshairTimeMove'>>({
        onCrosshairMove,
        onCrosshairTimeMove,
    });
    callbacksRef.current.onCrosshairMove = onCrosshairMove;
    callbacksRef.current.onCrosshairTimeMove = onCrosshairTimeMove;

    // Keep callbacks updated without recreating the chart.
    useEffect(() => {
        controllerRef.current?.setCallbacks({ onCrosshairMove, onCrosshairTimeMove });
    }, [onCrosshairMove, onCrosshairTimeMove]);

    // (Re)create the chart only when the structure changes.
    useEffect(() => {
        if (!containerEl) return;

        const controller = createChartController({
            containerEl,
            chartType,
            showVolume,
            isDarkMode,
            callbacks: callbacksRef.current,
        });

        controllerRef.current = controller;

        return () => {
            controller.destroy();
            if (controllerRef.current === controller) controllerRef.current = null;
        };
    }, [containerEl, chartType, showVolume, isDarkMode]);

    // Track the latest realtime price so it can be re-applied after setData
    // (a fresh series feed resets the last bar to the server value).
    const livePriceRef = useRef<number | null>(livePriceUsd);
    livePriceRef.current = livePriceUsd;

    // Data updates should not recreate the chart.
    useEffect(() => {
        controllerRef.current?.setData(ohlcvData);
        if (livePriceRef.current != null) {
            controllerRef.current?.updateLivePrice(livePriceRef.current);
        }
    }, [ohlcvData]);

    // Realtime ticks are O(1) last-bar updates — they must never re-feed the
    // whole series (the old code rebuilt + setData() on every ~1s tick).
    useEffect(() => {
        if (livePriceUsd == null) return;
        controllerRef.current?.updateLivePrice(livePriceUsd);
    }, [livePriceUsd]);

    // Overlay updates should not recreate the chart.
    const hasHullSuite = !!(hullSuite?.mhull?.length || hullSuite?.shull?.length);
    useEffect(() => {
        controllerRef.current?.setHullSuite(hasHullSuite ? hullSuite : null);
    }, [hasHullSuite, hullSuite]);

    // Highlight updates should not recreate the chart.
    const highlightFromEpochSec = highlightRange ? timeToEpochSeconds(highlightRange.from) : null;
    const highlightToEpochSec = highlightRange ? timeToEpochSeconds(highlightRange.to) : null;
    const highlightDimOpacity = highlightRange?.dimOpacity ?? null;
    const highlightBoundaryColor = highlightRange?.boundaryColor ?? null;

    useEffect(() => {
        const range: ChartHighlightRange | null = highlightRange ?? null;
        controllerRef.current?.setHighlightRange(range);
    }, [highlightFromEpochSec, highlightToEpochSec, highlightDimOpacity, highlightBoundaryColor, highlightRange]);

    return chartContainerRef;
}
