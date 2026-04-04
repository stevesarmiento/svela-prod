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

    // Data updates should not recreate the chart.
    useEffect(() => {
        controllerRef.current?.setData(ohlcvData);
    }, [ohlcvData]);

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
