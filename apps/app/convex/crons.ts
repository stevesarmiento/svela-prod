import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// CoinGecko markets (top 500) + membership tracking.
crons.interval(
  "coingecko_refresh_top_markets",
  { minutes: 1 },
  internal.coingeckoJobs.refreshTopMarkets,
  { topN: 500 },
);

// Refresh market quotes for all tracked coins (watchlists + top).
crons.interval(
  "coingecko_refresh_tracked_markets",
  { minutes: 1 },
  internal.coingeckoJobs.refreshTrackedMarketsBatch,
  { batchSize: 250 },
);

// Market chart refresh (DB is source of truth; keep series warm).
crons.interval(
  "coingecko_refresh_market_chart_1d",
  { minutes: 1 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "1", batchSize: 15 },
);

crons.interval(
  "coingecko_refresh_market_chart_7d",
  { minutes: 1 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "7", batchSize: 15 },
);

crons.interval(
  "coingecko_refresh_market_chart_30d",
  { minutes: 2 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "30", batchSize: 10 },
);

crons.interval(
  "coingecko_refresh_market_chart_365d",
  { hours: 2 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "365", batchSize: 8 },
);

crons.interval(
  "coingecko_refresh_market_chart_730d",
  { hours: 6 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "730", batchSize: 6 },
);

crons.interval(
  "coingecko_refresh_market_chart_1825d",
  { hours: 12 },
  internal.coingeckoJobs.refreshTrackedMarketChartBatch,
  { days: "1825", batchSize: 2 },
);

// OHLC refresh (used by technical analysis & tooltips).
crons.interval(
  "coingecko_refresh_ohlc_1",
  { minutes: 5 },
  internal.coingeckoJobs.refreshTrackedOhlcBatch,
  { days: "1", batchSize: 4 },
);

crons.interval(
  "coingecko_refresh_ohlc_7",
  { minutes: 10 },
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
  { minutes: 10 },
  internal.coinglassJobs.refreshTrackedSpotTakerBuySellVolumeHistoryBatch,
  { exchange: "Binance", interval: "4h", batchSize: 10, limit: 42 },
);

crons.interval(
  "coinglass_refresh_futures_taker_buy_sell_volume_4h",
  { minutes: 10 },
  internal.coinglassJobs.refreshTrackedFuturesTakerBuySellVolumeHistoryBatch,
  { exchange: "Binance", interval: "4h", batchSize: 10, limit: 42 },
);

// CoinGlass open interest (cached in DB).
crons.interval(
  "coinglass_refresh_open_interest_4h",
  { minutes: 10 },
  internal.coinglassJobs.refreshTrackedOpenInterestHistoryBatch,
  { interval: "4h", unit: "usd", batchSize: 10, limit: 50 },
);

// CoinGlass liquidation history (cached in DB).
crons.interval(
  "coinglass_refresh_liquidations_1d",
  { minutes: 20 },
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
  { minutes: 10 },
  internal.coinglassJobs.refreshTrackedTakerBuySellExchangeListSnapshotBatch,
  { range: "24h", batchSize: 10 },
);

// Sync CoinGecko's coin universe (new listings) into `coingeckoCoins`.
crons.interval(
  "coingecko_sync_coins_list",
  { hours: 1 },
  internal.coingeckoJobs.syncCoinGeckoCoinsListBatch,
  { batchSize: 1000 },
);

// Data cleanup (rolling).
crons.interval(
  "cleanup_old_market_data",
  { hours: 6 },
  internal.cleanupInternal._cleanupOldData,
  { olderThanDays: 30, batchSize: 250 },
);

export default crons;
