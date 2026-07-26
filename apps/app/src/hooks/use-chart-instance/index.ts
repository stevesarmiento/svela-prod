'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartHighlightRange, OHLCVDataPoint, UseChartInstanceOptions } from './types';
import { createChartController, type ChartController } from './controller/create-chart-controller';
import { timeToEpochSeconds } from './utils';

export type { ChartHighlightRange, HullSuiteOverlay, MarketCapOverlay, ProjectionOverlay, UseChartInstanceOptions } from './types';

export function useChartInstance(ohlcvData: OHLCVDataPoint[], options: UseChartInstanceOptions = {}) {
    const {
        chartType = 'candlestick',
        showVolume = true,
        showPrice = true,
        livePriceUsd = null,
        onCrosshairMove,
        onCrosshairTimeMove,
        isDarkMode,
        hullSuite = null,
        marketCap = null,
        projection = null,
        highlightRange = null,
        showPriceExtrema = false,
    } = options;

    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
    const chartContainerRef = useCallback((node: HTMLDivElement | null) => {
        setContainerEl(node)
    }, [])
    const controllerRef = useRef<ChartController | null>(null);
    // Bumped every time a controller is (re)created so the update effects
    // below re-run and feed the fresh (empty) chart. Without this, a chart
    // created *after* the last data-identity change never receives setData —
    // e.g. on first load, where the container div only mounts once data is
    // ready, the controller is created one render later than the data change
    // and the chart stays empty until the next refetch.
    const [controllerGeneration, setControllerGeneration] = useState(0);

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
            showPriceExtrema,
            isDarkMode,
            callbacks: callbacksRef.current,
        });

        controllerRef.current = controller;
        setControllerGeneration((generation) => generation + 1);

        return () => {
            controller.destroy();
            if (controllerRef.current === controller) controllerRef.current = null;
        };
    }, [containerEl, chartType, showVolume, showPriceExtrema, isDarkMode]);

    // Track the latest realtime price so it can be re-applied after setData
    // (a fresh series feed resets the last bar to the server value). Synced in
    // an effect declared before the data effect so it stays fresh for setData.
    const livePriceRef = useRef<number | null>(livePriceUsd);
    useEffect(() => {
        livePriceRef.current = livePriceUsd;
    }, [livePriceUsd]);

    // Data updates should not recreate the chart.
    useEffect(() => {
        controllerRef.current?.setData(ohlcvData);
        if (livePriceRef.current != null) {
            controllerRef.current?.updateLivePrice(livePriceRef.current);
        }
    }, [ohlcvData, controllerGeneration]);

    // Realtime ticks are O(1) last-bar updates — they must never re-feed the
    // whole series (the old code rebuilt + setData() on every ~1s tick).
    useEffect(() => {
        if (livePriceUsd == null) return;
        controllerRef.current?.updateLivePrice(livePriceUsd);
    }, [livePriceUsd]);

    useEffect(() => {
        controllerRef.current?.setPriceVisible(showPrice);
    }, [showPrice, controllerGeneration]);

    // Overlay updates should not recreate the chart.
    const hasHullSuite = !!(hullSuite?.mhull?.length || hullSuite?.shull?.length);
    useEffect(() => {
        controllerRef.current?.setHullSuite(hasHullSuite ? hullSuite : null);
    }, [hasHullSuite, hullSuite, controllerGeneration]);

    // Market cap overlay updates should not recreate the chart.
    const hasMarketCap = !!marketCap?.points?.length;
    useEffect(() => {
        controllerRef.current?.setMarketCap(hasMarketCap ? marketCap : null);
    }, [hasMarketCap, marketCap, controllerGeneration]);

    // Projection updates should not recreate the chart.
    const hasProjection = !!projection?.base?.length;
    useEffect(() => {
        controllerRef.current?.setProjection(hasProjection ? projection : null);
    }, [hasProjection, projection, controllerGeneration]);

    // Highlight updates should not recreate the chart.
    const highlightFromEpochSec = highlightRange ? timeToEpochSeconds(highlightRange.from) : null;
    const highlightToEpochSec = highlightRange ? timeToEpochSeconds(highlightRange.to) : null;
    const highlightDimOpacity = highlightRange?.dimOpacity ?? null;
    const highlightBoundaryColor = highlightRange?.boundaryColor ?? null;

    useEffect(() => {
        const range: ChartHighlightRange | null = highlightRange ?? null;
        controllerRef.current?.setHighlightRange(range);
    }, [highlightFromEpochSec, highlightToEpochSec, highlightDimOpacity, highlightBoundaryColor, highlightRange, controllerGeneration]);

    return chartContainerRef;
}
