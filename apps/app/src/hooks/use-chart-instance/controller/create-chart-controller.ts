import {
    createChart,
    CandlestickSeries,
    ColorType,
    CrosshairMode,
    HistogramSeries,
    LastPriceAnimationMode,
    LineSeries,
    LineStyle,
    type MouseEventParams,
    type ISeriesApi,
    type Time,
} from 'lightweight-charts';
import { clearChartScrub, getChartScrubSnapshot, setChartScrub, subscribeToChartScrub } from '@/hooks/chart-scrub-store';
import { CANDLE_DOWN_COLOR, CANDLE_UP_COLOR } from '@/lib/chart-colors';
import { CHART_COLOR_PARSERS } from '@/lib/oklch';
import type {
    ChartHighlightRange,
    ChartType,
    HullSuiteOverlay,
    OHLCVDataPoint,
    PriceDataPoint,
    UseChartInstanceOptions,
    VolumeDataPoint,
} from '../types';
import { timeToEpochSeconds } from '../utils';
import { createAxisOverlay } from '../overlays/axis-overlay';
import { createHighlightOverlay } from '../overlays/highlight-overlay';
import { createTooltipManager } from '../tooltip/tooltip-manager';

export interface ChartController {
    setData: (ohlcvData: OHLCVDataPoint[]) => void;
    /** O(1) last-bar patch for realtime ticks — avoids re-feeding the whole series. */
    updateLivePrice: (priceUsd: number) => void;
    setHighlightRange: (range: ChartHighlightRange | null) => void;
    setHullSuite: (overlay: HullSuiteOverlay | null) => void;
    setCallbacks: (callbacks: Pick<UseChartInstanceOptions, 'onCrosshairMove' | 'onCrosshairTimeMove'>) => void;
    resize: () => void;
    destroy: () => void;
}

interface CreateChartControllerArgs {
    containerEl: HTMLDivElement;
    chartType: ChartType;
    showVolume: boolean;
    isDarkMode?: boolean;
    callbacks: Pick<UseChartInstanceOptions, 'onCrosshairMove' | 'onCrosshairTimeMove'>;
}

export function createChartController({
    containerEl,
    chartType,
    showVolume,
    isDarkMode,
    callbacks,
}: CreateChartControllerArgs): ChartController {
    let onCrosshairMove = callbacks.onCrosshairMove;
    let onCrosshairTimeMove = callbacks.onCrosshairTimeMove;

    const resolvedIsDarkMode =
        isDarkMode ??
        (typeof window !== 'undefined'
            ? window.matchMedia?.('(prefers-color-scheme: dark)').matches || document.documentElement.classList.contains('dark')
            : false);

    // Defensive: ensure the container can host absolute overlays.
    containerEl.style.position = containerEl.style.position || 'relative';

    const chart = createChart(containerEl, {
        handleScale: true,
        handleScroll: true,
        // Hide all price scale tick labels; we render our own axis labels as DOM tags.
        localization: {
            priceFormatter: () => '',
        },
        layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            // We render our own axis labels; keep built-in text readable for the time label.
            textColor: 'oklch(1 0 0)',
            fontFamily: 'var(--font-inter), system-ui, sans-serif',
            attributionLogo: false,
            colorParsers: CHART_COLOR_PARSERS,
        },
        grid: {
            vertLines: { visible: false },
            horzLines: { visible: true, color: 'oklch(0.9264 0.0052 67.76 / 0)', style: LineStyle.Solid },
        },
        rightPriceScale: {
            borderVisible: false,
            autoScale: true,
            scaleMargins: { top: 0.1, bottom: showVolume ? 0.25 : 0.1 },
            minimumWidth: 96,
        },
        crosshair: {
            mode: CrosshairMode.Magnet,
            vertLine: {
                labelVisible: true,
                width: 1,
                // Solid scrub line
                color: 'oklch(0.7118 0.0129 286.07 / 0.55)', // zinc-400/500-ish
                visible: true,
                style: LineStyle.Solid,
                labelBackgroundColor: 'oklch(0.2103 0.0059 285.89)', // zinc-900
            },
            horzLine: {
                // We'll draw our own dashed hover connector in the DOM overlay.
                visible: false,
                // Hide built-in price label; we render our own tag label.
                labelVisible: false,
                labelBackgroundColor: 'oklch(0.2103 0.0059 285.89)',
                color: 'oklch(0.7161 0.0091 56.26 / 0)',
                width: 1,
                style: LineStyle.Dashed,
            },
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderVisible: false,
            borderColor: 'transparent',
        },
    });

    // Series
    let priceSeries: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;
    let highlightPriceSeries: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;
    let volumeSeries: ISeriesApi<'Histogram'> | null = null;
    let mhullSeries: ISeriesApi<'Line'> | null = null;
    let shullSeries: ISeriesApi<'Line'> | null = null;

    const BASE_LINE_COLOR = resolvedIsDarkMode ? 'oklch(1 0 0)' : 'oklch(0 0 0)';
    const VOLUME_BAR_COLOR = resolvedIsDarkMode ? 'oklch(1 0 0 / 0.25)' : 'oklch(0 0 0 / 0.25)';

    function computePriceFormat(value: number | null | undefined): { precision: number; minMove: number } {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            return { precision: 2, minMove: 0.01 };
        }

        const abs = Math.abs(value);
        if (abs >= 1) return { precision: 2, minMove: 0.01 };

        // For micro-priced tokens (e.g. PEPE), the default 2dp scale collapses everything to ~0.
        // Pick enough decimals to show movement while staying bounded.
        const rawPrecision = Math.ceil(-Math.log10(abs)) + 2;
        const precision = Math.min(12, Math.max(2, rawPrecision));
        const minMove = 10 ** -precision;
        return { precision, minMove };
    }

    let lineData: PriceDataPoint[] | null = null;
    let lastAppliedPriceFormatKey: string | null = null;

    if (chartType === 'candlestick') {
        priceSeries = chart.addSeries(CandlestickSeries, {
            upColor: CANDLE_UP_COLOR,
            downColor: CANDLE_DOWN_COLOR,
            borderVisible: true,
            borderUpColor: CANDLE_UP_COLOR,
            borderDownColor: CANDLE_DOWN_COLOR,
            wickUpColor: CANDLE_UP_COLOR,
            wickDownColor: CANDLE_DOWN_COLOR,
            lastValueVisible: false,
            priceLineVisible: false,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });

        highlightPriceSeries = chart.addSeries(CandlestickSeries, {
            upColor: CANDLE_UP_COLOR,
            downColor: CANDLE_DOWN_COLOR,
            borderVisible: true,
            borderUpColor: CANDLE_UP_COLOR,
            borderDownColor: CANDLE_DOWN_COLOR,
            wickUpColor: CANDLE_UP_COLOR,
            wickDownColor: CANDLE_DOWN_COLOR,
            lastValueVisible: false,
            priceLineVisible: false,
            visible: false,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });

        (highlightPriceSeries as ISeriesApi<'Candlestick'>).setData([]);
    } else {
        priceSeries = chart.addSeries(LineSeries, {
            lineWidth: 1,
            lastValueVisible: false,
            visible: true,
            priceLineVisible: false,
            color: BASE_LINE_COLOR,
            // Distinct scrub point (solid fill + white outline)
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 3,
            crosshairMarkerBorderColor: 'oklch(1 0 0)',
            crosshairMarkerBackgroundColor: BASE_LINE_COLOR,
            lastPriceAnimation: LastPriceAnimationMode.Continuous,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });

        highlightPriceSeries = chart.addSeries(LineSeries, {
            lineWidth: 1,
            lastValueVisible: false,
            visible: false,
            priceLineVisible: false,
            color: BASE_LINE_COLOR,
            crosshairMarkerVisible: false,
            lastPriceAnimation: LastPriceAnimationMode.Disabled,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });

        (highlightPriceSeries as ISeriesApi<'Line'>).setData([]);
    }

    if (showVolume) {
        volumeSeries = chart.addSeries(HistogramSeries, {
            // Hide volume tick labels; we render our own axis labels as DOM tags.
            priceFormat: { type: 'custom', formatter: () => '' },
            priceScaleId: 'volume',
            lastValueVisible: false,
        });

        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
            minimumWidth: 120,
        });
    }

    // Tooltip
    const tooltip = createTooltipManager();

    // Map for O(1) OHLC lookup in crosshair handler
    let ohlcvByEpochSecond = new Map<number, OHLCVDataPoint>();
    let safeOhlcvData: OHLCVDataPoint[] = [];

    function normalizeLineSeries(points: HullSuiteOverlay['mhull']): HullSuiteOverlay['mhull'] {
        if (!points || points.length === 0) return [];

        const byEpoch = new Map<number, { time: Time; value: number }>();
        for (const point of points) {
            if (!point) continue;
            const epoch = timeToEpochSeconds(point.time);
            if (epoch == null) continue;
            if (!Number.isFinite(point.value)) continue;
            byEpoch.set(epoch, { time: epoch as Time, value: point.value });
        }

        return Array.from(byEpoch.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, value]) => value);
    }

    // Highlight overlay + Axis overlay
    const highlightOverlay = createHighlightOverlay({
        containerEl,
        chart,
        chartType,
        priceSeries,
        highlightPriceSeries,
        volumeSeries,
        baseLineColor: BASE_LINE_COLOR,
        candleUpColor: CANDLE_UP_COLOR,
        candleDownColor: CANDLE_DOWN_COLOR,
    });

    const axisOverlay = createAxisOverlay({
        containerEl,
        chart,
        priceSeries,
        volumeSeries,
        onAfterUpdate: () => {
            // Keep highlight boundaries aligned when the user pans/zooms/resizes.
            highlightOverlay.updatePositions();
        },
    });

    // Resize handling (ResizeObserver + fallback to window.resize)
    let resizeObserver: ResizeObserver | null = null;
    function resize() {
        chart.applyOptions({
            width: containerEl.clientWidth,
            height: 400,
        });
        axisOverlay.onResize();
        highlightOverlay.updatePositions();
    }

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(containerEl);
    } else {
        window.addEventListener('resize', resize);
    }

    // Keep overlays aligned when the user pans/zooms.
    const handleVisibleRangeChange = () => {
        axisOverlay.scheduleUpdate();
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    // Crosshair -> axis overlay + tooltip + callbacks.
    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
        if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
            tooltip.hide();
            onCrosshairMove?.(null);
            onCrosshairTimeMove?.(null);
            axisOverlay.onCrosshairLeave();
            clearChartScrub();
            return;
        }

        const priceData = param.seriesData.get(priceSeries);
        const volData = volumeSeries ? param.seriesData.get(volumeSeries) : null;

        let currentPrice: number | null = null;
        let currentVolume: number | null = null;
        let currentOhlcData:
            | {
                  open: number;
                  high: number;
                  low: number;
                  close: number;
              }
            | undefined;

        if (priceData) {
            if (chartType === 'candlestick' && 'close' in priceData) {
                currentPrice = priceData.close;
                currentOhlcData = {
                    open: priceData.open,
                    high: priceData.high,
                    low: priceData.low,
                    close: priceData.close,
                };
            } else if ('value' in priceData) {
                currentPrice = priceData.value;

                const epoch = timeToEpochSeconds(param.time);
                const ohlcPoint = epoch == null ? undefined : ohlcvByEpochSecond.get(epoch);
                if (ohlcPoint) {
                    currentOhlcData = {
                        open: ohlcPoint.open,
                        high: ohlcPoint.high,
                        low: ohlcPoint.low,
                        close: ohlcPoint.close,
                    };
                }
            }
        }

        if (volData && 'value' in volData) {
            currentVolume = typeof volData.value === 'number' && Number.isFinite(volData.value) ? volData.value : null;
        }

        onCrosshairMove?.(currentPrice);
        onCrosshairTimeMove?.(param.time ?? null);
        setChartScrub(timeToEpochSeconds(param.time) ?? null, 'price');

        axisOverlay.onCrosshairMove({
            price: currentPrice,
            volume: currentVolume,
            x: param.point.x,
        });

        // Tooltip (fixed to top, moves horizontally with crosshair)
        if (currentPrice && Number.isFinite(currentPrice)) {
            const chartRect = containerEl.getBoundingClientRect();

            const startPrice = safeOhlcvData[0]?.close ?? currentPrice;
            const percentageChange = ((currentPrice - startPrice) / startPrice) * 100;

            tooltip.show({
                price: currentPrice,
                percentageChange,
                timestampMs: Number(param.time) * 1000,
                volume: currentVolume ?? undefined,
                ohlcData: currentOhlcData,
            });

            const { width: tooltipWidth } = tooltip.getSize();

            let left = chartRect.left + param.point.x + 30;
            const top = chartRect.top;

            if (left + tooltipWidth > window.innerWidth - 10) {
                left = chartRect.left + param.point.x - tooltipWidth - 15;
            }

            if (left < 10) left = 10;

            tooltip.setPosition(left, top);
        } else {
            tooltip.hide();
        }
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const SECONDS_PER_DAY = 24 * 60 * 60;

    let lastDataBounds: { firstEpoch: number; lastEpoch: number; length: number } | null = null;

    function shouldFitContent(next: { firstEpoch: number; lastEpoch: number; length: number }): boolean {
        if (!lastDataBounds) return true;

        // Avoid resetting the user's view for append-only updates (e.g. 1 new candle).
        const lengthRatio = lastDataBounds.length > 0 ? next.length / lastDataBounds.length : 1;
        if (lengthRatio < 0.75 || lengthRatio > 1.5) return true;

        // If the dataset start shifts a lot, it's almost certainly a timeframe switch.
        if (Math.abs(next.firstEpoch - lastDataBounds.firstEpoch) > 2 * SECONDS_PER_DAY) return true;

        return false;
    }

    // Shared scrub line overlay (shows cross-chart time alignment).
    const scrubLineEl = document.createElement('div');
    scrubLineEl.setAttribute('aria-hidden', 'true');
    scrubLineEl.style.position = 'absolute';
    scrubLineEl.style.top = '0';
    scrubLineEl.style.bottom = '0';
    scrubLineEl.style.width = '1px';
    scrubLineEl.style.transform = 'translateX(-9999px)';
    scrubLineEl.style.opacity = '0';
    scrubLineEl.style.pointerEvents = 'none';
    scrubLineEl.style.background = resolvedIsDarkMode ? 'oklch(1 0 0 / 0.22)' : 'oklch(0 0 0 / 0.22)';
    scrubLineEl.style.zIndex = '5';
    containerEl.appendChild(scrubLineEl);

    function updateScrubLine() {
        const scrub = getChartScrubSnapshot();
        if (scrub.epochSeconds == null || scrub.sourceId === 'price') {
            scrubLineEl.style.opacity = '0';
            scrubLineEl.style.transform = 'translateX(-9999px)';
            return;
        }

        const x = chart.timeScale().timeToCoordinate(scrub.epochSeconds as Time);
        if (x == null || !Number.isFinite(x)) {
            scrubLineEl.style.opacity = '0';
            scrubLineEl.style.transform = 'translateX(-9999px)';
            return;
        }

        scrubLineEl.style.opacity = '1';
        scrubLineEl.style.transform = `translateX(${Math.round(x)}px)`;
    }

    const unsubscribeScrub = subscribeToChartScrub(() => updateScrubLine());
    chart.timeScale().subscribeVisibleTimeRangeChange(updateScrubLine);
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateScrubLine);
    updateScrubLine();

    function setData(ohlcvData: OHLCVDataPoint[]) {
        // Defensive: prevent lightweight-charts from crashing on invalid points.
        safeOhlcvData = ohlcvData.filter(d => {
            if (!d || d.time === undefined || d.time === null) return false;
            if (
                !Number.isFinite(d.open) ||
                !Number.isFinite(d.high) ||
                !Number.isFinite(d.low) ||
                !Number.isFinite(d.close)
            )
                return false;
            return true;
        });

        // Normalize: lightweight-charts requires strictly ascending, unique times.
        // We coerce all times to epoch-seconds and dedupe by that key.
        const uniqueByEpoch = new Map<number, OHLCVDataPoint>();
        for (const d of safeOhlcvData) {
            const epoch = timeToEpochSeconds(d.time);
            if (epoch == null) continue;

            const existing = uniqueByEpoch.get(epoch);
            if (!existing) {
                uniqueByEpoch.set(epoch, { ...d, time: epoch as Time });
                continue;
            }

            // Prefer the latest datapoint while preserving any defined volume.
            uniqueByEpoch.set(epoch, {
                ...existing,
                ...d,
                time: epoch as Time,
                volume: d.volume ?? existing.volume,
            });
        }

        safeOhlcvData = Array.from(uniqueByEpoch.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, d]) => d);

        // Rebuild map for tooltip OHLC lookup.
        ohlcvByEpochSecond = new Map<number, OHLCVDataPoint>();
        for (const d of safeOhlcvData) {
            const epoch = timeToEpochSeconds(d.time);
            if (epoch == null) continue;
            ohlcvByEpochSecond.set(epoch, d);
        }

        const dataLastPrice =
            safeOhlcvData.length > 0 ? (safeOhlcvData[safeOhlcvData.length - 1]?.close ?? null) : null;

        const nextFormat = computePriceFormat(dataLastPrice);
        const nextFormatKey = `${nextFormat.precision}:${nextFormat.minMove}`;
        if (nextFormatKey !== lastAppliedPriceFormatKey) {
            lastAppliedPriceFormatKey = nextFormatKey;
            priceSeries.applyOptions({
                priceFormat: { type: 'price', precision: nextFormat.precision, minMove: nextFormat.minMove },
            });
            highlightPriceSeries.applyOptions({
                priceFormat: { type: 'price', precision: nextFormat.precision, minMove: nextFormat.minMove },
            });
        }

        if (chartType === 'candlestick') {
            (priceSeries as ISeriesApi<'Candlestick'>).setData(safeOhlcvData);
        } else {
            lineData = safeOhlcvData.map(d => ({ time: d.time, value: d.close }));
            (priceSeries as ISeriesApi<'Line'>).setData(lineData);
        }

        // Volume data
        let dataLastVolume: number | null = null;
        const volumeData: VolumeDataPoint[] = volumeSeries
            ? safeOhlcvData
                  .filter(d => d.volume !== undefined && Number.isFinite(d.volume))
                  .map(d => ({
                      time: d.time,
                      value: d.volume ?? 0,
                      color: VOLUME_BAR_COLOR,
                  }))
            : [];

        if (volumeSeries) {
            volumeSeries.setData(volumeData);
            dataLastVolume = volumeData.length > 0 ? (volumeData[volumeData.length - 1]?.value ?? null) : null;
        }

        axisOverlay.setFallbackValues({ dataLastPrice, dataLastVolume });
        highlightOverlay.setData({ ohlcvData: safeOhlcvData, lineData, volumeData });

        const firstEpoch = safeOhlcvData.length ? timeToEpochSeconds(safeOhlcvData[0]!.time) : null;
        const lastEpoch = safeOhlcvData.length ? timeToEpochSeconds(safeOhlcvData[safeOhlcvData.length - 1]!.time) : null;

        if (firstEpoch != null && lastEpoch != null && safeOhlcvData.length >= 2) {
            const nextBounds = { firstEpoch, lastEpoch, length: safeOhlcvData.length };
            if (shouldFitContent(nextBounds)) chart.timeScale().fitContent();
            lastDataBounds = nextBounds;
        } else {
            chart.timeScale().fitContent();
            lastDataBounds = null;
        }

        resize();
        updateScrubLine();
    }

    // Patch only the last bar with a realtime spot price. lightweight-charts'
    // series.update() is O(1) — the previous approach re-ran setData() (full
    // series normalization + re-feed) on every ~1s tick.
    function updateLivePrice(priceUsd: number) {
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) return;
        if (safeOhlcvData.length === 0) return;

        const last = safeOhlcvData[safeOhlcvData.length - 1]!;
        const prevClose = Number.isFinite(last.close) ? last.close : priceUsd;
        const prevHigh = Number.isFinite(last.high) ? last.high : prevClose;
        const prevLow = Number.isFinite(last.low) ? last.low : prevClose;
        if (last.close === priceUsd && prevHigh >= priceUsd && prevLow <= priceUsd) return;

        const updated: OHLCVDataPoint = {
            ...last,
            close: priceUsd,
            high: Math.max(prevHigh, priceUsd),
            low: Math.min(prevLow, priceUsd),
        };
        safeOhlcvData[safeOhlcvData.length - 1] = updated;

        const epoch = timeToEpochSeconds(updated.time);
        if (epoch != null) ohlcvByEpochSecond.set(epoch, updated);

        if (chartType === 'candlestick') {
            (priceSeries as ISeriesApi<'Candlestick'>).update(updated);
        } else {
            const linePoint: PriceDataPoint = { time: updated.time, value: priceUsd };
            if (lineData && lineData.length > 0) lineData[lineData.length - 1] = linePoint;
            (priceSeries as ISeriesApi<'Line'>).update(linePoint);
        }

        axisOverlay.scheduleUpdate();
    }

    function setHighlightRange(range: ChartHighlightRange | null) {
        highlightOverlay.setRange(range);
        axisOverlay.scheduleUpdate();
    }

    function setHullSuite(overlay: HullSuiteOverlay | null) {
        if (!overlay || (!overlay.mhull?.length && !overlay.shull?.length)) {
            mhullSeries?.applyOptions({ visible: false });
            shullSeries?.applyOptions({ visible: false });
            if (mhullSeries) mhullSeries.setData([]);
            if (shullSeries) shullSeries.setData([]);
            return;
        }

        const lineStyle = overlay.lineStyle === 'dotted' ? LineStyle.Dotted : LineStyle.Solid;
        const lineWidth = overlay.lineWidth ?? 1;
        const color = overlay.color ?? (resolvedIsDarkMode ? 'oklch(1 0 0 / 0.45)' : 'oklch(0 0 0 / 0.55)');

        if (!mhullSeries) {
            mhullSeries = chart.addSeries(LineSeries, {
                lineWidth,
                color,
                lineStyle,
                lastValueVisible: false,
                priceLineVisible: false,
                visible: true,
            });
        } else {
            mhullSeries.applyOptions({ lineWidth, color, lineStyle, visible: true });
        }

        if (!shullSeries) {
            shullSeries = chart.addSeries(LineSeries, {
                lineWidth,
                color,
                lineStyle,
                lastValueVisible: false,
                priceLineVisible: false,
                visible: true,
            });
        } else {
            shullSeries.applyOptions({ lineWidth, color, lineStyle, visible: true });
        }

        const mhull = overlay.mhull?.length ? normalizeLineSeries(overlay.mhull) : [];
        const shull = overlay.shull?.length ? normalizeLineSeries(overlay.shull) : [];

        mhullSeries.setData(mhull);
        shullSeries.setData(shull);
    }

    function setCallbacks(next: Pick<UseChartInstanceOptions, 'onCrosshairMove' | 'onCrosshairTimeMove'>) {
        onCrosshairMove = next.onCrosshairMove;
        onCrosshairTimeMove = next.onCrosshairTimeMove;
    }

    function destroy() {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(updateScrubLine);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateScrubLine);
        unsubscribeScrub();

        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        } else {
            window.removeEventListener('resize', resize);
        }

        tooltip.hide();
        tooltip.destroy();
        axisOverlay.destroy();
        highlightOverlay.destroy();

        if (containerEl.contains(scrubLineEl)) {
            containerEl.removeChild(scrubLineEl);
        }

        chart.remove();
    }

    // Initial size
    resize();

    return { setData, updateLivePrice, setHighlightRange, setHullSuite, setCallbacks, resize, destroy };
}
