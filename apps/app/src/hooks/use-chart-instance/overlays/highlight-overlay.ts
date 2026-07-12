import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { ChartHighlightRange, ChartType, OHLCVDataPoint, PriceDataPoint, VolumeDataPoint } from '../types';
import { CANDLE_DOWN_COLOR, CANDLE_UP_COLOR } from '@/lib/chart-colors';
import { multiplyAlpha } from '@/lib/oklch';
import { clampNumber, isTimeInEpochRange, timeToEpochSeconds, toRgba } from '../utils';

export interface HighlightOverlay {
    setRange: (range: ChartHighlightRange | null) => void;
    setData: (args: { ohlcvData: OHLCVDataPoint[]; lineData: PriceDataPoint[] | null; volumeData: VolumeDataPoint[] }) => void;
    apply: () => void;
    updatePositions: () => void;
    destroy: () => void;
}

interface CreateHighlightOverlayArgs {
    containerEl: HTMLDivElement;
    chart: IChartApi;
    chartType: ChartType;
    priceSeries: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;
    highlightPriceSeries: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;
    volumeSeries: ISeriesApi<'Histogram'> | null;
    baseLineColor?: string;
    candleUpColor?: string;
    candleDownColor?: string;
}

export function createHighlightOverlay({
    containerEl,
    chart,
    chartType,
    priceSeries,
    highlightPriceSeries,
    volumeSeries,
    baseLineColor = 'oklch(0.4602 0.0091 61.29)', // sand-1200
    candleUpColor = CANDLE_UP_COLOR,
    candleDownColor = CANDLE_DOWN_COLOR,
}: CreateHighlightOverlayArgs): HighlightOverlay {
    const DEFAULT_HIGHLIGHT_BOUNDARY_COLOR = 'oklch(0.7161 0.0091 56.26 / 0.65)'; // sand-500-ish

    const overlayEl = document.createElement('div');
    overlayEl.className = 'pointer-events-none absolute inset-0 z-10';
    overlayEl.setAttribute('aria-hidden', 'true');

    const lineLeft = document.createElement('div');
    lineLeft.className = 'absolute left-0 top-0 bottom-0 w-px';
    lineLeft.style.display = 'none';
    lineLeft.style.transform = 'translate3d(0, 0, 0)';

    const lineRight = document.createElement('div');
    lineRight.className = 'absolute left-0 top-0 bottom-0 w-px';
    lineRight.style.display = 'none';
    lineRight.style.transform = 'translate3d(0, 0, 0)';

    overlayEl.appendChild(lineLeft);
    overlayEl.appendChild(lineRight);

    containerEl.style.position = containerEl.style.position || 'relative';
    containerEl.appendChild(overlayEl);

    let currentRange: ChartHighlightRange | null = null;
    let currentOhlcvData: OHLCVDataPoint[] = [];
    let currentLineData: PriceDataPoint[] | null = null;
    let currentVolumeData: VolumeDataPoint[] = [];
    let candleEpochSeconds: number[] = [];

    function multiplyColorAlpha(color: string, factor: number): string {
        // All chart colors are oklch strings; multiplyAlpha scales the
        // existing alpha and returns non-oklch inputs unchanged.
        return multiplyAlpha(color.trim(), clampNumber(factor, 0, 1));
    }

    function setDashedLineStyle(el: HTMLDivElement, color: string) {
        el.style.backgroundColor = 'transparent';
        el.style.backgroundImage = `repeating-linear-gradient(to bottom, ${color} 0, ${color} 4px, transparent 4px, transparent 8px)`;
    }

    function hideBoundaries() {
        lineLeft.style.display = 'none';
        lineRight.style.display = 'none';
    }

    function timeToCoordinateApprox(targetEpochSec: number): number | null {
        if (candleEpochSeconds.length === 0) return null;

        // Binary search for first candle time >= target
        let lo = 0;
        let hi = candleEpochSeconds.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (candleEpochSeconds[mid]! < targetEpochSec) lo = mid + 1;
            else hi = mid;
        }

        const rightIdx = lo < candleEpochSeconds.length ? lo : candleEpochSeconds.length - 1;
        const leftIdx = lo > 0 ? lo - 1 : 0;

        const t0 = candleEpochSeconds[leftIdx]!;
        const t1 = candleEpochSeconds[rightIdx]!;
        const x0 = chart.timeScale().timeToCoordinate(t0 as Time);
        const x1 = chart.timeScale().timeToCoordinate(t1 as Time);

        if (x0 == null || x1 == null || !Number.isFinite(x0) || !Number.isFinite(x1)) return null;
        if (t0 === t1) return clampNumber(x0, 0, Math.max(1, containerEl.clientWidth));

        const clampedT = clampNumber(targetEpochSec, Math.min(t0, t1), Math.max(t0, t1));
        const ratio = (clampedT - t0) / (t1 - t0);
        const x = x0 + ratio * (x1 - x0);
        return clampNumber(x, 0, Math.max(1, containerEl.clientWidth));
    }

    function updateBoundaryPositions(fromEpochSec: number, toEpochSec: number, boundaryColor: string) {
        const x0 = timeToCoordinateApprox(fromEpochSec);
        const x1 = timeToCoordinateApprox(toEpochSec);

        if (x0 == null || x1 == null || !Number.isFinite(x0) || !Number.isFinite(x1)) {
            hideBoundaries();
            return;
        }

        const leftX = Math.min(x0, x1);
        const rightX = Math.max(x0, x1);

        lineLeft.style.display = 'block';
        lineRight.style.display = 'block';
        setDashedLineStyle(lineLeft, boundaryColor);
        setDashedLineStyle(lineRight, boundaryColor);
        lineLeft.style.transform = `translate3d(${leftX}px, 0, 0)`;
        lineRight.style.transform = `translate3d(${rightX}px, 0, 0)`;
    }

    function clearHighlight() {
        if (chartType === 'candlestick') {
            (priceSeries as ISeriesApi<'Candlestick'>).applyOptions({
                upColor: candleUpColor,
                downColor: candleDownColor,
                borderUpColor: candleUpColor,
                borderDownColor: candleDownColor,
                wickUpColor: candleUpColor,
                wickDownColor: candleDownColor,
            });
        } else {
            (priceSeries as ISeriesApi<'Line'>).applyOptions({ color: baseLineColor });
        }

        highlightPriceSeries.applyOptions({ visible: false });
        if (chartType === 'candlestick') {
            (highlightPriceSeries as ISeriesApi<'Candlestick'>).setData([]);
        } else {
            (highlightPriceSeries as ISeriesApi<'Line'>).setData([]);
        }

        // Restore volume series to its base colors.
        if (volumeSeries && currentVolumeData.length > 0) {
            volumeSeries.setData(currentVolumeData);
        }

        hideBoundaries();
    }

    function updatePositions() {
        const range = currentRange;
        if (!range) {
            hideBoundaries();
            return;
        }

        const fromEpochSec = timeToEpochSeconds(range.from);
        const toEpochSec = timeToEpochSeconds(range.to);
        if (fromEpochSec == null || toEpochSec == null) {
            hideBoundaries();
            return;
        }

        const startEpochSec = Math.min(fromEpochSec, toEpochSec);
        const endEpochSec = Math.max(fromEpochSec, toEpochSec);
        const boundaryColor = range.boundaryColor ?? DEFAULT_HIGHLIGHT_BOUNDARY_COLOR;
        updateBoundaryPositions(startEpochSec, endEpochSec, boundaryColor);
    }

    function apply() {
        const range = currentRange;
        if (!range) {
            clearHighlight();
            return;
        }

        const fromEpochSec = timeToEpochSeconds(range.from);
        const toEpochSec = timeToEpochSeconds(range.to);
        if (fromEpochSec == null || toEpochSec == null) {
            clearHighlight();
            return;
        }

        const startEpochSec = Math.min(fromEpochSec, toEpochSec);
        const endEpochSec = Math.max(fromEpochSec, toEpochSec);
        const dimOpacity = clampNumber(range.dimOpacity ?? 0.25, 0, 1);

        if (chartType === 'candlestick') {
            const highlighted = currentOhlcvData.filter(d => isTimeInEpochRange(d.time, startEpochSec, endEpochSec));
            if (highlighted.length === 0) {
                clearHighlight();
                return;
            }

            const baseSeries = priceSeries as ISeriesApi<'Candlestick'>;
            const overlaySeries = highlightPriceSeries as ISeriesApi<'Candlestick'>;

            baseSeries.applyOptions({
                upColor: toRgba(candleUpColor, dimOpacity),
                downColor: toRgba(candleDownColor, dimOpacity),
                borderUpColor: toRgba(candleUpColor, dimOpacity),
                borderDownColor: toRgba(candleDownColor, dimOpacity),
                wickUpColor: toRgba(candleUpColor, dimOpacity),
                wickDownColor: toRgba(candleDownColor, dimOpacity),
            });

            overlaySeries.applyOptions({ visible: true });
            overlaySeries.setData(highlighted);
        } else {
            const data = currentLineData ?? [];
            const highlighted = data.filter(d => isTimeInEpochRange(d.time, startEpochSec, endEpochSec));
            if (highlighted.length === 0) {
                clearHighlight();
                return;
            }

            const baseSeries = priceSeries as ISeriesApi<'Line'>;
            const overlaySeries = highlightPriceSeries as ISeriesApi<'Line'>;

            baseSeries.applyOptions({ color: toRgba(baseLineColor, dimOpacity) });
            overlaySeries.applyOptions({ visible: true });
            overlaySeries.setData(highlighted);
        }

        // Dim volume bars outside the highlighted window (keep in-window bars at full opacity).
        if (volumeSeries && currentVolumeData.length > 0) {
            const dimmedVolumeData = currentVolumeData.map(point => {
                if (isTimeInEpochRange(point.time, startEpochSec, endEpochSec)) return point;
                if (!point.color) return point;
                return {
                    ...point,
                    color: multiplyColorAlpha(point.color, dimOpacity),
                };
            });
            volumeSeries.setData(dimmedVolumeData);
        }

        updatePositions();
    }

    function setRange(range: ChartHighlightRange | null) {
        currentRange = range;
        apply();
    }

    function setData(args: { ohlcvData: OHLCVDataPoint[]; lineData: PriceDataPoint[] | null; volumeData: VolumeDataPoint[] }) {
        currentOhlcvData = args.ohlcvData;
        currentLineData = args.lineData;
        currentVolumeData = args.volumeData;
        candleEpochSeconds = currentOhlcvData
            .map(d => timeToEpochSeconds(d.time))
            .filter((t): t is number => t != null);
        apply();
    }

    function destroy() {
        hideBoundaries();
        if (overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    }

    return { setRange, setData, apply, updatePositions, destroy };
}
