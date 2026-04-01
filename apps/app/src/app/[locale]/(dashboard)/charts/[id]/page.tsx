import type { Metadata } from "next"
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

async function fetchCoinGeckoCoin(id: string): Promise<CoinGeckoCoin | null> {
  const baseUrl = getAppBaseUrl()
  const url = new URL(`/api/internal/coins/coingecko/${encodeURIComponent(id)}`, baseUrl)

  const response = await fetch(url, { next: { revalidate: 60 * 60 } })
  if (!response.ok) return null
  return (await response.json()) as CoinGeckoCoin | null
}

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
    pathname: `/charts/${id}`,
    locale,
    image: coin?.logoUrl,
  })
}

export default async function TokenPage({ params }: PageProps) {
  const { id } = await params

  const coin = await fetchCoinGeckoCoin(id)

  return (
    <TokenPageShell
      id={id}
      initialTokenName={coin?.name}
      initialTokenSymbol={coin?.symbol}
    />
  )
}