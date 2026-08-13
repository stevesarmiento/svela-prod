'use client'

import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CoinsInternalApi } from '@/lib/effect/coins-internal-api'
import { runPromise as runCoinsInternalPromise } from '@/lib/effect/runtime-coins-internal'
import { cleanTokenName, getTokenLogoURL } from '@/lib/logo-overrides'

interface TokenHeaderData {
  id: string
  name: string
  symbol: string
  logoUrl: string
}

export function useTokenHeader() {
  const pathname = usePathname()
  
  // Check if we're on a chart detail page and extract coin ID
  const pathSegments = pathname.split('/').filter(segment => segment !== '')
  
  let isChartDetailPage = false
  let coingeckoId: string | null = null

  // Check for pattern: watchlists/[id] or [locale]/watchlists/[id]
  // (also matches the legacy charts/[id] route while it redirects)
  const baseSegment = pathSegments.includes('watchlists')
    ? 'watchlists'
    : pathSegments.includes('charts')
      ? 'charts'
      : null

  if (baseSegment && pathSegments.length >= 2) {
    const baseIndex = pathSegments.indexOf(baseSegment)
    if (baseIndex + 1 < pathSegments.length && pathSegments[baseIndex + 1]) {
      isChartDetailPage = true
      coingeckoId = pathSegments[baseIndex + 1] || null
    }
  }

  const { data: coinData, isLoading } = useQuery({
    // Shared key family with prefetch-routes.ts, which seeds the same
    // CoinMeta-or-null shape via CoinsInternalApi.getCoinGeckoCoinById.
    queryKey: ["coingecko-coin", coingeckoId],
    queryFn: async ({ signal }) => {
      if (!coingeckoId) throw new Error("no coin id")
      return await runCoinsInternalPromise(
        CoinsInternalApi.use((api) => api.getCoinGeckoCoinById({ id: coingeckoId })),
        { signal },
      )
    },
    enabled: !!coingeckoId,
    staleTime: 10 * 60 * 1000,
  })

  // Transform CoinGecko data to match expected interface
  const tokenData: TokenHeaderData | null = coinData ? {
    id: coinData.coingeckoId,
    name: cleanTokenName(coinData.name),
    symbol: coinData.symbol.toUpperCase(),
    logoUrl: getTokenLogoURL(coinData.symbol, coinData.logoUrl) ?? coinData.logoUrl
  } : null

  return {
    isChartDetailPage,
    tokenData,
    isLoading
  }
}