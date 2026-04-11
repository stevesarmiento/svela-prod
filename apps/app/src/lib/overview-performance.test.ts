import { describe, expect, test } from "bun:test";
import {
  buildRebasedComparison,
  forwardFillSeriesOntoBuckets,
  rebaseSeriesFromFirstPoint,
} from "./overview-performance";

describe("forwardFillSeriesOntoBuckets", () => {
  test("forward-fills sparse market data onto denser bucket times without dropping the first valid bucket", () => {
    const points = forwardFillSeriesOntoBuckets({
      sourcePoints: [
        { time: 200, value: 1000 },
        { time: 400, value: 1200 },
      ],
      bucketTimesSec: [100, 200, 300, 400, 500],
    });

    expect(points).toEqual([
      { time: 200, value: 1000 },
      { time: 300, value: 1000 },
      { time: 400, value: 1200 },
      { time: 500, value: 1200 },
    ]);
  });
});

describe("buildRebasedComparison", () => {
  test("rebases portfolio and market from the first overlapping valid point and computes outperformance", () => {
    const comparison = buildRebasedComparison({
      portfolioPoints: [
        { time: 100, value: 50 },
        { time: 200, value: 100 },
        { time: 300, value: 110 },
        { time: 400, value: 120 },
      ],
      marketPoints: [
        { time: 200, value: 1000 },
        { time: 300, value: 1050 },
        { time: 400, value: 1080 },
      ],
    });

    expect(comparison.baselineTime).toBe(200);
    expect(comparison.portfolioPoints.map((point) => point.time)).toEqual([
      200, 300, 400,
    ]);
    expect(comparison.portfolioPoints.map((point) => point.value)).toEqual([
      100,
      expect.closeTo(110, 10),
      120,
    ]);
    expect(comparison.marketPoints.map((point) => point.time)).toEqual([
      200, 300, 400,
    ]);
    expect(comparison.marketPoints.map((point) => point.value)).toEqual([
      100,
      expect.closeTo(105, 10),
      expect.closeTo(108, 10),
    ]);
    expect(comparison.portfolioReturnPct).toBe(20);
    expect(comparison.marketReturnPct).toBe(8);
    expect(comparison.outperformancePct).toBe(12);
  });
});

describe("rebaseSeriesFromFirstPoint", () => {
  test("rebases a single series from its first valid point", () => {
    expect(
      rebaseSeriesFromFirstPoint([
        { time: 100, value: 25 },
        { time: 200, value: 30 },
      ]),
    ).toEqual([
      { time: 100, value: 100 },
      { time: 200, value: 120 },
    ]);
  });
});
