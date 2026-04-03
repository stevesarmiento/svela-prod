import type { QueryClient } from "@tanstack/react-query";
import type { CoinGeckoQuoteMarketData } from "@/lib/effect/coingecko-api";
import { coingeckoQuoteQueryKeys } from "@/hooks/use-coingecko-quotes";

export interface QuoteCachePatch {
  current_price: number;
  last_updated: string;
  confidenceUsd?: number | null;
  source?: "realtime" | "last-known";
}

export interface QuoteSeedMeta {
  name?: string;
  symbol?: string;
  image?: string;
}

function makeSeedQuote(coinId: string, seed: QuoteSeedMeta | undefined): CoinGeckoQuoteMarketData {
  return {
    id: coinId,
    name: seed?.name ?? coinId,
    symbol: seed?.symbol ?? coinId,
    market_cap_rank: null,
    image: seed?.image ?? "",
    current_price: null,
    market_cap: null,
    total_volume: null,
    price_change_percentage_24h: null,
    price_change_percentage_1h_in_currency: null,
    price_change_percentage_7d_in_currency: null,
    price_change_percentage_30d_in_currency: null,
    circulating_supply: null,
    max_supply: null,
    last_updated: undefined,
  };
}

export function patchCoinGeckoQuoteCaches(args: {
  queryClient: QueryClient;
  coinId: string;
  patch: QuoteCachePatch;
  seed?: QuoteSeedMeta;
}): void {
  const key = coingeckoQuoteQueryKeys.single(args.coinId);

  args.queryClient.setQueryData<CoinGeckoQuoteMarketData | null | undefined>(key, (old) => {
    if (old && old.current_price === args.patch.current_price && old.last_updated === args.patch.last_updated) {
      return old;
    }
    const base = old ?? makeSeedQuote(args.coinId, args.seed);
    return {
      ...base,
      current_price: args.patch.current_price,
      last_updated: args.patch.last_updated,
    };
  });

  // Keep bulk quote maps consistent with the canonical per-coin quote.
  const bulkQueries = args.queryClient.getQueryCache().findAll({ queryKey: ["coingecko-quotes"] });
  for (const bulkQuery of bulkQueries) {
    const bulkKey = bulkQuery.queryKey;
    args.queryClient.setQueryData<Record<string, CoinGeckoQuoteMarketData> | undefined>(
      bulkKey,
      (old) => {
        if (!old) return old;
        if (!(args.coinId in old)) return old;

        const prev = old[args.coinId];
        if (prev && prev.current_price === args.patch.current_price && prev.last_updated === args.patch.last_updated) {
          return old;
        }

        const base = prev ?? makeSeedQuote(args.coinId, args.seed);
        return {
          ...old,
          [args.coinId]: {
            ...base,
            current_price: args.patch.current_price,
            last_updated: args.patch.last_updated,
          },
        };
      },
    );
  }
}

