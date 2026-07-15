import type { Metadata } from "next"
import { cache } from "react"
import { createMetadata, getAppBaseUrl } from "@/lib/metadata"
import { TokenPageShell } from "./token-page-shell"

interface CoinGeckoCoin {
  coingeckoId: string
  name: string
  symbol: string
  logoUrl: string
}

interface PageProps {
  params: Promise<{ locale: string; id: string }>
}

const fetchCoinGeckoCoin = cache(async (id: string): Promise<CoinGeckoCoin | null> => {
  try {
    const baseUrl = getAppBaseUrl()
    const url = new URL(`/api/internal/coins/coingecko/${encodeURIComponent(id)}`, baseUrl)

    const response = await fetch(url, { next: { revalidate: 60 * 60 } })
    if (!response.ok) return null
    return (await response.json()) as CoinGeckoCoin | null
  } catch (error) {
    console.error("[TokenPage] Failed to load token metadata", { id, error })
    return null
  }
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params

  const coin = await fetchCoinGeckoCoin(id)
  const symbol = coin?.symbol ? coin.symbol.toUpperCase() : null
  const title = coin?.name && symbol ? `${coin.name} (${symbol}) · Charts` : "Charts"
  const description =
    coin?.name && symbol
      ? `Charts, indicators, and market data for ${coin.name} (${symbol}).`
      : "Charts, indicators, and market data."

  return createMetadata({
    title,
    description,
    pathname: `/watchlists/${id}`,
    locale,
    image: coin?.logoUrl,
  })
}

export default async function TokenPage({ params }: PageProps) {
  const { id } = await params

  // Screener-style instant UI: render the page frame immediately instead of
  // blocking first paint on the coin metadata roundtrip. The client resolves
  // name/symbol via the shared "coingecko-coin" query (PriceChart and the
  // blurred background already fetch it), and generateMetadata streams in
  // parallel without blocking the body.
  return <TokenPageShell id={id} />
}
