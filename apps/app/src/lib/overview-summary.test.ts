import { describe, expect, test } from "bun:test";
import {
  type SummarySegment,
  aggregateNewsSentiment,
  buildOverviewSummarySegments,
  computeSeriesChangePct,
  computeValueWeighted24hChangePct,
} from "./overview-summary";

/** Flatten segments for assertions: pct segments become `{value}`. */
function renderSegments(segments: SummarySegment[]): string {
  return segments
    .map((segment) =>
      segment.kind === "text" ? segment.text : `{${segment.value}}`,
    )
    .join("");
}

describe("computeValueWeighted24hChangePct", () => {
  test("weights change percents by USD value across mixed signs", () => {
    const result = computeValueWeighted24hChangePct([
      { valueUsd: 300, changePct: 10 },
      { valueUsd: 100, changePct: -2 },
    ]);
    // (300·10 + 100·-2) / 400 = 7
    expect(result).toBe(7);
  });

  test("excludes coins with null or non-finite change from the denominator", () => {
    const result = computeValueWeighted24hChangePct([
      { valueUsd: 100, changePct: 4 },
      { valueUsd: 900, changePct: null },
      { valueUsd: 500, changePct: Number.NaN },
    ]);
    expect(result).toBe(4);
  });

  test("returns null when no value is priced", () => {
    expect(computeValueWeighted24hChangePct([])).toBeNull();
    expect(
      computeValueWeighted24hChangePct([{ valueUsd: 0, changePct: 5 }]),
    ).toBeNull();
    expect(
      computeValueWeighted24hChangePct([{ valueUsd: 100, changePct: null }]),
    ).toBeNull();
  });
});

describe("computeSeriesChangePct", () => {
  test("computes first→last percent change", () => {
    const result = computeSeriesChangePct([
      { time: 1, value: 100 },
      { time: 2, value: 90 },
      { time: 3, value: 110 },
    ]);
    expect(result).toBeCloseTo(10);
  });

  test("guards short series and non-positive starts", () => {
    expect(computeSeriesChangePct([])).toBeNull();
    expect(computeSeriesChangePct([{ time: 1, value: 100 }])).toBeNull();
    expect(
      computeSeriesChangePct([
        { time: 1, value: 0 },
        { time: 2, value: 100 },
      ]),
    ).toBeNull();
    expect(
      computeSeriesChangePct([
        { time: 1, value: -5 },
        { time: 2, value: 100 },
      ]),
    ).toBeNull();
  });
});

describe("aggregateNewsSentiment", () => {
  test("leans require a margin greater than one story", () => {
    expect(
      aggregateNewsSentiment([
        { sentiment: "bullish" },
        { sentiment: "bullish" },
        { sentiment: "bullish" },
        { sentiment: "bearish" },
      ]).lean,
    ).toBe("bullish");

    expect(
      aggregateNewsSentiment([
        { sentiment: "bullish" },
        { sentiment: "bullish" },
        { sentiment: "bearish" },
      ]).lean,
    ).toBe("mixed");

    expect(
      aggregateNewsSentiment([
        { sentiment: "bearish" },
        { sentiment: "bearish" },
        { sentiment: "bearish" },
        { sentiment: "bullish" },
      ]).lean,
    ).toBe("bearish");
  });

  test("null sentiments don't count as scored stories", () => {
    const result = aggregateNewsSentiment([
      { sentiment: null },
      { sentiment: null },
    ]);
    expect(result.total).toBe(0);
    expect(result.lean).toBe("quiet");
  });
});

describe("buildOverviewSummarySegments", () => {
  const noTone = { sentiment: null, breadth: null };

  test("portfolio vs market: ahead / behind / in line", () => {
    expect(
      renderSegments(
        buildOverviewSummarySegments({
          portfolioChangePct: 2.4,
          marketChangePct: 1.1,
          ...noTone,
        }),
      ),
    ).toBe("Your portfolio is up {2.4} today, ahead of the market's {1.1}.");

    expect(
      renderSegments(
        buildOverviewSummarySegments({
          portfolioChangePct: -3,
          marketChangePct: -1,
          ...noTone,
        }),
      ),
    ).toBe("Your portfolio is down {-3} today, behind the market's {-1}.");

    expect(
      renderSegments(
        buildOverviewSummarySegments({
          portfolioChangePct: 1.1,
          marketChangePct: 1.2,
          ...noTone,
        }),
      ),
    ).toBe(
      "Your portfolio is up {1.1} today, in line with the market's {1.2}.",
    );
  });

  test("degrades to portfolio-only and market-only sentences", () => {
    expect(
      renderSegments(
        buildOverviewSummarySegments({
          portfolioChangePct: 2,
          marketChangePct: null,
          ...noTone,
        }),
      ),
    ).toBe(
      "Your portfolio is up {2} over the last 24h; the market benchmark is still warming up.",
    );

    expect(
      renderSegments(
        buildOverviewSummarySegments({
          portfolioChangePct: null,
          marketChangePct: -0.8,
          ...noTone,
        }),
      ),
    ).toBe("The broader market is down {-0.8} over the last 24h.");
  });

  test("returns no segments when nothing is known", () => {
    expect(
      buildOverviewSummarySegments({
        portfolioChangePct: null,
        marketChangePct: null,
        ...noTone,
      }),
    ).toEqual([]);
  });

  test("appends a sentiment sentence when stories are scored", () => {
    const rendered = renderSegments(
      buildOverviewSummarySegments({
        portfolioChangePct: 1,
        marketChangePct: 2,
        sentiment: aggregateNewsSentiment([
          { sentiment: "bullish" },
          { sentiment: "bullish" },
          { sentiment: "bullish" },
          { sentiment: "bearish" },
          { sentiment: "neutral" },
        ]),
        breadth: null,
      }),
    );
    expect(rendered).toContain(
      "News flow around your coins leans bullish (3 of 5 stories).",
    );
  });

  test("falls back to breadth tone when news is quiet", () => {
    const rendered = renderSegments(
      buildOverviewSummarySegments({
        portfolioChangePct: null,
        marketChangePct: null,
        sentiment: aggregateNewsSentiment([]),
        breadth: {
          advancers: 6,
          decliners: 2,
          flat: 1,
          medianChangePct: 1.4,
          spreadPct: 5,
          bigMovers: 1,
        },
      }),
    );
    expect(rendered).toBe("6 of 9 coins are trading higher over the last 24h.");
  });

  test("merges the joining space into adjacent text segments", () => {
    const segments = buildOverviewSummarySegments({
      portfolioChangePct: 1,
      marketChangePct: null,
      sentiment: null,
      breadth: {
        advancers: 1,
        decliners: 4,
        flat: 0,
        medianChangePct: -2,
        spreadPct: 4,
        bigMovers: 0,
      },
    });
    const rendered = renderSegments(segments);
    expect(rendered).toBe(
      "Your portfolio is up {1} over the last 24h; the market benchmark is still warming up. 4 of 5 coins are trading lower over the last 24h.",
    );
    // No two adjacent text segments survive the merge.
    for (let i = 1; i < segments.length; i++) {
      const a = segments[i - 1];
      const b = segments[i];
      expect(a?.kind === "text" && b?.kind === "text").toBe(false);
    }
  });
});
