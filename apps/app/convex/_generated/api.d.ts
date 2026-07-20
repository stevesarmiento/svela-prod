/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_breadth from "../_lib/breadth.js";
import type * as _lib_chartFreshness from "../_lib/chartFreshness.js";
import type * as _lib_coingeckoFetch from "../_lib/coingeckoFetch.js";
import type * as _lib_holdings from "../_lib/holdings.js";
import type * as _lib_overview_signals from "../_lib/overview_signals.js";
import type * as _lib_server_token from "../_lib/server_token.js";
import type * as _lib_technicalMetrics from "../_lib/technicalMetrics.js";
import type * as _lib_user_lookup from "../_lib/user_lookup.js";
import type * as apiKeys from "../apiKeys.js";
import type * as apiKeysActions from "../apiKeysActions.js";
import type * as chartScheduler from "../chartScheduler.js";
import type * as cleanupInternal from "../cleanupInternal.js";
import type * as clerkUserMigration from "../clerkUserMigration.js";
import type * as coingeckoCoinsInternal from "../coingeckoCoinsInternal.js";
import type * as coingeckoJobs from "../coingeckoJobs.js";
import type * as coingeckoMarkets from "../coingeckoMarkets.js";
import type * as coingeckoNews from "../coingeckoNews.js";
import type * as coingeckoNewsJobs from "../coingeckoNewsJobs.js";
import type * as coingeckoNewsWriters from "../coingeckoNewsWriters.js";
import type * as coingeckoReads from "../coingeckoReads.js";
import type * as coingeckoState from "../coingeckoState.js";
import type * as coingeckoWarmup from "../coingeckoWarmup.js";
import type * as coingeckoWriters from "../coingeckoWriters.js";
import type * as coinglassJobs from "../coinglassJobs.js";
import type * as coinglassMigration from "../coinglassMigration.js";
import type * as coinglassReads from "../coinglassReads.js";
import type * as coinglassWarmup from "../coinglassWarmup.js";
import type * as coinglassWriters from "../coinglassWriters.js";
import type * as coins from "../coins.js";
import type * as crons from "../crons.js";
import type * as holdingsMigration from "../holdingsMigration.js";
import type * as lastKnownPrices from "../lastKnownPrices.js";
import type * as overview from "../overview.js";
import type * as portfolio from "../portfolio.js";
import type * as portfolioJobs from "../portfolioJobs.js";
import type * as refresh from "../refresh.js";
import type * as retention from "../retention.js";
import type * as smartScreenerTelemetry from "../smartScreenerTelemetry.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";
import type * as watchlists from "../watchlists.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/breadth": typeof _lib_breadth;
  "_lib/chartFreshness": typeof _lib_chartFreshness;
  "_lib/coingeckoFetch": typeof _lib_coingeckoFetch;
  "_lib/holdings": typeof _lib_holdings;
  "_lib/overview_signals": typeof _lib_overview_signals;
  "_lib/server_token": typeof _lib_server_token;
  "_lib/technicalMetrics": typeof _lib_technicalMetrics;
  "_lib/user_lookup": typeof _lib_user_lookup;
  apiKeys: typeof apiKeys;
  apiKeysActions: typeof apiKeysActions;
  chartScheduler: typeof chartScheduler;
  cleanupInternal: typeof cleanupInternal;
  clerkUserMigration: typeof clerkUserMigration;
  coingeckoCoinsInternal: typeof coingeckoCoinsInternal;
  coingeckoJobs: typeof coingeckoJobs;
  coingeckoMarkets: typeof coingeckoMarkets;
  coingeckoNews: typeof coingeckoNews;
  coingeckoNewsJobs: typeof coingeckoNewsJobs;
  coingeckoNewsWriters: typeof coingeckoNewsWriters;
  coingeckoReads: typeof coingeckoReads;
  coingeckoState: typeof coingeckoState;
  coingeckoWarmup: typeof coingeckoWarmup;
  coingeckoWriters: typeof coingeckoWriters;
  coinglassJobs: typeof coinglassJobs;
  coinglassMigration: typeof coinglassMigration;
  coinglassReads: typeof coinglassReads;
  coinglassWarmup: typeof coinglassWarmup;
  coinglassWriters: typeof coinglassWriters;
  coins: typeof coins;
  crons: typeof crons;
  holdingsMigration: typeof holdingsMigration;
  lastKnownPrices: typeof lastKnownPrices;
  overview: typeof overview;
  portfolio: typeof portfolio;
  portfolioJobs: typeof portfolioJobs;
  refresh: typeof refresh;
  retention: typeof retention;
  smartScreenerTelemetry: typeof smartScreenerTelemetry;
  userSettings: typeof userSettings;
  users: typeof users;
  watchlists: typeof watchlists;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
