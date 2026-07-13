import { describe, expect, test } from "bun:test";
import {
  MIN_PROJECTION_BARS,
  computePriceProjection,
  type ProjectionInputPoint,
} from "./price-projection";

const HOUR = 3600;
const T0 = 1_700_000_000;

function makeSeries(
  count: number,
  closeAt: (i: number) => number,
  intervalSec = HOUR,
): ProjectionInputPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    timeEpochSec: T0 + i * intervalSec,
    close: closeAt(i),
  }));
}

describe("computePriceProjection", () => {
  test("returns null with fewer than the minimum bars", () => {
    const points = makeSeries(MIN_PROJECTION_BARS - 1, () => 100);
    expect(computePriceProjection(points)).toBeNull();
  });

  test("flat series → flat base and symmetric cone around it", () => {
    const points = makeSeries(120, () => 100);
    const result = computePriceProjection(points);
    expect(result).not.toBeNull();

    for (const point of result!.base) {
      expect(point.value).toBeCloseTo(100, 6);
    }
    // Zero volatility → cone collapses onto the base.
    for (let i = 0; i < result!.base.length; i++) {
      expect(result!.bull[i]!.value).toBeCloseTo(100, 6);
      expect(result!.bear[i]!.value).toBeCloseTo(100, 6);
    }
  });

  test("cone is geometrically symmetric around the base path", () => {
    // Noisy series: alternate ±2% around a flat level.
    const points = makeSeries(120, (i) => 100 * (i % 2 === 0 ? 1.02 : 0.98));
    const result = computePriceProjection(points);
    expect(result).not.toBeNull();
    expect(result!.meta.sigmaPerBar).toBeGreaterThan(0);

    for (let i = 1; i < result!.base.length; i++) {
      const base = result!.base[i]!.value;
      const bull = result!.bull[i]!.value;
      const bear = result!.bear[i]!.value;
      expect(bull).toBeGreaterThan(base);
      expect(bear).toBeLessThan(base);
      // Geometric symmetry: bull/base === base/bear.
      expect(bull / base).toBeCloseTo(base / bear, 6);
    }
  });

  test("steady +1%/bar growth → base follows the exponential trend", () => {
    const growth = Math.exp(0.01);
    const points = makeSeries(100, (i) => 100 * growth ** i);
    const result = computePriceProjection(points);
    expect(result).not.toBeNull();

    // Constant log-slope, zero residual volatility.
    expect(result!.meta.muPerBar).toBeCloseTo(0.01, 6);
    expect(result!.meta.sigmaPerBar).toBeCloseTo(0, 6);

    const p0 = points[points.length - 1]!.close;
    const h = result!.meta.horizonBars;
    const lastPoint = result!.base[result!.base.length - 1]!;
    expect(lastPoint.value).toBeCloseTo(p0 * Math.exp(0.01 * h), 4);
  });

  test("anchor point equals the last close on all three paths", () => {
    const points = makeSeries(90, (i) => 50 + i * 0.5);
    const result = computePriceProjection(points);
    expect(result).not.toBeNull();

    const last = points[points.length - 1]!;
    for (const path of [result!.base, result!.bull, result!.bear]) {
      expect(path[0]!.timeEpochSec).toBe(last.timeEpochSec);
      expect(path[0]!.value).toBeCloseTo(last.close, 10);
    }
  });

  test("drift clamp: extreme growth capped at 3x over the horizon", () => {
    // +30%/bar — absurd drift that must be clamped.
    const points = makeSeries(60, (i) => 0.0001 * Math.exp(0.3 * i));
    const result = computePriceProjection(points);
    expect(result).not.toBeNull();

    const h = result!.meta.horizonBars;
    expect(Math.abs(result!.meta.muPerBar * h)).toBeLessThanOrEqual(Math.log(3) + 1e-9);
    const p0 = points[points.length - 1]!.close;
    expect(result!.base[result!.base.length - 1]!.value).toBeLessThanOrEqual(p0 * 3 * (1 + 1e-9));
  });

  test("volatility clamp: cone half-width capped at 4x at the horizon", () => {
    // Wild ±60% alternation → raw sigma far above the caps.
    const points = makeSeries(120, (i) => 100 * (i % 2 === 0 ? 1.6 : 0.4));
    const result = computePriceProjection(points);
    expect(result).not.toBeNull();

    const h = result!.meta.horizonBars;
    const halfWidth = result!.meta.sigmaPerBar * Math.sqrt(h);
    expect(halfWidth).toBeLessThanOrEqual(Math.log(4) + 1e-9);
    expect(result!.meta.sigmaPerBar).toBeLessThanOrEqual(0.35 + 1e-9);
  });

  test("all projected values stay strictly positive (micro-cap)", () => {
    // Sub-cent token trending down hard.
    const points = makeSeries(100, (i) => 0.004 * Math.exp(-0.05 * i));
    const result = computePriceProjection(points);
    expect(result).not.toBeNull();

    for (const path of [result!.base, result!.bull, result!.bear]) {
      for (const point of path) {
        expect(point.value).toBeGreaterThan(0);
        expect(Number.isFinite(point.value)).toBe(true);
      }
    }
  });

  test("timestamps are strictly ascending and use the median bar interval", () => {
    const points = makeSeries(100, (i) => 100 + i);
    // Introduce one large gap; the median interval must be unaffected.
    const gapped = points.map((p, i) =>
      i >= 50 ? { ...p, timeEpochSec: p.timeEpochSec + 30 * 24 * HOUR } : p,
    );
    const result = computePriceProjection(gapped);
    expect(result).not.toBeNull();
    expect(result!.meta.intervalSec).toBe(HOUR);

    for (const path of [result!.base, result!.bull, result!.bear]) {
      for (let i = 1; i < path.length; i++) {
        expect(path[i]!.timeEpochSec).toBeGreaterThan(path[i - 1]!.timeEpochSec);
      }
    }
  });

  test("horizon is ~25% of the series length within clamps", () => {
    const result = computePriceProjection(makeSeries(120, (i) => 100 + i));
    expect(result).not.toBeNull();
    expect(result!.meta.horizonBars).toBe(30);

    const short = computePriceProjection(makeSeries(30, (i) => 100 + i));
    expect(short).not.toBeNull();
    expect(short!.meta.horizonBars).toBe(8); // min clamp

    const long = computePriceProjection(makeSeries(1000, (i) => 100 + (i % 7)));
    expect(long).not.toBeNull();
    expect(long!.meta.horizonBars).toBe(90); // max clamp
  });

  test("bull/bear are smooth constant-rate curves landing on the ±1σ·√H band", () => {
    const noisy = makeSeries(120, (i) => 100 * (i % 2 === 0 ? 1.02 : 0.98));
    const result = computePriceProjection(noisy);
    expect(result).not.toBeNull();

    const { horizonBars, sigmaPerBar, intervalSec } = result!.meta;
    // One point per bar — index-based time scale stays time-proportional.
    expect(result!.base.length).toBe(horizonBars + 1);

    // Log-spread grows linearly (constant per-bar scenario rate)…
    const spreadAt = (i: number) => Math.log(result!.bull[i]!.value / result!.base[i]!.value);
    const perBarRate = spreadAt(1);
    expect(perBarRate).toBeGreaterThan(0);
    for (let i = 2; i <= horizonBars; i++) {
      expect(spreadAt(i)).toBeCloseTo(perBarRate * i, 9);
    }
    // …and the horizon endpoint lands exactly on the statistical ±1σ·√H band.
    expect(spreadAt(horizonBars)).toBeCloseTo(sigmaPerBar * Math.sqrt(horizonBars), 9);

    const lastPoint = result!.base[result!.base.length - 1]!;
    expect(lastPoint.timeEpochSec).toBe(T0 + 119 * HOUR + horizonBars * intervalSec);
  });

  test("smoother slope blends 50/50 with the OLS drift", () => {
    const flat = makeSeries(120, () => 100); // OLS drift = 0
    const plain = computePriceProjection(flat);
    const blended = computePriceProjection(flat, { smootherSlopePerBar: 0.02 });
    expect(plain!.meta.muPerBar).toBeCloseTo(0, 9);
    expect(blended!.meta.muPerBar).toBeCloseTo(0.01, 9);
    expect(blended!.meta.muOlsPerBar).toBeCloseTo(0, 9);
    expect(blended!.meta.smootherSlopePerBar).toBeCloseTo(0.02, 9);
  });

  test("vol regime percentile scales the cone width (squeeze widens)", () => {
    const noisy = makeSeries(120, (i) => 100 * (i % 2 === 0 ? 1.02 : 0.98));
    const plain = computePriceProjection(noisy);
    const squeeze = computePriceProjection(noisy, { volRegimePercentile: 0 });
    const stretched = computePriceProjection(noisy, { volRegimePercentile: 100 });
    expect(squeeze!.meta.sigmaPerBar).toBeCloseTo(plain!.meta.sigmaPerBar * 1.25, 9);
    expect(stretched!.meta.sigmaPerBar).toBeCloseTo(plain!.meta.sigmaPerBar * 0.75, 9);
    expect(squeeze!.meta.volScale).toBeCloseTo(1.25, 9);
    expect(stretched!.meta.volScale).toBeCloseTo(0.75, 9);
  });

  test("sentiment tilt skews the bull/bear bands asymmetrically", () => {
    const noisy = makeSeries(120, (i) => 100 * (i % 2 === 0 ? 1.02 : 0.98));
    const bullish = computePriceProjection(noisy, { sentimentTilt: 1 });
    expect(bullish!.meta.bullMult).toBeCloseTo(1.2, 9);
    expect(bullish!.meta.bearMult).toBeCloseTo(0.8, 9);

    const last = bullish!.base.length - 1;
    const upWidth = Math.log(bullish!.bull[last]!.value / bullish!.base[last]!.value);
    const downWidth = Math.log(bullish!.base[last]!.value / bullish!.bear[last]!.value);
    expect(upWidth / downWidth).toBeCloseTo(1.2 / 0.8, 6);

    // Wider (tilted) side still respects the cone clamp.
    const wild = makeSeries(120, (i) => 100 * (i % 2 === 0 ? 1.6 : 0.4));
    const tiltedWild = computePriceProjection(wild, { sentimentTilt: 1 });
    const h = tiltedWild!.meta.horizonBars;
    expect(tiltedWild!.meta.bullMult * tiltedWild!.meta.sigmaPerBar * Math.sqrt(h)).toBeLessThanOrEqual(
      Math.log(4) + 1e-9,
    );
  });

  test("ignores invalid points (non-finite, non-positive, out-of-order)", () => {
    const points = makeSeries(60, (i) => 100 + i);
    const dirty: ProjectionInputPoint[] = [
      ...points.slice(0, 30),
      { timeEpochSec: Number.NaN, close: 100 },
      { timeEpochSec: points[30]!.timeEpochSec, close: -5 },
      { timeEpochSec: points[10]!.timeEpochSec, close: 100 }, // out of order
      ...points.slice(30),
    ];
    const result = computePriceProjection(dirty);
    expect(result).not.toBeNull();
    // Same as the clean series.
    const clean = computePriceProjection(points);
    expect(result!.base).toEqual(clean!.base);
  });
});
