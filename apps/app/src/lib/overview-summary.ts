/**
 * Pure composition logic for the overview summary card: portfolio vs market
 * 24h change, aggregated news sentiment, and the human-readable sentence
 * segments rendered above the activity feed.
 *
 * Segments are structured (`text` | `pct`) so the card can inline percent
 * badges without any string parsing.
 */

import type { BreadthStats } from "./overview-daily-brief";

/**
 * Value-weighted 24h change: Σ(value·pct) / Σ(value) over coins that have
 * both a positive USD value and a finite change percent. Coins missing a
 * quote are excluded from the denominator too, so partial quote maps don't
 * drag the average toward zero.
 */
export function computeValueWeighted24hChangePct(
  rows: ReadonlyArray<{ valueUsd: number; changePct: number | null }>,
): number | null {
  let weightedSum = 0;
  let totalValueUsd = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.valueUsd) || row.valueUsd <= 0) continue;
    if (row.changePct === null || !Number.isFinite(row.changePct)) continue;
    weightedSum += row.valueUsd * row.changePct;
    totalValueUsd += row.valueUsd;
  }
  if (totalValueUsd <= 0) return null;
  return weightedSum / totalValueUsd;
}

/** First→last percent change of a series; null when it can't be computed. */
export function computeSeriesChangePct(
  points: ReadonlyArray<{ time: number; value: number }>,
): number | null {
  if (points.length < 2) return null;
  const startValue = points[0]?.value;
  const endValue = points[points.length - 1]?.value;
  if (
    startValue === undefined ||
    !Number.isFinite(startValue) ||
    startValue <= 0
  )
    return null;
  if (endValue === undefined || !Number.isFinite(endValue)) return null;
  return ((endValue - startValue) / startValue) * 100;
}

export type NewsSentimentLean = "bullish" | "bearish" | "mixed" | "quiet";

export interface NewsSentimentSummary {
  bullish: number;
  bearish: number;
  neutral: number;
  total: number;
  lean: NewsSentimentLean;
}

/**
 * Tally scored articles into a lean. A lean needs a margin (strictly more
 * than one extra story) so a 2-vs-1 tape reads as "mixed", not "bullish".
 */
export function aggregateNewsSentiment(
  rows: ReadonlyArray<{ sentiment: "bullish" | "bearish" | "neutral" | null }>,
): NewsSentimentSummary {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const row of rows) {
    if (row.sentiment === "bullish") bullish++;
    else if (row.sentiment === "bearish") bearish++;
    else if (row.sentiment === "neutral") neutral++;
  }
  const total = bullish + bearish + neutral;
  const lean: NewsSentimentLean =
    total === 0
      ? "quiet"
      : bullish > bearish + 1
        ? "bullish"
        : bearish > bullish + 1
          ? "bearish"
          : "mixed";
  return { bullish, bearish, neutral, total, lean };
}

export type SummarySegment =
  | { kind: "text"; text: string }
  | { kind: "pct"; value: number };

/** Portfolio and market are "in line" within this many percentage points. */
const IN_LINE_BAND_PP = 0.25;

function directionWord(pct: number): "up" | "down" | "flat" {
  if (pct > 0) return "up";
  if (pct < 0) return "down";
  return "flat";
}

function text(value: string): SummarySegment {
  return { kind: "text", text: value };
}

function pct(value: number): SummarySegment {
  return { kind: "pct", value };
}

function buildPerformanceSentence(args: {
  portfolioChangePct: number | null;
  marketChangePct: number | null;
}): SummarySegment[] {
  const { portfolioChangePct, marketChangePct } = args;

  if (portfolioChangePct !== null && marketChangePct !== null) {
    const diff = portfolioChangePct - marketChangePct;
    const relation =
      Math.abs(diff) < IN_LINE_BAND_PP
        ? "in line with"
        : diff > 0
          ? "ahead of"
          : "behind";
    return [
      text(`Your portfolio is ${directionWord(portfolioChangePct)} `),
      pct(portfolioChangePct),
      text(` today, ${relation} the market's `),
      pct(marketChangePct),
      text("."),
    ];
  }

  if (portfolioChangePct !== null) {
    return [
      text(`Your portfolio is ${directionWord(portfolioChangePct)} `),
      pct(portfolioChangePct),
      text(" over the last 24h; the market benchmark is still warming up."),
    ];
  }

  if (marketChangePct !== null) {
    return [
      text(`The broader market is ${directionWord(marketChangePct)} `),
      pct(marketChangePct),
      text(" over the last 24h."),
    ];
  }

  return [];
}

function buildToneSentence(args: {
  sentiment: NewsSentimentSummary | null;
  breadth: BreadthStats | null;
}): SummarySegment[] {
  const { sentiment, breadth } = args;

  if (sentiment && sentiment.total > 0 && sentiment.lean !== "quiet") {
    if (sentiment.lean === "bullish") {
      return [
        text(
          `News flow around your coins leans bullish (${sentiment.bullish} of ${sentiment.total} ${sentiment.total === 1 ? "story" : "stories"}).`,
        ),
      ];
    }
    if (sentiment.lean === "bearish") {
      return [
        text(
          `News flow around your coins leans bearish (${sentiment.bearish} of ${sentiment.total} ${sentiment.total === 1 ? "story" : "stories"}).`,
        ),
      ];
    }
    return [
      text(
        `News flow around your coins is mixed across ${sentiment.total} ${sentiment.total === 1 ? "story" : "stories"}.`,
      ),
    ];
  }

  if (breadth) {
    const total = breadth.advancers + breadth.decliners + breadth.flat;
    if (total > 0) {
      if (breadth.advancers > breadth.decliners) {
        return [
          text(
            `${breadth.advancers} of ${total} ${total === 1 ? "coin is" : "coins are"} trading higher over the last 24h.`,
          ),
        ];
      }
      if (breadth.decliners > breadth.advancers) {
        return [
          text(
            `${breadth.decliners} of ${total} ${total === 1 ? "coin is" : "coins are"} trading lower over the last 24h.`,
          ),
        ];
      }
      return [
        text(
          "Your coins are evenly split between gainers and losers over the last 24h.",
        ),
      ];
    }
  }

  return [];
}

/** Merge adjacent text segments so renderers get the fewest nodes possible. */
function mergeAdjacentText(segments: SummarySegment[]): SummarySegment[] {
  const merged: SummarySegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (segment.kind === "text" && previous?.kind === "text") {
      merged[merged.length - 1] = text(previous.text + segment.text);
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

/**
 * Compose the summary prose: a performance sentence (portfolio vs market,
 * degrading to whichever side is available) followed by a tone sentence
 * (news sentiment, falling back to breadth). Empty when nothing is known.
 */
export function buildOverviewSummarySegments(args: {
  portfolioChangePct: number | null;
  marketChangePct: number | null;
  sentiment: NewsSentimentSummary | null;
  breadth: BreadthStats | null;
}): SummarySegment[] {
  const performance = buildPerformanceSentence(args);
  const tone = buildToneSentence(args);

  const segments: SummarySegment[] = [...performance];
  if (performance.length > 0 && tone.length > 0) segments.push(text(" "));
  segments.push(...tone);
  return mergeAdjacentText(segments);
}
