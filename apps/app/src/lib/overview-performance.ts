import type { LivelinePoint } from "liveline";

function normalizePoints(
  points: ReadonlyArray<LivelinePoint>,
): LivelinePoint[] {
  const byTime = new Map<number, number>();
  for (const point of points) {
    if (!Number.isFinite(point.time)) continue;
    if (!Number.isFinite(point.value)) continue;
    byTime.set(point.time, point.value);
  }

  return Array.from(byTime.entries())
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

export function forwardFillSeriesOntoBuckets(args: {
  sourcePoints: ReadonlyArray<LivelinePoint>;
  bucketTimesSec: ReadonlyArray<number>;
}): LivelinePoint[] {
  const source = normalizePoints(args.sourcePoints);
  if (source.length === 0 || args.bucketTimesSec.length === 0) return [];

  const points: LivelinePoint[] = [];
  let cursor = 0;
  let lastValue: number | null = null;

  for (const bucketTime of args.bucketTimesSec) {
    while (cursor < source.length && source[cursor]!.time <= bucketTime) {
      const nextValue = source[cursor]!.value;
      lastValue =
        Number.isFinite(nextValue) && nextValue > 0 ? nextValue : lastValue;
      cursor++;
    }

    if (lastValue === null) continue;
    points.push({ time: bucketTime, value: lastValue });
  }

  return points;
}

export function rebaseSeriesFromFirstPoint(
  points: ReadonlyArray<LivelinePoint>,
): LivelinePoint[] {
  const normalized = normalizePoints(points).filter((point) => point.value > 0);
  const baseline = normalized[0]?.value;
  if (!baseline || !Number.isFinite(baseline) || baseline <= 0) return [];

  return normalized.map((point) => ({
    time: point.time,
    value: (point.value / baseline) * 100,
  }));
}

export function getPointValueAtTime(
  points: ReadonlyArray<LivelinePoint>,
  targetTime: number,
): number | null {
  const normalized = normalizePoints(points);
  if (normalized.length === 0) return null;

  let low = 0;
  let high = normalized.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midPoint = normalized[mid];
    if (!midPoint) break;
    if (midPoint.time === targetTime) return midPoint.value;
    if (midPoint.time < targetTime) low = mid + 1;
    else high = mid - 1;
  }

  const right = normalized[low];
  const left = normalized[low - 1];
  if (!left && !right) return null;
  if (!left) return right?.value ?? null;
  if (!right) return left.value;

  return Math.abs(left.time - targetTime) <= Math.abs(right.time - targetTime)
    ? left.value
    : right.value;
}

export interface RebasedComparisonResult {
  baselineTime: number | null;
  portfolioPoints: LivelinePoint[];
  marketPoints: LivelinePoint[];
  portfolioReturnPct: number | null;
  marketReturnPct: number | null;
  outperformancePct: number | null;
}

export function buildRebasedComparison(args: {
  portfolioPoints: ReadonlyArray<LivelinePoint>;
  marketPoints: ReadonlyArray<LivelinePoint>;
}): RebasedComparisonResult {
  const portfolio = normalizePoints(args.portfolioPoints).filter(
    (point) => point.value > 0,
  );
  const market = normalizePoints(args.marketPoints).filter(
    (point) => point.value > 0,
  );
  if (portfolio.length === 0 || market.length === 0) {
    return {
      baselineTime: null,
      portfolioPoints: [],
      marketPoints: [],
      portfolioReturnPct: null,
      marketReturnPct: null,
      outperformancePct: null,
    };
  }

  const marketByTime = new Map(
    market.map((point) => [point.time, point.value] as const),
  );
  const portfolioByTime = new Map(
    portfolio.map((point) => [point.time, point.value] as const),
  );

  const baselinePortfolioPoint = portfolio.find((point) => {
    const marketValue = marketByTime.get(point.time);
    return (
      typeof marketValue === "number" &&
      Number.isFinite(marketValue) &&
      marketValue > 0
    );
  });

  if (!baselinePortfolioPoint) {
    return {
      baselineTime: null,
      portfolioPoints: [],
      marketPoints: [],
      portfolioReturnPct: null,
      marketReturnPct: null,
      outperformancePct: null,
    };
  }

  const baselineTime = baselinePortfolioPoint.time;
  const baselinePortfolioValue = baselinePortfolioPoint.value;
  const baselineMarketValue = marketByTime.get(baselineTime) ?? null;
  if (
    baselineMarketValue === null ||
    !Number.isFinite(baselineMarketValue) ||
    baselinePortfolioValue <= 0 ||
    baselineMarketValue <= 0
  ) {
    return {
      baselineTime: null,
      portfolioPoints: [],
      marketPoints: [],
      portfolioReturnPct: null,
      marketReturnPct: null,
      outperformancePct: null,
    };
  }

  const commonTimes = portfolio
    .map((point) => point.time)
    .filter((time) => time >= baselineTime && marketByTime.has(time));

  const portfolioPoints = commonTimes.map((time) => ({
    time,
    value:
      ((portfolioByTime.get(time) ?? baselinePortfolioValue) /
        baselinePortfolioValue) *
      100,
  }));
  const marketPoints = commonTimes.map((time) => ({
    time,
    value:
      ((marketByTime.get(time) ?? baselineMarketValue) / baselineMarketValue) *
      100,
  }));

  const latestPortfolio =
    portfolioPoints[portfolioPoints.length - 1]?.value ?? null;
  const latestMarket = marketPoints[marketPoints.length - 1]?.value ?? null;

  const portfolioReturnPct =
    latestPortfolio !== null && Number.isFinite(latestPortfolio)
      ? latestPortfolio - 100
      : null;
  const marketReturnPct =
    latestMarket !== null && Number.isFinite(latestMarket)
      ? latestMarket - 100
      : null;
  const outperformancePct =
    portfolioReturnPct !== null && marketReturnPct !== null
      ? portfolioReturnPct - marketReturnPct
      : null;

  return {
    baselineTime,
    portfolioPoints,
    marketPoints,
    portfolioReturnPct,
    marketReturnPct,
    outperformancePct,
  };
}
