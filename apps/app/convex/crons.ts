import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// CoinGecko markets (top 500) for discovery/search.
crons.interval(
  "coingecko_refresh_top_markets",
  { hours: 4 },
  internal.coingeckoJobs.refreshTopMarkets,
  { topN: 500 },
);

// Refresh market quotes for tracked coins (watchlists + portfolios).
crons.interval(
  "coingecko_refresh_tracked_markets",
  { hours: 1 },
  internal.coingeckoJobs.refreshTrackedMarketsBatch,
  { batchSize: 250 },
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
  "coingecko_refresh_market_chart_1d",
  { hours: 1 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "1", batchSize: 15 },
);

crons.interval(
  "coingecko_refresh_market_chart_7d",
  { hours: 1 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "7", batchSize: 15 },
);

crons.interval(
  "coingecko_refresh_market_chart_30d",
  { hours: 4 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "30", batchSize: 10 },
);

crons.interval(
  "coingecko_refresh_market_chart_365d",
  { hours: 24 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "365", batchSize: 8 },
);

crons.interval(
  "coingecko_refresh_market_chart_730d",
  { hours: 24 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "730", batchSize: 6 },
);

crons.interval(
  "coingecko_refresh_market_chart_1825d",
  { hours: 24 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "1825", batchSize: 2 },
);

// OHLC refresh (used by technical analysis & tooltips).
crons.interval(
  "coingecko_refresh_ohlc_1",
  { hours: 4 },
  internal.coingeckoJobs.refreshTrackedOhlcBatch,
  { days: "1", batchSize: 4 },
);

crons.interval(
  "coingecko_refresh_ohlc_7",
  { hours: 4 },
  internal.coingeckoJobs.refreshTrackedOhlcBatch,
  { days: "7", batchSize: 3 },
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

// Data cleanup (rolling).
crons.interval(
  "cleanup_old_market_data",
  { hours: 6 },
  internal.cleanupInternal._cleanupOldData,
  { olderThanDays: 30, batchSize: 250 },
);

// One-time-ish cleanup: remove legacy tracked coin membership.
// After `refreshTopMarkets` stopped writing `reason: "top"`, this will converge to 0 deletions.
crons.interval(
  "cleanup_tracked_coins_top_reason",
  { hours: 24 },
  internal.coingeckoState._deleteTrackedCoinsByReasonBatch,
  { reason: "top", batchSize: 2000 },
);

export default crons;
