import type { WatchlistGroupPreview } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-card";
import type { BreadthGroupRow } from "@/app/[locale]/(dashboard)/overview/overview-portfolio-breadth";
import type { OverviewEvent } from "@/app/[locale]/(dashboard)/overview/overview-events-feed-card/types";
import type { BreadthStats } from "@/lib/overview-daily-brief";
import type { CoinMarketData } from "@/types/coins";

/** Chart point; `time` is unix seconds (Liveline's native unit). */
export interface SeriesPoint {
  time: number;
  value: number;
}

/**
 * A fully-populated market row: assignable to both `CoinMarketData` (screener
 * table) and the watchlist card's stricter coin type.
 */
export interface ShowcaseCoin extends CoinMarketData {
  image: string;
  cmc_rank: number;
  quote: {
    USD: CoinMarketData["quote"]["USD"] & {
      price: number;
      volume_24h: number;
      market_cap: number;
      percent_change_24h: number;
    };
  };
}

export interface ShowcaseWatchlist {
  group: WatchlistGroupPreview;
  coins: ShowcaseCoin[];
  /** 1d aggregate % series consumed by `WatchlistAggregateChart`. */
  aggregatePoints: SeriesPoint[];
  latestChange: number;
}

export interface ShowcaseOverview {
  valueUsd: number;
  rangeChange: { deltaUsd: number; deltaPct: number; isAvailable: boolean };
  /** Rebased to 100 at the window start. */
  portfolioPoints: SeriesPoint[];
  marketPoints: SeriesPoint[];
  breadth: BreadthStats | null;
  breadthGroups: BreadthGroupRow[];
  events: OverviewEvent[];
}

export interface LoginShowcaseData {
  /** Server clock at build time; the client never calls `Date.now()` for layout. */
  generatedAtMs: number;
  watchlists: ShowcaseWatchlist[];
  screenerCoins: ShowcaseCoin[];
  /** 7d hourly price series per screener coin, for the inline trail cell. */
  screenerTrailById: Record<string, SeriesPoint[]>;
  overview: ShowcaseOverview;
}
