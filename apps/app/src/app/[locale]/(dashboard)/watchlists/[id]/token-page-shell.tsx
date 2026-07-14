'use client'

import type { CoinMarketData } from '@/types/coins'
import Image from "next/image"
import { TokenPageClient } from './token-page-client'
import { memo, Suspense, useDeferredValue, useTransition } from 'react'
import { cn } from "@v1/ui/cn"
import { useQuery as useTanStackQuery } from '@tanstack/react-query'
import { CoinsInternalApi } from '@/lib/effect/coins-internal-api'
import { runPromise } from '@/lib/effect/runtime-coins-internal'
import { getTokenLogoURL } from '@/lib/logo-overrides'

interface TokenPageShellProps {
  id: string
  initialTokenName?: string
  initialTokenSymbol?: string
}

function createFallbackData(
  id: string,
  initialTokenName?: string,
  initialTokenSymbol?: string,
): CoinMarketData {
  return {
    id, // Keep as string for CoinGecko compatibility
    name: initialTokenName ?? id,
    symbol: (initialTokenSymbol ?? id).toUpperCase(),
    slug: `coin-${id}`,
    cmc_rank: 0,
    circulating_supply: 0,
    max_supply: null,
    quote: {
      USD: {
        price: 0,
        volume_24h: 0,
        market_cap: 0,
        percent_change_24h: 0,
      },
    },
  }
}

const BlurredBackground = memo(function BlurredBackground({
  id,
  tokenName,
  className,
  style,
}: {
  id: string
  tokenName: string
  className?: string
  style: React.CSSProperties
}) {
  // Resolve the real logo URL from the internal CoinGecko coin record —
  // shares the "coingecko-coin" query cache with the price chart, so this
  // costs no extra request. (The previous CMC URL was built from the
  // CoinGecko slug, but s2.coinmarketcap.com expects numeric CMC ids, so
  // every background image 403'd and the glow never rendered.)
  const { data: coinData } = useTanStackQuery({
    queryKey: ["coingecko-coin", id],
    queryFn: async () => {
      if (!id) return null
      return await runPromise(CoinsInternalApi.getCoinGeckoCoinById({ id }))
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  })

  const logoSrc = getTokenLogoURL(coinData?.symbol, coinData?.logoUrl)
  if (!logoSrc || !(logoSrc.startsWith('http') || logoSrc.startsWith('/'))) return null

  return (
    <div className={cn(className)} style={style}>
      <Image
        src={logoSrc}
        alt={`${tokenName} background`}
        className="w-full h-full object-cover"
        width={700}
        height={700}
        priority={false}
        loading="lazy"
        style={{
          imageRendering: 'crisp-edges',
          backfaceVisibility: 'hidden',
          perspective: 1000,
        }}
      />
    </div>
  )
})

const TokenPageContent = memo(function TokenPageContent({
  id,
  initialTokenName,
  initialTokenSymbol,
}: {
  id: string
  initialTokenName?: string
  initialTokenSymbol?: string
}) {
  const [isPending] = useTransition()

  const deferredId = useDeferredValue(id)
  const tokenData = createFallbackData(deferredId, initialTokenName, initialTokenSymbol)

  const showPending = isPending

  return (
    <div
      className={cn(
        "min-h-screen w-full px-4 relative",
        showPending ? 'opacity-90 transition-opacity duration-200' : '',
      )}
    >
      <BlurredBackground
        id={deferredId}
        tokenName={tokenData.name}
        className="absolute z-0 pointer-events-none transform-gpu"
        style={{
          width: '700px',
          height: '700px',
          filter: 'blur(240px)',
          opacity: 1,
          left: '-10vw',
          top: '-350px',
          mixBlendMode: 'soft-light',
          contain: 'layout style paint',
        }}
      />

      <BlurredBackground
        id={deferredId}
        tokenName={tokenData.name}
        className="absolute z-0 pointer-events-none saturate-200 transform-gpu"
        style={{
          width: '479px',
          height: '479px',
          filter: 'blur(240px)',
          opacity: 1,
          right: '-5vw',
          top: '236px',
          mixBlendMode: 'soft-light',
          contain: 'layout style paint',
        }}
      />

      <TokenPageClient
        id={deferredId}
        tokenData={tokenData}
        isPending={showPending}
      />
    </div>
  )
})

function TokenPageErrorBoundary({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen w-full px-4 relative">{children}</div>
}

const TokenPageSkeleton = memo(function TokenPageSkeleton() {
  return (
    <div className="min-h-screen w-full px-4 relative">
      <div className="mx-auto py-6 px-4 relative z-10">
        <div className="animate-pulse motion-reduce:animate-none">
          <div className="h-96 bg-zinc-950/20 rounded-[20px] mb-6" />
          <div className="h-32 bg-zinc-950/20 rounded-[20px] mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="col-span-12 h-64 bg-zinc-950/20 rounded-[20px]" />
            <div className="col-span-12 h-64 bg-zinc-950/20 rounded-[20px]" />
          </div>
        </div>
      </div>
    </div>
  )
})

export const TokenPageShell = memo(function TokenPageShell({
  id,
  initialTokenName,
  initialTokenSymbol,
}: TokenPageShellProps) {
  return (
    <TokenPageErrorBoundary>
      <Suspense fallback={<TokenPageSkeleton />}>
        <TokenPageContent
          id={id}
          initialTokenName={initialTokenName}
          initialTokenSymbol={initialTokenSymbol}
        />
      </Suspense>
    </TokenPageErrorBoundary>
  )
})

