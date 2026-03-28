/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_server_token from "../_lib/server_token.js";
import type * as apiKeys from "../apiKeys.js";
import type * as apiKeysActions from "../apiKeysActions.js";
import type * as cleanupInternal from "../cleanupInternal.js";
import type * as coingeckoCoinsInternal from "../coingeckoCoinsInternal.js";
import type * as coingeckoJobs from "../coingeckoJobs.js";
import type * as coingeckoMarkets from "../coingeckoMarkets.js";
import type * as coingeckoReads from "../coingeckoReads.js";
import type * as coingeckoState from "../coingeckoState.js";
import type * as coingeckoWarmup from "../coingeckoWarmup.js";
import type * as coingeckoWriters from "../coingeckoWriters.js";
import type * as coins from "../coins.js";
import type * as crons from "../crons.js";
import type * as historicalData from "../historicalData.js";
import type * as portfolio from "../portfolio.js";
import type * as portfolioJobs from "../portfolioJobs.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";
import type * as watchlists from "../watchlists.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/server_token": typeof _lib_server_token;
  apiKeys: typeof apiKeys;
  apiKeysActions: typeof apiKeysActions;
  cleanupInternal: typeof cleanupInternal;
  coingeckoCoinsInternal: typeof coingeckoCoinsInternal;
  coingeckoJobs: typeof coingeckoJobs;
  coingeckoMarkets: typeof coingeckoMarkets;
  coingeckoReads: typeof coingeckoReads;
  coingeckoState: typeof coingeckoState;
  coingeckoWarmup: typeof coingeckoWarmup;
  coingeckoWriters: typeof coingeckoWriters;
  coins: typeof coins;
  crons: typeof crons;
  historicalData: typeof historicalData;
  portfolio: typeof portfolio;
  portfolioJobs: typeof portfolioJobs;
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
