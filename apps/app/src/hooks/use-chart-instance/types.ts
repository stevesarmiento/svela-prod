import type { LineWidth, Time } from 'lightweight-charts';

export interface PriceDataPoint {
    time: Time;
    value: number;
}

export interface OHLCVDataPoint {
    time: Time;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export interface VolumeDataPoint {
    time: Time;
    value: number;
    color?: string;
}

export type ChartType = 'line' | 'candlestick';

export interface HullSuiteOverlay {
    mhull: Array<{ time: Time; value: number }>;
    shull: Array<{ time: Time; value: number }>;
    color?: string;
    lineWidth?: LineWidth;
    lineStyle?: 'solid' | 'dotted';
}

export interface ChartHighlightRange {
    /** Start of the highlighted window (inclusive). */
    from: Time;
    /** End of the highlighted window (exclusive). */
    to: Time;
    /** Opacity to apply to the non-highlighted price series. Default: 0.25 */
    dimOpacity?: number;
    /** Vertical boundary line color. Default: oklch(0.7161 0.0091 56.26 / 0.65) */
    boundaryColor?: string;
}

export interface UseChartInstanceOptions {
    chartType?: ChartType;
    showVolume?: boolean;
    /**
     * Realtime spot price. Applied as an O(1) last-bar update on the live
     * chart instance — intentionally NOT part of the series data, so ~1s
     * ticks never trigger a full setData() re-feed.
     */
    livePriceUsd?: number | null;
    onCrosshairMove?: (price: number | null) => void;
    /** Optional crosshair time callback (useful for day-window highlighting). */
    onCrosshairTimeMove?: (time: Time | null) => void;
    /**
     * Optional theme hint to avoid internal DOM/theme detection.
     * When set, the chart will be re-created on theme changes (to update colors reliably).
     */
    isDarkMode?: boolean;
    /**
     * Optional Hull Suite overlay lines (MHULL/SHULL).
     * This keeps the chart implementation modular while preserving indicator overlays.
     */
    hullSuite?: HullSuiteOverlay | null;
    /**
     * Highlight a time window with two vertical boundary lines.
     * When set, the non-highlighted portion of the price series is dimmed.
     */
    highlightRange?: ChartHighlightRange | null;
}
