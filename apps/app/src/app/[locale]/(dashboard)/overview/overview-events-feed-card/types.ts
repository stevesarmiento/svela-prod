import type { MoversSnapshot } from "../overview-movers-card";

export type EventKind =
  | "news"
  | "price_spike"
  | "volume_anomaly"
  | "breakout_high"
  | "breakout_low";

export type EventTone = "positive" | "negative" | "neutral";
export type NewsSentiment = "bullish" | "bearish" | "neutral" | null;

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

/** Shared movers wiring for activity feed header + post. */
export interface ActivityMoversProps {
  window: "24h" | "7d";
  onWindowChange: (window: "24h" | "7d") => void;
  watchlistCoinCount: number;
  limited: boolean;
  movers24h: MoversSnapshot;
  movers7d: MoversSnapshot;
  onRefreshNow: () => Promise<{
    scheduled: boolean;
    reason: string;
    coinsCount: number;
    walletsCount: number;
  }>;
}
