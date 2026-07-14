'use client'

import type { QueryClient } from "@tanstack/react-query"
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import type { CoinMarketData } from "@/types/coins"
import { CoinsInternalApi } from "@/lib/effect/coins-internal-api"
import { runPromise } from "@/lib/effect/runtime-coins-internal"
import {
  COINGECKO_QUOTES_QUERY_OPTIONS,
  coingeckoQuoteQueryKeys,
  fetchCoinGeckoQuote,
} from "@/hooks/use-coingecko-quotes"
import { fetchCoinGeckoCombinedChartData } from "@/hooks/use-coingecko-chart-data"
import {
  fetchScreenerTopMarkets,
  screenerTopMarketsQueryKey,
} from "@/hooks/use-screener-top-markets"

const DASHBOARD_PREFETCH_PATHS = new Set(["/overview", "/watchlists", "/screener"])

function toQuoteSeed(
  quote: Awaited<ReturnType<typeof fetchCoinGeckoQuote>>,
): CoinMarketData["quote"]["USD"] {
  return {
    price: quote?.current_price ?? 0,
    volume_24h: quote?.total_volume ?? 0,
    market_cap: quote?.market_cap ?? 0,
    percent_change_24h: quote?.price_change_percentage_24h ?? 0,
    percent_change_1h: quote?.price_change_percentage_1h_in_currency ?? 0,
    percent_change_7d: quote?.price_change_percentage_7d_in_currency ?? 0,
    percent_change_30d: quote?.price_change_percentage_30d_in_currency ?? 0,
  }
}

function runWhenIdle(task: () => void) {
  if (typeof window === "undefined") return
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => {
      task()
    }, { timeout: 1_500 })
    return
  }
  setTimeout(task, 150)
}

export function isDashboardPrefetchPath(pathname: string) {
  return DASHBOARD_PREFETCH_PATHS.has(pathname)
}

export function extractChartCoinId(pathname: string) {
  const match = pathname.match(/^\/(?:watchlists|charts)\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function prefetchDashboardRoute(
  router: Pick<AppRouterInstance, "prefetch">,
  href: string,
) {
  void router.prefetch(href)
}

export async function prefetchScreenerRoute(args: {
  router: Pick<AppRouterInstance, "prefetch">
  queryClient: QueryClient
  href?: string
  limit?: number
}) {
  const href = args.href ?? "/screener"
  const limit = args.limit ?? 500

  void args.router.prefetch(href)
  await args.queryClient.prefetchQuery({
    queryKey: screenerTopMarketsQueryKey(limit),
    queryFn: async () => await fetchScreenerTopMarkets(limit),
    staleTime: 60 * 60 * 1000,
  })
}

export async function prefetchChartRoute(args: {
  router: Pick<AppRouterInstance, "prefetch">
  queryClient: QueryClient
  coinId: string
  href?: string
}) {
  const href = args.href ?? `/watchlists/${args.coinId}`
  void args.router.prefetch(href)

  const quote = await args.queryClient.fetchQuery({
    queryKey: coingeckoQuoteQueryKeys.single(args.coinId),
    queryFn: async () => await fetchCoinGeckoQuote(args.coinId),
    staleTime: COINGECKO_QUOTES_QUERY_OPTIONS.staleTime,
  })

  await args.queryClient.prefetchQuery({
    queryKey: ["coingecko-coin", args.coinId],
    queryFn: async () =>
      await runPromise(CoinsInternalApi.getCoinGeckoCoinById({ id: args.coinId })),
    staleTime: 10 * 60 * 1000,
  })

  runWhenIdle(() => {
    void args.queryClient.prefetchQuery({
      queryKey: ["coingecko-combined-chart-data", args.coinId, "30d", false],
      queryFn: async () =>
        await fetchCoinGeckoCombinedChartData({
          coinId: args.coinId,
          activeTimeScale: "30d",
          initialData: toQuoteSeed(quote),
          preferMarketChart: false,
        }),
      staleTime: 2 * 60 * 1000,
    })
  })
}
