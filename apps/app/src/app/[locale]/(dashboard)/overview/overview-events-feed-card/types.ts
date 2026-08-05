export interface MoverRow {
  coingeckoId: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
  priceUsd: number;
  changePct: number;
  impactUsd: number | null;
}

export interface MoversSnapshot {
  generatedAt: number;
  coinCount: number;
  missingMarketDataCount: number;
  gainers: MoverRow[];
  losers: MoverRow[];
}

export type EventKind =
  | "news"
  | "price_spike"
  | "volume_anomaly"
  | "breakout_high"
  | "breakout_low";

export type EventTone = "positive" | "negative" | "neutral";
export type NewsSentiment = "bullish" | "bearish" | "neutral" | null;

export type NewsCategory =
  | "regulation"
  | "security"
  | "etf"
  | "partnership"
  | "market"
  | "tech"
  | "macro"
  | "other";

export interface OverviewEvent {
  id: string;
  articleId: string | null;
  kind: EventKind;
  tone: EventTone;
  sentiment: NewsSentiment;
  occurredAtMs: number;
  coingeckoId: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
  title: string;
  summary: string | null;
  /** AI 1-2 sentence article summary; absent on legacy cached snapshots. */
  aiSummary?: string | null;
  aiCategory?: NewsCategory | null;
  tokenHref: string;
  externalHref: string | null;
  valueUsd: number | null;
  percent: number | null;
}

export interface EventsFeedData {
  generatedAt: number;
  coinCount: number;
  limited: boolean;
  events: OverviewEvent[];
}
