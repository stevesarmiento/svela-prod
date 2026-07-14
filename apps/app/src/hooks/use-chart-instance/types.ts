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

export interface MarketCapOverlay {
    /**
     * Historical market cap points (raw USD). The controller rebases them into
     * price space (fixed anchor: first shared bar) and renders on the SAME
     * right price scale as price, so pan/zoom can't re-normalize the two
     * lines independently. Tooltips still report the raw USD values.
     */
    points: Array<{ time: Time; value: number }>;
    color?: string;
    lineWidth?: LineWidth;
    lineStyle?: 'solid' | 'dotted' | 'dashed';
}

export interface ProjectionOverlay {
    /** Drift path; first point anchors at the last real close. Points may be future-dated. */
    base: Array<{ time: Time; value: number }>;
    /** Upper (+1σ·√t) scenario path. */
    bull: Array<{ time: Time; value: number }>;
    /** Lower (−1σ·√t) scenario path. */
    bear: Array<{ time: Time; value: number }>;
    baseColor?: string;
    bullColor?: string;
    bearColor?: string;
    lineWidth?: LineWidth;
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
     * Optional historical market cap overlay line, price-locked: rebased by a
     * fixed anchor (price₀/mcap₀ at the first shared bar) onto the price
     * scale. The line reads as "price implied by market cap at anchor supply"
     * — divergence from price = supply change, and an mcap ATH without a
     * price ATH breaks visibly above the price line.
     */
    marketCap?: MarketCapOverlay | null;
    /**
     * Optional forward projection overlay (dashed base trend + bull/bear cone).
     * Points are future-dated (past the last real bar); the controller adjusts
     * the visible range when the overlay toggles on/off so the future region
     * comes into (and out of) view.
     */
    projection?: ProjectionOverlay | null;
    /**
     * Highlight a time window with two vertical boundary lines.
     * When set, the non-highlighted portion of the price series is dimmed.
     */
    highlightRange?: ChartHighlightRange | null;
}
