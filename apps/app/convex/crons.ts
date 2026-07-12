import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// CoinGecko markets (top 2500) for discovery/search.
crons.interval(
  "coingecko_refresh_top_markets",
  { hours: 4 },
  internal.coingeckoJobs.refreshTopMarkets,
  { topN: 2500 },
);

// Refresh market quotes for tracked coins (watchlists + portfolios).
crons.interval(
  "coingecko_refresh_tracked_markets",
  { minutes: 5 },
  internal.coingeckoJobs.refreshTrackedMarketsBatch,
  { batchSize: 500 },
);

// CoinGecko news (cached in DB; rotating batches).
crons.interval(
  "coingecko_refresh_news",
  { hours: 4 },
  internal.coingeckoNewsJobs.refreshTrackedCoinNewsBatch,
  { batchSize: 10, perPage: 5 },
);

// Market chart refresh (DB is source of truth; keep series warm).
crons.interval(
  "coingecko_refresh_global_market_cap_1d",
  { minutes: 30 },
  internal.coingeckoJobs.refreshGlobalMarketCapHistory,
  { days: "1" },
);

crons.interval(
  "coingecko_refresh_global_market_cap_7d",
  { hours: 6 },
  internal.coingeckoJobs.refreshGlobalMarketCapHistory,
  { days: "7" },
);

crons.interval(
  "coingecko_refresh_global_market_cap_30d",
  { hours: 6 },
  internal.coingeckoJobs.refreshGlobalMarketCapHistory,
  { days: "30" },
);

crons.interval(
  "coingecko_refresh_global_market_cap_365d",
  { hours: 6 },
  internal.coingeckoJobs.refreshGlobalMarketCapHistory,
  { days: "365" },
);

// Demand-prioritized chart refresh (replaces the old per-timeframe blind
// round-robin rotation). The tick drains due chartSeries rows oldest-first
// within timeframe-class shares under a hard daily budget; the reconciler
// keeps chartSeries rows seeded for watchlist/portfolio coins. See
// convex/chartScheduler.ts.
crons.interval(
  "chart_scheduler_tick",
  { minutes: 1 },
  internal.chartScheduler.tick,
  {},
);

crons.interval(
  "chart_series_reconcile",
  { hours: 1 },
  internal.chartScheduler.reconcileChartSeries,
  {},
);

// Coin image backfill for new/older rows.
crons.interval(
  "coingecko_refresh_coin_images",
  { hours: 24 },
  internal.coingeckoJobs.refreshCoinImagesBatch,
  { batchSize: 200 },
);

// CoinGlass spot taker buy/sell volume history (cached in DB; low cadence).
crons.interval(
  "coinglass_refresh_spot_taker_buy_sell_volume_4h",
  { hours: 4 },
  internal.coinglassJobs.refreshTrackedSpotTakerBuySellVolumeHistoryBatch,
  { exchange: "Binance", interval: "4h", batchSize: 10, limit: 42 },
);

crons.interval(
  "coinglass_refresh_futures_taker_buy_sell_volume_4h",
  { hours: 4 },
  internal.coinglassJobs.refreshTrackedFuturesTakerBuySellVolumeHistoryBatch,
  { exchange: "Binance", interval: "4h", batchSize: 10, limit: 42 },
);

// CoinGlass open interest (cached in DB).
crons.interval(
  "coinglass_refresh_open_interest_4h",
  { hours: 4 },
  internal.coinglassJobs.refreshTrackedOpenInterestHistoryBatch,
  { interval: "4h", unit: "usd", batchSize: 10, limit: 50 },
);

// CoinGlass liquidation history (cached in DB).
crons.interval(
  "coinglass_refresh_liquidations_1d",
  { hours: 4 },
  internal.coinglassJobs.refreshTrackedLiquidationHistoryBatch,
  {
    interval: "1d",
    exchangeList:
      "Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex",
    batchSize: 8,
    limit: 30,
  },
);

// CoinGlass taker buy/sell (exchange list snapshot; cached in DB).
crons.interval(
  "coinglass_refresh_taker_exchange_list_24h",
  { hours: 4 },
  internal.coinglassJobs.refreshTrackedTakerBuySellExchangeListSnapshotBatch,
  { range: "24h", batchSize: 10 },
);

// Sync CoinGecko's coin universe (new listings) into `coingeckoCoins`.
crons.interval(
  "coingecko_sync_coins_list",
  { hours: 24 },
  internal.coingeckoJobs.syncCoinGeckoCoinsListBatch,
  { batchSize: 1000 },
);

// Refresh portfolio wallet holdings (Helius/Birdeye). Per-wallet dedup is enforced in the job itself.
crons.interval(
  "portfolio_sync_wallets",
  { hours: 4 },
  internal.portfolioJobs.syncWalletsDaily,
  { batchSize: 25 },
);

// Expired API-cache rows (rolling).
crons.interval(
  "cleanup_expired_api_cache",
  { hours: 6 },
  internal.cleanupInternal._cleanupExpiredApiCache,
  { batchSize: 250 },
);

// Cleanup ephemeral last-known spot snapshots (per-session writers).
crons.interval(
  "cleanup_old_last_known_prices",
  { hours: 6 },
  internal.cleanupInternal._cleanupOldLastKnownPrices,
  { olderThanHours: 48, batchSize: 1000 },
);

// Retention: trim unbounded history tables (priceHistory short timeframes,
// globalMarketHistory, coinglass histories, orphaned news articles) back to
// their read windows. See convex/retention.ts for the per-table policies.
crons.interval(
  "retention_prune_history",
  { hours: 6 },
  internal.retention._runRetention,
  {},
);

export default crons;
