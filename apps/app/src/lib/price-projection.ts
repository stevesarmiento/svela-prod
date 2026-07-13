/**
 * Price projection math — pure, framework-free.
 *
 * Geometric (log-space) model anchored at the last real close (t0, P0):
 *
 *   base_i = P0 * exp(mu * i)                  — drift extrapolation
 *   bull_i = P0 * exp(mu * i + sigma * sqrt(i)) — +1σ·√t scenario
 *   bear_i = P0 * exp(mu * i - sigma * sqrt(i)) — −1σ·√t scenario
 *
 * for bars i = 0..H. Working in log-space guarantees every projected
 * price stays strictly positive.
 *
 * - Drift mu: OLS slope of ln(close) over the lookback window.
 *   (The rolling `linearRegression` in market-vision/technical-indicators.ts
 *   discards slope/intercept, so a local full-window OLS is implemented here
 *   intentionally.)
 * - Volatility sigma: population stdev of log-returns over the same window.
 * - Clamps keep micro-cap cones sane (see constants below).
 *
 * Optional indicator modifiers (see ProjectionModifiers):
 * - smootherSlopePerBar (Hull MA slope): blended 50/50 with the OLS drift for
 *   a more responsive trend read.
 * - volRegimePercentile (BBWP): volatility is mean-reverting — a squeeze
 *   (low percentile) widens the cone anticipating expansion, a stretched
 *   regime (high percentile) narrows it. Scale range [0.75, 1.25].
 * - sentimentTilt (RSI divergence, -1..+1): skews the cone asymmetrically —
 *   a bullish divergence widens the bull band and narrows the bear band
 *   (±20% at full tilt), and vice versa.
 *
 * Path shape: bull/bear are constant growth-rate scenarios — the spread grows
 * linearly in log-space (smooth accelerating curves in price space) — whose
 * horizon endpoints land exactly on the statistical ±1σ·√H band.
 */

export interface ProjectionInputPoint {
    timeEpochSec: number;
    close: number;
}

export interface ProjectionPoint {
    timeEpochSec: number;
    value: number;
}

export interface ProjectionModifiers {
    /**
     * Log-space trend slope per bar from a smoother (e.g. Hull MA).
     * Blended 50/50 with the OLS drift when provided.
     */
    smootherSlopePerBar?: number | null;
    /**
     * Volatility regime percentile 0-100 (e.g. BBWP). Vol mean-reverts:
     * low percentile (squeeze) widens the cone, high percentile narrows it.
     */
    volRegimePercentile?: number | null;
    /**
     * Sentiment tilt -1..+1 (e.g. latest RSI divergence: bullish = +1,
     * bearish = -1). Skews bull/bear band widths by ±20% at full tilt.
     */
    sentimentTilt?: number | null;
}

export interface PriceProjectionResult {
    /** Drift path; first point is the anchor (last real close). */
    base: ProjectionPoint[];
    /** Upper (+bullMult·σ·√t) scenario path. */
    bull: ProjectionPoint[];
    /** Lower (−bearMult·σ·√t) scenario path. */
    bear: ProjectionPoint[];
    meta: {
        horizonBars: number;
        lookbackBars: number;
        muPerBar: number;
        sigmaPerBar: number;
        intervalSec: number;
        /** Raw OLS drift before any smoother blend. */
        muOlsPerBar: number;
        /** Applied modifier inputs (null when not provided/usable). */
        smootherSlopePerBar: number | null;
        volRegimePercentile: number | null;
        sentimentTilt: number | null;
        /** Derived scaling actually applied. */
        volScale: number;
        bullMult: number;
        bearMult: number;
    };
}

/** Minimum input bars required to produce a projection. */
export const MIN_PROJECTION_BARS = 30;
/** Minimum finite log-returns required in the lookback window. */
const MIN_LOG_RETURNS = 10;
/** Horizon = 25% of the series, clamped to [8, 90] bars. */
const HORIZON_RATIO = 0.25;
const MIN_HORIZON_BARS = 8;
const MAX_HORIZON_BARS = 90;
/** Base path may not project more than 3x / (1/3) over the horizon. */
const MAX_ABS_TOTAL_DRIFT = Math.log(3);
/** Per-bar volatility cap. */
const MAX_SIGMA_PER_BAR = 0.35;
/** Cone half-width at the horizon may not exceed 4x / (1/4). */
const MAX_CONE_HALF_WIDTH = Math.log(4);
/** Bull/bear width skew at full sentiment tilt (±20%). */
const MAX_TILT_SKEW = 0.2;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** Full-window ordinary least squares over y indexed by x = 0..n-1. */
export function olsSlope(values: number[]): { slope: number; intercept: number } | null {
    const n = values.length;
    if (n < 2) return null;

    // x = 0..n-1 → sum(x) = n(n-1)/2, sum(x²) = (n-1)n(2n-1)/6
    const sumX = (n * (n - 1)) / 2;
    const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;
    let sumY = 0;
    let sumXY = 0;
    for (let i = 0; i < n; i++) {
        const y = values[i]!;
        sumY += y;
        sumXY += i * y;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
    return { slope, intercept };
}

/** Median of a (not necessarily sorted) array. Returns null when empty. */
function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function computePriceProjection(
    points: ProjectionInputPoint[],
    modifiers: ProjectionModifiers = {},
): PriceProjectionResult | null {
    // Guards: finite positive closes, strictly ascending times.
    const clean: ProjectionInputPoint[] = [];
    for (const point of points) {
        if (!point) continue;
        if (!Number.isFinite(point.timeEpochSec)) continue;
        if (!Number.isFinite(point.close) || point.close <= 0) continue;
        const prev = clean[clean.length - 1];
        if (prev && point.timeEpochSec <= prev.timeEpochSec) continue;
        clean.push(point);
    }

    const n = clean.length;
    if (n < MIN_PROJECTION_BARS) return null;

    // Horizon ≈ 25% of the visible series (fitContent shows the whole series,
    // so N is the right proxy for the visible range).
    const horizonBars = clamp(Math.round(n * HORIZON_RATIO), MIN_HORIZON_BARS, MAX_HORIZON_BARS);
    // Lookback = 2× the projection length ("estimated over the last 2× the horizon").
    const lookbackBars = clamp(2 * horizonBars, 20, n - 1);

    const window = clean.slice(n - (lookbackBars + 1));
    const logCloses = window.map((p) => Math.log(p.close));

    // Drift: OLS slope of ln(close) per bar, optionally blended 50/50 with
    // a smoother's slope (e.g. Hull MA) for a more responsive trend read.
    const fit = olsSlope(logCloses);
    if (!fit) return null;
    const muOlsPerBar = fit.slope;
    const smootherSlopePerBar =
        typeof modifiers.smootherSlopePerBar === 'number' && Number.isFinite(modifiers.smootherSlopePerBar)
            ? modifiers.smootherSlopePerBar
            : null;
    let muPerBar = smootherSlopePerBar != null ? 0.5 * muOlsPerBar + 0.5 * smootherSlopePerBar : muOlsPerBar;

    // Volatility: population stdev of log-returns in the same window.
    const logReturns: number[] = [];
    for (let i = 1; i < logCloses.length; i++) {
        const r = logCloses[i]! - logCloses[i - 1]!;
        if (Number.isFinite(r)) logReturns.push(r);
    }
    if (logReturns.length < MIN_LOG_RETURNS) return null;

    const mean = logReturns.reduce((acc, r) => acc + r, 0) / logReturns.length;
    const variance = logReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / logReturns.length;
    let sigmaPerBar = Math.sqrt(variance);

    // Vol regime (e.g. BBWP percentile): volatility is mean-reverting, so a
    // squeeze (low percentile) widens the cone anticipating expansion and a
    // stretched regime narrows it. Mild: [0.75, 1.25].
    const volRegimePercentile =
        typeof modifiers.volRegimePercentile === 'number' && Number.isFinite(modifiers.volRegimePercentile)
            ? clamp(modifiers.volRegimePercentile, 0, 100)
            : null;
    const volScale = volRegimePercentile != null ? 1.25 - 0.5 * (volRegimePercentile / 100) : 1;
    sigmaPerBar *= volScale;

    // Sentiment tilt (e.g. RSI divergence): skew the band widths.
    const sentimentTilt =
        typeof modifiers.sentimentTilt === 'number' && Number.isFinite(modifiers.sentimentTilt)
            ? clamp(modifiers.sentimentTilt, -1, 1)
            : null;
    const bullMult = 1 + MAX_TILT_SKEW * (sentimentTilt ?? 0);
    const bearMult = 1 - MAX_TILT_SKEW * (sentimentTilt ?? 0);

    // Clamps (micro-cap sanity, keeps the cone explainable):
    // total drift ≤ 3x/⅓ over the horizon…
    const totalDrift = muPerBar * horizonBars;
    if (Math.abs(totalDrift) > MAX_ABS_TOTAL_DRIFT) {
        muPerBar = (Math.sign(totalDrift) * MAX_ABS_TOTAL_DRIFT) / horizonBars;
    }
    // …per-bar sigma bounded…
    sigmaPerBar = Math.min(sigmaPerBar, MAX_SIGMA_PER_BAR);
    // …and the cone half-width (of the wider, tilted side) at the horizon ≤ 4x/¼.
    const widerMult = Math.max(bullMult, bearMult);
    const halfWidthAtHorizon = widerMult * sigmaPerBar * Math.sqrt(horizonBars);
    if (halfWidthAtHorizon > MAX_CONE_HALF_WIDTH) {
        sigmaPerBar = MAX_CONE_HALF_WIDTH / (widerMult * Math.sqrt(horizonBars));
    }

    // Future timestamps: median bar delta (median so a single data gap
    // doesn't stretch the horizon).
    const deltas: number[] = [];
    for (let i = Math.max(1, n - lookbackBars); i < n; i++) {
        deltas.push(clean[i]!.timeEpochSec - clean[i - 1]!.timeEpochSec);
    }
    const intervalSec = median(deltas);
    if (intervalSec == null || !Number.isFinite(intervalSec) || intervalSec <= 0) return null;

    const anchor = clean[n - 1]!;
    const t0 = anchor.timeEpochSec;
    const p0 = anchor.close;

    const base: ProjectionPoint[] = [];
    const bull: ProjectionPoint[] = [];
    const bear: ProjectionPoint[] = [];

    // One point per bar (lightweight-charts' time scale is index-based, so
    // skipping bars would compress the cone horizontally). Bull/bear spread
    // grows linearly in log-space — a constant per-bar growth-rate scenario
    // that renders as a smooth accelerating curve in price space — scaled so
    // the horizon endpoint lands exactly on the statistical ±1σ·√H band.
    const sqrtHorizon = Math.sqrt(horizonBars);

    for (let i = 0; i <= horizonBars; i++) {
        const timeEpochSec = Math.round(t0 + i * intervalSec);
        const drift = muPerBar * i;
        const spread = sigmaPerBar * (i / sqrtHorizon);
        base.push({ timeEpochSec, value: p0 * Math.exp(drift) });
        bull.push({ timeEpochSec, value: p0 * Math.exp(drift + bullMult * spread) });
        bear.push({ timeEpochSec, value: p0 * Math.exp(drift - bearMult * spread) });
    }

    return {
        base,
        bull,
        bear,
        meta: {
            horizonBars,
            lookbackBars,
            muPerBar,
            sigmaPerBar,
            intervalSec,
            muOlsPerBar,
            smootherSlopePerBar,
            volRegimePercentile,
            sentimentTilt,
            volScale,
            bullMult,
            bearMult,
        },
    };
}
