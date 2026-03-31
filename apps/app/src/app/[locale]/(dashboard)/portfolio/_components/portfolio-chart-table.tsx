'use client'

import { useDeferredValue, useMemo } from "react"
import Link from "next/link"
import { cn } from "@v1/ui/cn"
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides"
import { formatUsdPrice } from "@/lib/format-usd"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import type { CoinMarketData } from "@/types/coins"
import { TokenLogo } from "@/components/token-logo"

interface PortfolioChartTableProps {
  coins: CoinMarketData[]
  activeTimeScale: string
}

function getTimeScaleLabel(scale: string): string {
  switch (scale) {
    case "1d":
      return "1D"
    case "7d":
      return "1W"
    case "30d":
      return "1M"
    case "max":
      return "1Y"
    case "2y":
      return "Max"
    default:
      return scale.toUpperCase()
  }
}

export function PortfolioChartTable({ coins, activeTimeScale }: PortfolioChartTableProps) {
  const deferredCoins = useDeferredValue(coins)
  const deferredTimeScale = useDeferredValue(activeTimeScale)

  const coinsWithIntervalChange = useMemo(() => {
    const enriched = deferredCoins.map((coin) => {
      let intervalChange = 0
      const usd = coin.quote?.USD
      if (usd) {
        switch (deferredTimeScale) {
          case "1d":
            intervalChange = usd.percent_change_24h ?? 0
            break
          case "7d":
            intervalChange = usd.percent_change_7d ?? usd.percent_change_24h ?? 0
            break
          case "30d":
            intervalChange = usd.percent_change_30d ?? usd.percent_change_7d ?? usd.percent_change_24h ?? 0
            break
          case "max":
            intervalChange = usd.percent_change_30d ?? usd.percent_change_7d ?? usd.percent_change_24h ?? 0
            break
          case "2y":
            intervalChange = Number.NaN
            break
          default:
            intervalChange = usd.percent_change_24h ?? 0
        }
      }

      return { ...coin, intervalChange }
    })

    enriched.sort((a, b) => (b.quote?.USD?.volume_24h ?? 0) - (a.quote?.USD?.volume_24h ?? 0))
    return enriched
  }, [deferredCoins, deferredTimeScale])

  if (!coins.length) return null

  return (
    <div className="space-y-4">
      {coinsWithIntervalChange.map((coin) => {
        const tokenName = cleanTokenName(coin.name)
        const tokenLogoUrl = getTokenLogoURL(coin.symbol, coin.image)
        const safeTokenLogoUrl =
          tokenLogoUrl && (tokenLogoUrl.startsWith("http") || tokenLogoUrl.startsWith("/"))
            ? tokenLogoUrl
            : undefined

        return (
          <div key={coin.id} className="rounded-[10px] bg-primary/5 p-0.5">
            {/* Header */}
            <div className="px-3 py-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <TokenLogo
                        src={safeTokenLogoUrl}
                        alt={tokenName}
                        sizePx={16}
                        fallbackText={coin.symbol}
                        className="ring-1 ring-zinc-200 dark:ring-black/80"
                        quality={70}
                      />
                    </div>
                    <span className="text-muted-foreground">{tokenName}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1">Volume 24h</div>
                  <div className="flex items-center justify-end gap-1">
                    {getTimeScaleLabel(activeTimeScale)} Change
                  </div>
                </div>
              </div>
            </div>

            {/* Row */}
            <Link
              href={`/charts/${coin.id}`}
              className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden hover:ring-2 hover:ring-zinc-200/30 transition-all duration-100 grid grid-cols-3 gap-4 px-4 py-2 pr-2 hover:bg-primary/[0.02] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs">{coin.symbol.toUpperCase()}</span>
                <span className="text-primary/40 text-xs">price is currently</span>
                <span className="font-berkeley-mono text-xs font-semibold">
                  {formatUsdPrice(coin.quote.USD.price)}
                </span>
              </div>

              <div className="flex items-center justify-end">
                <span className="font-berkeley-mono text-xs">${formatLargeNumber(coin.quote.USD.volume_24h || 0)}</span>
              </div>

              <div className="flex items-center justify-end">
                {Number.isNaN((coin as unknown as { intervalChange?: number }).intervalChange) ? (
                  <span className="font-berkeley-mono text-xs text-muted-foreground">N/A</span>
                ) : (
                  <span
                    className={cn(
                      "font-berkeley-mono text-xs",
                      (coin as unknown as { intervalChange: number }).intervalChange > 0 ? "text-emerald-500" : "text-rose-500",
                    )}
                  >
                    {(coin as unknown as { intervalChange: number }).intervalChange > 0 ? "+" : ""}
                    {(coin as unknown as { intervalChange: number }).intervalChange.toFixed(2)}%
                  </span>
                )}
              </div>
            </Link>
          </div>
        )
      })}
    </div>
  )
}

