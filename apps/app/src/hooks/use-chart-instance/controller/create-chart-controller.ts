import {
    createChart,
    createSeriesMarkers,
    CandlestickSeries,
    ColorType,
    CrosshairMode,
    HistogramSeries,
    LastPriceAnimationMode,
    LineSeries,
    LineStyle,
    type IPriceLine,
    type ISeriesMarkersPluginApi,
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
    MarketCapOverlay,
    OHLCVDataPoint,
    PriceDataPoint,
    PriceExtremaMarker,
    ProjectionOverlay,
    UseChartInstanceOptions,
    VolumeDataPoint,
} from '../types';
import { formatUsdPrice, timeToEpochSeconds, toRgba } from '../utils';
import { createAxisOverlay } from '../overlays/axis-overlay';
import { createHighlightOverlay } from '../overlays/highlight-overlay';
import { createTooltipManager } from '../tooltip/tooltip-manager';

export interface ChartController {
    setData: (ohlcvData: OHLCVDataPoint[]) => void;
    /** O(1) last-bar patch for realtime ticks — avoids re-feeding the whole series. */
    updateLivePrice: (priceUsd: number) => void;
    setPriceVisible: (visible: boolean) => void;
    setHighlightRange: (range: ChartHighlightRange | null) => void;
    setHullSuite: (overlay: HullSuiteOverlay | null) => void;
    setMarketCap: (overlay: MarketCapOverlay | null) => void;
    setProjection: (overlay: ProjectionOverlay | null) => void;
    setCallbacks: (callbacks: Pick<UseChartInstanceOptions, 'onCrosshairMove' | 'onCrosshairTimeMove'>) => void;
    resize: () => void;
    destroy: () => void;
}

interface CreateChartControllerArgs {
    containerEl: HTMLDivElement;
    chartType: ChartType;
    showVolume: boolean;
    showPriceExtrema?: boolean;
    isDarkMode?: boolean;
    callbacks: Pick<UseChartInstanceOptions, 'onCrosshairMove' | 'onCrosshairTimeMove'>;
}

export function createChartController({
    containerEl,
    chartType,
    showVolume,
    showPriceExtrema = false,
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
    let marketCapSeries: ISeriesApi<'Line'> | null = null;
    let marketCapHighlightSeries: ISeriesApi<'Line'> | null = null;
    // Raw market cap (USD) by epoch for the tooltip — the plotted series is
    // rebased into price space (see setMarketCap), so its values aren't dollars-of-mcap.
    let marketCapRawByEpoch = new Map<number, number>();
    // Kept so setData can re-anchor the rebased series when price data changes.
    let currentMarketCapOverlay: MarketCapOverlay | null = null;
    let projBaseSeries: ISeriesApi<'Line'> | null = null;
    let projBullSeries: ISeriesApi<'Line'> | null = null;
    let projBearSeries: ISeriesApi<'Line'> | null = null;
    let projBaseMarkers: ISeriesMarkersPluginApi<Time> | null = null;
    let projBullMarkers: ISeriesMarkersPluginApi<Time> | null = null;
    let projBearMarkers: ISeriesMarkersPluginApi<Time> | null = null;
    let projectionActive = false;
    let lastProjectionEndEpoch: number | null = null;
    let projectionAnchorEpoch: number | null = null;
    let currentPriceLine: IPriceLine | null = null;
    let isPriceVisible = true;

    const BASE_LINE_COLOR = resolvedIsDarkMode ? 'oklch(1 0 0)' : 'oklch(0 0 0)';
    const VOLUME_BAR_COLOR = resolvedIsDarkMode ? 'oklch(1 0 0 / 0.25)' : 'oklch(0 0 0 / 0.25)';
    const PROJECTION_DIVIDER_LINE_COLOR = resolvedIsDarkMode ? 'oklch(1 0 0 / 0.18)' : 'oklch(0 0 0 / 0.18)';

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

    function computePriceExtremaMarkers(points: PriceDataPoint[] | null): PriceExtremaMarker[] {
        if (!showPriceExtrema || !points || points.length < 2) return [];

        let high: PriceDataPoint | null = null;
        let low: PriceDataPoint | null = null;
        for (const point of points) {
            if (!Number.isFinite(point.value)) continue;
            if (!high || point.value > high.value) high = point;
            if (!low || point.value < low.value) low = point;
        }

        if (!high || !low) return [];

        if (high.time === low.time && high.value === low.value) {
            return [{ time: high.time, value: high.value, label: 'HIGH/LOW', color: PROJECTION_DIVIDER_LINE_COLOR }];
        }

        return [
            { time: high.time, value: high.value, label: 'HIGH', color: PROJECTION_DIVIDER_LINE_COLOR },
            { time: low.time, value: low.value, label: 'LOW', color: PROJECTION_DIVIDER_LINE_COLOR },
        ];
    }

    function updatePriceExtremaMarkers() {
        axisOverlay.setPriceExtremaMarkers(isPriceVisible ? computePriceExtremaMarkers(lineData) : []);
    }

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

    // Guard against use-after-destroy: when cycling between charts the
    // controller can be destroyed while a React effect still holds a stale
    // reference — any lightweight-charts call on the disposed chart throws
    // ("Value is null"). Every public method no-ops once destroyed.
    let isDisposed = false;

    // Resize handling (ResizeObserver + fallback to window.resize)
    let resizeObserver: ResizeObserver | null = null;
    function resize() {
        if (isDisposed) return;
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
            setProjectionReadout(null);
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

        // Tooltip wants raw dollars-of-mcap; the plotted series is rebased
        // into price space, so read from the raw map instead of the series.
        let currentMarketCap: number | null = null;
        if (marketCapSeries?.options().visible) {
            const epoch = timeToEpochSeconds(param.time);
            const raw = epoch == null ? undefined : marketCapRawByEpoch.get(epoch);
            if (typeof raw === 'number' && Number.isFinite(raw)) currentMarketCap = raw;
        }

        // Scrub the projected (future) region like the real series: past the
        // last real bar the price series has no datum, but the projection
        // series do. Use the base path as the scrub price so the header,
        // axis hover tag and cross-chart scrub line all keep working.
        let currentProjection: { base: number; bull: number; bear: number; lastClose: number } | null = null;
        if (currentPrice == null && projectionActive && projBaseSeries) {
            const hoverEpoch = timeToEpochSeconds(param.time);
            const lastBar = safeOhlcvData[safeOhlcvData.length - 1];
            const lastBarEpoch = lastBar ? timeToEpochSeconds(lastBar.time) : null;

            if (hoverEpoch != null && lastBarEpoch != null && hoverEpoch > lastBarEpoch && lastBar) {
                const readLineValue = (series: ISeriesApi<'Line'> | null): number | null => {
                    if (!series) return null;
                    const data = param.seriesData.get(series);
                    if (data && 'value' in data && typeof data.value === 'number' && Number.isFinite(data.value)) {
                        return data.value;
                    }
                    return null;
                };

                const baseValue = readLineValue(projBaseSeries);
                if (baseValue != null) {
                    currentProjection = {
                        base: baseValue,
                        bull: readLineValue(projBullSeries) ?? baseValue,
                        bear: readLineValue(projBearSeries) ?? baseValue,
                        lastClose: lastBar.close,
                    };
                    currentPrice = baseValue;
                }
            }
        }

        onCrosshairMove?.(currentPrice);
        onCrosshairTimeMove?.(param.time ?? null);
        setChartScrub(timeToEpochSeconds(param.time) ?? null, 'price');

        axisOverlay.onCrosshairMove({
            price: currentPrice,
            volume: currentVolume,
            x: param.point.x,
            scenario: currentProjection ? { bull: currentProjection.bull, bear: currentProjection.bear } : null,
        });

        // In the projected region the floating tooltip is replaced by the
        // bull/base/bear readout under the "Projection" label (the bull/bear
        // axis tags come from the axisOverlay scenario above).
        if (currentProjection) {
            tooltip.hide();
            setProjectionReadout({
                bull: currentProjection.bull,
                base: currentProjection.base,
                bear: currentProjection.bear,
            });
            return;
        }
        setProjectionReadout(null);

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
                marketCap: currentMarketCap ?? undefined,
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

    // Projection divider: subtle vertical dashed line at the last real bar
    // (plus a live bull/base/bear readout while scrubbing the projection).
    const dividerLineColor = PROJECTION_DIVIDER_LINE_COLOR;
    const dividerLabelColor = resolvedIsDarkMode ? 'oklch(1 0 0 / 0.45)' : 'oklch(0 0 0 / 0.5)';

    const projectionDividerEl = document.createElement('div');
    projectionDividerEl.setAttribute('aria-hidden', 'true');
    {
        const s = projectionDividerEl.style;
        s.position = 'absolute';
        s.top = '0';
        s.bottom = '0';
        s.left = '0';
        s.width = '1px';
        s.transform = 'translateX(-9999px)';
        s.pointerEvents = 'none';
        s.zIndex = '5';
        s.background = `repeating-linear-gradient(to bottom, ${dividerLineColor} 0px, ${dividerLineColor} 4px, transparent 4px, transparent 8px)`;
    }
    containerEl.appendChild(projectionDividerEl);

    // Live bull/base/bear readout beside the divider — replaces the
    // floating tooltip while scrubbing the projected region.
    const projectionReadoutEl = document.createElement('div');
    projectionReadoutEl.setAttribute('aria-hidden', 'true');
    projectionReadoutEl.className = 'font-berkeley-mono';
    {
        const s = projectionReadoutEl.style;
        s.position = 'absolute';
        s.top = '8px';
        s.left = '0';
        s.display = 'none';
        s.flexDirection = 'column';
        s.gap = '3px';
        s.fontSize = '9px';
        s.letterSpacing = '0.05em';
        s.whiteSpace = 'nowrap';
        s.pointerEvents = 'none';
        s.userSelect = 'none';
        s.zIndex = '6';
        s.transform = 'translateX(-9999px)';
    }
    function makeReadoutRow(label: string): { valueEl: HTMLSpanElement; rowEl: HTMLDivElement } {
        const rowEl = document.createElement('div');
        rowEl.style.display = 'flex';
        rowEl.style.gap = '6px';
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.width = '26px';
        const valueEl = document.createElement('span');
        rowEl.appendChild(labelEl);
        rowEl.appendChild(valueEl);
        projectionReadoutEl.appendChild(rowEl);
        return { valueEl, rowEl };
    }
    const readoutBull = makeReadoutRow('Bull');
    const readoutBase = makeReadoutRow('Base');
    const readoutBear = makeReadoutRow('Bear');
    readoutBase.rowEl.style.color = dividerLabelColor;
    containerEl.appendChild(projectionReadoutEl);

    let projectionReadoutVisible = false;

    function setProjectionReadout(values: { bull: number; base: number; bear: number } | null) {
        projectionReadoutVisible = values != null;
        if (!values) {
            projectionReadoutEl.style.display = 'none';
            return;
        }
        readoutBull.valueEl.textContent = formatUsdPrice(values.bull);
        readoutBase.valueEl.textContent = formatUsdPrice(values.base);
        readoutBear.valueEl.textContent = formatUsdPrice(values.bear);
        projectionReadoutEl.style.display = 'flex';
        updateProjectionDivider();
    }

    function hideProjectionDivider() {
        projectionDividerEl.style.transform = 'translateX(-9999px)';
        projectionReadoutEl.style.transform = 'translateX(-9999px)';
    }

    function updateProjectionDivider() {
        if (!projectionActive || projectionAnchorEpoch == null) {
            hideProjectionDivider();
            return;
        }

        const x = chart.timeScale().timeToCoordinate(projectionAnchorEpoch as Time);
        if (x == null || !Number.isFinite(x) || x < 0 || x > containerEl.clientWidth) {
            hideProjectionDivider();
            return;
        }

        const xRounded = Math.round(x);
        projectionDividerEl.style.transform = `translateX(${xRounded}px)`;
        if (projectionReadoutVisible) {
            projectionReadoutEl.style.transform = `translateX(${xRounded + 8}px)`;
        }
    }

    chart.timeScale().subscribeVisibleTimeRangeChange(updateProjectionDivider);
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateProjectionDivider);

    function setData(ohlcvData: OHLCVDataPoint[]) {
        if (isDisposed) return;
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
            lineData = null;
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
        updatePriceExtremaMarkers();
        highlightOverlay.setData({ ohlcvData: safeOhlcvData, lineData, volumeData });
        updateCurrentPriceLine(dataLastPrice);

        // Re-anchor the price-locked market cap overlay against the fresh
        // price series (the rebase constant depends on the first shared bar).
        if (currentMarketCapOverlay) setMarketCap(currentMarketCapOverlay);

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
        updateProjectionDivider();
    }

    // Patch only the last bar with a realtime spot price. lightweight-charts'
    // series.update() is O(1) — the previous approach re-ran setData() (full
    // series normalization + re-feed) on every ~1s tick.
    // Horizontal dashed line at the current price, spanning the full chart
    // width up to the right-edge price tag (built-in price line, custom
    // axis label suppressed — the DOM tag is the label).
    function updateCurrentPriceLine(price: number | null) {
        if (price == null || !Number.isFinite(price) || price <= 0) {
            if (currentPriceLine) {
                priceSeries.removePriceLine(currentPriceLine);
                currentPriceLine = null;
            }
            return;
        }

        if (!currentPriceLine) {
            currentPriceLine = priceSeries.createPriceLine({
                price,
                color: resolvedIsDarkMode ? 'oklch(1 0 0 / 0.35)' : 'oklch(0 0 0 / 0.35)',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                lineVisible: isPriceVisible,
                axisLabelVisible: false,
            });
        } else {
            currentPriceLine.applyOptions({ price });
        }
    }

    function updateLivePrice(priceUsd: number) {
        if (isDisposed) return;
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

        updateCurrentPriceLine(priceUsd);
        updatePriceExtremaMarkers();
        axisOverlay.scheduleUpdate();
    }

    function setHighlightRange(range: ChartHighlightRange | null) {
        if (isDisposed) return;
        highlightOverlay.setRange(range);
        axisOverlay.scheduleUpdate();
    }

    function setPriceVisible(visible: boolean) {
        if (isDisposed || isPriceVisible === visible) return;
        isPriceVisible = visible;
        highlightOverlay.setPriceVisible(visible);
        axisOverlay.setPriceVisible(visible);
        currentPriceLine?.applyOptions({ lineVisible: visible });
        updatePriceExtremaMarkers();
    }

    function setHullSuite(overlay: HullSuiteOverlay | null) {
        if (isDisposed) return;
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

    function setMarketCap(overlay: MarketCapOverlay | null) {
        if (isDisposed) return;
        currentMarketCapOverlay = overlay;
        if (!overlay || !overlay.points?.length) {
            marketCapRawByEpoch = new Map();
            marketCapSeries?.applyOptions({ visible: false });
            marketCapSeries?.setData([]);
            marketCapHighlightSeries?.applyOptions({ visible: false });
            marketCapHighlightSeries?.setData([]);
            highlightOverlay.setMarketCap(null);
            return;
        }

        const rawPoints = normalizeLineSeries(overlay.points);
        marketCapRawByEpoch = new Map();
        for (const p of rawPoints) {
            const epoch = timeToEpochSeconds(p.time);
            if (epoch != null) marketCapRawByEpoch.set(epoch, p.value);
        }

        // Price-locked scaling: rebase market cap into price space with a FIXED
        // anchor (first bar where both series have data): k = price₀ / mcap₀.
        // Both lines then live on the same right price scale, so pan/zoom can't
        // re-normalize them independently — the yellow line reads as "price
        // implied by market cap at anchor supply". Divergence = supply change;
        // an mcap ATH without a price ATH breaks visibly above the price line.
        let anchorScale: number | null = null;
        for (const p of rawPoints) {
            const epoch = timeToEpochSeconds(p.time);
            if (epoch == null || !(p.value > 0)) continue;
            const bar = ohlcvByEpochSecond.get(epoch);
            if (bar && Number.isFinite(bar.close) && bar.close > 0) {
                anchorScale = bar.close / p.value;
                break;
            }
        }
        if (anchorScale == null) {
            const firstBar = safeOhlcvData.find((d) => Number.isFinite(d.close) && d.close > 0);
            const firstPoint = rawPoints.find((p) => p.value > 0);
            if (firstBar && firstPoint) anchorScale = firstBar.close / firstPoint.value;
        }

        // No price data to anchor against yet — hide and wait; setData()
        // re-applies the overlay once the price series lands.
        if (anchorScale == null) {
            marketCapSeries?.applyOptions({ visible: false });
            marketCapSeries?.setData([]);
            marketCapHighlightSeries?.applyOptions({ visible: false });
            marketCapHighlightSeries?.setData([]);
            highlightOverlay.setMarketCap(null);
            return;
        }

        const scale = anchorScale;
        const points = rawPoints.map((p) => ({ time: p.time, value: p.value * scale }));

        const lineStyle =
            overlay.lineStyle === 'dotted'
                ? LineStyle.Dotted
                : overlay.lineStyle === 'dashed'
                  ? LineStyle.Dashed
                  : LineStyle.Solid;
        const lineWidth = overlay.lineWidth ?? 1;
        // Default: yellow at half opacity.
        const color = overlay.color ?? (resolvedIsDarkMode ? 'oklch(0.85 0.16 95 / 0.5)' : 'oklch(0.68 0.14 95 / 0.5)');

        if (!marketCapSeries) {
            marketCapSeries = chart.addSeries(LineSeries, {
                lineWidth,
                color,
                lineStyle,
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: true,
                crosshairMarkerRadius: 2,
                crosshairMarkerBorderColor: 'oklch(1 0 0)',
                crosshairMarkerBackgroundColor: color,
                lastPriceAnimation: LastPriceAnimationMode.Disabled,
                visible: true,
                // Shared right price scale (values are rebased into price space).
                priceFormat: { type: 'custom', formatter: () => '' },
            });
        } else {
            marketCapSeries.applyOptions({
                lineWidth,
                color,
                lineStyle,
                crosshairMarkerBackgroundColor: color,
                visible: true,
            });
        }

        // Twin series for the scrub highlight window: renders the in-window
        // slice at full strength while the base series is dimmed — mirrors
        // how the price line scrubs (see highlight-overlay).
        if (!marketCapHighlightSeries) {
            marketCapHighlightSeries = chart.addSeries(LineSeries, {
                lineWidth,
                color,
                lineStyle,
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
                lastPriceAnimation: LastPriceAnimationMode.Disabled,
                visible: false,
                priceFormat: { type: 'custom', formatter: () => '' },
            });
            marketCapHighlightSeries.setData([]);
        } else {
            marketCapHighlightSeries.applyOptions({ lineWidth, lineStyle });
        }

        marketCapSeries.setData(points);

        // Registering re-applies the current highlight range, so the market
        // cap line picks up the dim/highlight state immediately.
        highlightOverlay.setMarketCap({
            series: marketCapSeries,
            highlightSeries: marketCapHighlightSeries,
            data: points,
            color,
        });
    }

    function ensureProjectionSeries(
        existing: ISeriesApi<'Line'> | null,
        color: string,
        lineWidth: NonNullable<ProjectionOverlay['lineWidth']>,
    ): ISeriesApi<'Line'> {
        const options = {
            lineWidth,
            color,
            lineStyle: LineStyle.Dashed,
            lastValueVisible: false,
            priceLineVisible: false,
            // Match the price series' scrub dot so the projected region
            // scrubs with the same affordances as real data.
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 3,
            crosshairMarkerBorderColor: 'oklch(1 0 0)',
            crosshairMarkerBackgroundColor: color,
            lastPriceAnimation: LastPriceAnimationMode.Disabled,
            visible: true,
        };
        if (!existing) return chart.addSeries(LineSeries, options);
        existing.applyOptions(options);
        return existing;
    }

    function setProjection(overlay: ProjectionOverlay | null) {
        if (isDisposed) return;
        if (!overlay || !overlay.base?.length) {
            for (const series of [projBaseSeries, projBullSeries, projBearSeries]) {
                series?.applyOptions({ visible: false });
                series?.setData([]);
            }
            for (const markers of [projBaseMarkers, projBullMarkers, projBearMarkers]) {
                markers?.setMarkers([]);
            }
            projectionAnchorEpoch = null;
            hideProjectionDivider();
            if (projectionActive) {
                projectionActive = false;
                lastProjectionEndEpoch = null;
                // Restore the price-only view (fitContent spans all series;
                // with the projection cleared this refits to the real data).
                chart.timeScale().fitContent();
            }
            return;
        }

        const lineWidth = overlay.lineWidth ?? 1;
        const baseColor =
            overlay.baseColor ?? (resolvedIsDarkMode ? 'oklch(1 0 0 / 0.5)' : 'oklch(0 0 0 / 0.5)');
        const bullColor = overlay.bullColor ?? toRgba(CANDLE_UP_COLOR, 0.5);
        const bearColor = overlay.bearColor ?? toRgba(CANDLE_DOWN_COLOR, 0.5);

        projBaseSeries = ensureProjectionSeries(projBaseSeries, baseColor, lineWidth);
        projBullSeries = ensureProjectionSeries(projBullSeries, bullColor, lineWidth);
        projBearSeries = ensureProjectionSeries(projBearSeries, bearColor, lineWidth);

        readoutBull.rowEl.style.color = bullColor;
        readoutBear.rowEl.style.color = bearColor;

        const base = normalizeLineSeries(overlay.base);
        const bull = normalizeLineSeries(overlay.bull);
        const bear = normalizeLineSeries(overlay.bear);

        try {
            // Clear stale endpoint markers BEFORE feeding new data: setData on
            // one series shifts the shared time scale while sibling series
            // still hold old data — their marker primitives then recalculate
            // against inconsistent state and lightweight-charts throws
            // "Value is null" (ensureNotNull in _recalculateMarkers).
            projBaseMarkers?.setMarkers([]);
            projBullMarkers?.setMarkers([]);
            projBearMarkers?.setMarkers([]);

            projBaseSeries.setData(base);
            projBullSeries.setData(bull);
            projBearSeries.setData(bear);

            // Endpoint dots — mark where each scenario path lands at the horizon.
            projBaseMarkers ??= createSeriesMarkers(projBaseSeries);
            projBullMarkers ??= createSeriesMarkers(projBullSeries);
            projBearMarkers ??= createSeriesMarkers(projBearSeries);
            const endpointMarker = (points: typeof base, color: string) => {
                const lastPoint = points[points.length - 1];
                return lastPoint
                    ? [{ time: lastPoint.time, position: 'inBar' as const, shape: 'circle' as const, color, size: 0.4 }]
                    : [];
            };
            projBaseMarkers.setMarkers(endpointMarker(base, baseColor));
            projBullMarkers.setMarkers(endpointMarker(bull, bullColor));
            projBearMarkers.setMarkers(endpointMarker(bear, bearColor));
        } catch {
            // Safety net: if lightweight-charts throws from an internal
            // inconsistency, tear the projection series down instead of
            // crashing the app — the next setProjection call rebuilds them.
            for (const series of [projBaseSeries, projBullSeries, projBearSeries]) {
                try {
                    if (series) chart.removeSeries(series);
                } catch {
                    // already detached
                }
            }
            projBaseSeries = null;
            projBullSeries = null;
            projBearSeries = null;
            projBaseMarkers = null;
            projBullMarkers = null;
            projBearMarkers = null;
            projectionActive = false;
            lastProjectionEndEpoch = null;
            projectionAnchorEpoch = null;
            hideProjectionDivider();
            return;
        }

        // Future-dated points extend the shared time scale, but the setData()
        // fit logic only frames the price series — bring the projection into
        // view on toggle-on, or when its end jumps by more than ~1 bar
        // (timeframe switch while active). Small refresh drift keeps the
        // user's pan/zoom.
        const endEpoch = base.length ? timeToEpochSeconds(base[base.length - 1]!.time) : null;
        const firstEpoch = base.length ? timeToEpochSeconds(base[0]!.time) : null;
        const intervalSec =
            base.length >= 2 && endEpoch != null && firstEpoch != null
                ? (endEpoch - firstEpoch) / (base.length - 1)
                : 0;
        const endJumped =
            endEpoch != null &&
            lastProjectionEndEpoch != null &&
            Math.abs(endEpoch - lastProjectionEndEpoch) > intervalSec;

        if (!projectionActive || endJumped) chart.timeScale().fitContent();
        projectionActive = true;
        lastProjectionEndEpoch = endEpoch;
        projectionAnchorEpoch = firstEpoch;
        updateProjectionDivider();
    }

    function setCallbacks(next: Pick<UseChartInstanceOptions, 'onCrosshairMove' | 'onCrosshairTimeMove'>) {
        onCrosshairMove = next.onCrosshairMove;
        onCrosshairTimeMove = next.onCrosshairTimeMove;
    }

    function destroy() {
        if (isDisposed) return;
        isDisposed = true;

        chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(updateScrubLine);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateScrubLine);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(updateProjectionDivider);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateProjectionDivider);
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

        for (const el of [projectionDividerEl, projectionReadoutEl]) {
            if (containerEl.contains(el)) containerEl.removeChild(el);
        }

        chart.remove();
    }

    // Initial size
    resize();

    return { setData, updateLivePrice, setPriceVisible, setHighlightRange, setHullSuite, setMarketCap, setProjection, setCallbacks, resize, destroy };
}
