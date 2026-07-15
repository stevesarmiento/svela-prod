"use client";

import { getTokenLogoURL } from "@/lib/logo-overrides";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { useCoinGeckoQuotesBulk } from "./use-coingecko-quotes";

export const WATCHLIST_PICKER_STACK_SIZE = 4;

export interface WatchlistPickerLogo {
  coinId: string;
  symbol: string;
  src?: string;
}

export interface WatchlistPickerGroupExtras {
  /** Total tokens in the watchlist. */
  count: number;
  /** First few tokens for the overlapping logo stack. */
  logos: WatchlistPickerLogo[];
}

/**
 * Per-watchlist token counts + logo-stack data for the command palette's
 * watchlist picker. The bottom nav renders outside the watchlists page's
 * bootstrap provider, so this fetches the same Convex bootstrap query
 * directly — lazily (`skip` until the picker is shown). Logo images come
 * from the CoinGecko bulk quotes cache (only the stacked coins are fetched).
 */
export function useWatchlistPickerExtras(enabled: boolean) {
  const bootstrap = useQuery(
    api.watchlists.getMyWatchlistsPageBootstrap,
    enabled ? {} : "skip",
  );

  const stackCoinIds = useMemo(() => {
    if (!bootstrap) return [];
    return Object.values(bootstrap.itemsByGroupId).flatMap((items) =>
      items.slice(0, WATCHLIST_PICKER_STACK_SIZE).map((item) => item.coinId),
    );
  }, [bootstrap]);

  const quotesQuery = useCoinGeckoQuotesBulk(stackCoinIds, {
    mode: "bestEffort",
  });

  const extrasByGroupId = useMemo(() => {
    const out = new Map<string, WatchlistPickerGroupExtras>();
    if (!bootstrap) return out;
    const quotesById = quotesQuery.data ?? {};

    for (const [groupId, items] of Object.entries(bootstrap.itemsByGroupId)) {
      const logos = items
        .slice(0, WATCHLIST_PICKER_STACK_SIZE)
        .map((item): WatchlistPickerLogo => {
          const quote = quotesById[item.coinId];
          const logoUrl = quote
            ? getTokenLogoURL(quote.symbol, quote.image)
            : undefined;
          return {
            coinId: item.coinId,
            symbol: quote?.symbol ?? item.coinId,
            src:
              logoUrl?.startsWith("http") || logoUrl?.startsWith("/")
                ? logoUrl
                : undefined,
          };
        });
      out.set(groupId, { count: items.length, logos });
    }
    return out;
  }, [bootstrap, quotesQuery.data]);

  return {
    extrasByGroupId,
    isLoading: enabled && bootstrap === undefined,
  };
}
