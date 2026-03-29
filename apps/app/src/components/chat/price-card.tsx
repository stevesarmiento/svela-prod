'use client'

import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { cn } from "@v1/ui/cn"
import Image from "next/image"
import Link from "next/link"
import NumberFlow from '@/components/number-flow'
import { useMemo } from 'react'
import { 
  IconLaurelLeading, 
  IconLaurelTrailing 
} from "symbols-react"
import { buildWatchlistUrl } from '@/lib/navigation-utils'
import { useQueryState } from 'nuqs'
import type { Time } from 'lightweight-charts'
import { useOptimizedChart } from '@/hooks/use-optimized-chart'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'

interface PriceCardProps {
  coingeckoId: string // CoinGecko ID (e.g., "bitcoin", "ethereum")
  name: string
  symbol: string
  currentPrice: number
  priceChangePercentage24h: number
  marketCap?: number
  totalVolume?: number
  marketCapRank?: number
  image?: string // CoinGecko image URL
  historical?: {
    data?: {
      prices?: Array<[number, number]> // CoinGecko format: [timestamp, price]
    }
  }
}

export function PriceCard({ 
  coingeckoId, 
  name, 
  symbol, 
  currentPrice, 
  priceChangePercentage24h, 
  marketCap, 
  totalVolume, 
  marketCapRank,
  image,
  historical 
}: PriceCardProps) {
  const [selectedGroupSlug] = useQueryState('wg', { defaultValue: '' })
  const isPositive = priceChangePercentage24h >= 0

  const chartData = useMemo(() => {
    // Validate currentPrice to prevent NaN values
    const validPrice = typeof currentPrice === 'number' && !Number.isNaN(currentPrice) && currentPrice > 0 ? currentPrice : 1;
    
    if (!historical?.data?.prices?.length) {
      // Fallback data for demo purposes using current price
      return Array.from({ length: 20 }, (_, i) => ({
        time: (Date.now() - (20 - i) * 60 * 60 * 1000) / 1000 as Time,
        value: validPrice * (0.95 + Math.random() * 0.1)
      }));
    }
    
    // Convert CoinGecko price data format: [timestamp, price]
    const historicalPoints = historical.data.prices
      .filter(([timestamp, priceValue]) => {
        // Filter out invalid data points
        return typeof timestamp === 'number' && 
               typeof priceValue === 'number' && 
               !Number.isNaN(timestamp) && 
               !Number.isNaN(priceValue) && 
               priceValue > 0;
      })
      .map(([timestamp, priceValue]) => ({
        time: (timestamp / 1000) as Time, // CoinGecko timestamps are in milliseconds
        value: priceValue
      }));

    // If no valid historical data, fall back to generated data
    if (historicalPoints.length === 0) {
      return Array.from({ length: 20 }, (_, i) => ({
        time: (Date.now() - (20 - i) * 60 * 60 * 1000) / 1000 as Time,
        value: validPrice * (0.95 + Math.random() * 0.1)
      }));
    }

    return historicalPoints.sort((a, b) => (a.time as number) - (b.time as number));
  }, [historical, currentPrice]);

  // ✅ OPTIMIZED: Using useOptimizedChart hook instead of manual useEffect chart creation
  // Eliminates code duplication and follows React best practices
  const { chartContainerRef } = useOptimizedChart({
    height: 60,
    showGrid: false,
    showTimeScale: false,
    showRightPriceScale: false,
    onChartReady: (chart) => {
      if (chartData.length > 0) {
        void (async () => {
          const { LineSeries, LastPriceAnimationMode } = await loadLightweightCharts()

          const lineSeries = chart.addSeries(LineSeries, {
            lineWidth: 2,
            lastValueVisible: false,
            visible: true,
            priceLineVisible: false,
            color: isPositive ? "#10b981" : "#ef4444",
            lastPriceAnimation: LastPriceAnimationMode.Continuous,
          })
          
          lineSeries.setData(chartData)
          chart.timeScale().fitContent()
        })()
      }
    }
  })

  return (
    <Link href={buildWatchlistUrl(`/charts/${coingeckoId}`, selectedGroupSlug)} className="block">
      <Card className="w-[600px] bg-white/80 border-gray-200/50 hover:bg-white/90 hover:border-gray-300/60 dark:bg-zinc-950/30 dark:border-zinc-800/30 dark:hover:bg-zinc-950/50 dark:hover:border-zinc-700/50 transition-all duration-200 group relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.02] group-hover:opacity-[0.04] transition-opacity">
          <div
            className="h-full w-full"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='1' fill='rgba(255,255,255,0.1)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
            }}
          />
        </div>

        <CardHeader className="pb-3 relative">
          <div className="flex items-center justify-between">
            {/* Coin Image and Basic Info */}
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                <Image
                  src={image || "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png"}
                  alt={name}
                  fill
                  className="object-cover"
                  sizes="40px"
                  onError={(e) => {
                    // Fallback to a default CoinGecko image if the primary image fails
                    e.currentTarget.src = "https://coin-images.coingecko.com/coins/images/1/thumb/bitcoin.png"
                  }}
                />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-gray-800 dark:group-hover:text-zinc-100 transition-colors">{name}</h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">{symbol.toUpperCase()}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <span className="text-sm font-diatype-mono font-semibold text-gray-900 dark:text-white">
                <NumberFlow
                  value={currentPrice}
                  format={{
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: currentPrice >= 1 ? 2 : 6
                  }}
                  transformTiming={{ duration: 400, easing: 'ease-out' }}
                />
              </span>
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium",
                isPositive ? "text-emerald-500" : "text-rose-500"
              )}>
                <span>{isPositive ? "↗" : "↘"}</span>
                <NumberFlow
                  value={Math.abs(priceChangePercentage24h)}
                  format={{ 
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }}
                  suffix="%"
                  transformTiming={{ duration: 400, easing: 'ease-out' }}
                />
              </div>
            </div>
          </div>

          {marketCapRank && (
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-zinc-400 mt-2">
              <IconLaurelLeading className="w-4 h-4 fill-gray-400 dark:fill-zinc-600" />
              <span className="font-medium text-gray-700 dark:text-zinc-300">Rank #{marketCapRank}</span>
              <IconLaurelTrailing className="w-4 h-4 fill-gray-400 dark:fill-zinc-600" />
            </div>
          )}
        </CardHeader>
        
        <CardContent className="pt-0 relative">
          {/* Lightweight Chart */}
          <div className="w-full h-[60px] mb-4 rounded-lg overflow-hidden bg-gray-100/40 dark:bg-zinc-900/20">
            <div ref={chartContainerRef} className="w-full h-full" />
          </div>
          
          {/* Stats */}
          {(marketCap || totalVolume) && (
            <div className="flex justify-between gap-4 text-xs">
              {marketCap && (
                <div>
                  <span className="text-gray-500 dark:text-zinc-400 block mb-1">Market Cap</span>
                  <p className="font-diatype-mono text-gray-900 dark:text-white">${formatLargeNumber(marketCap)}</p>
                </div>
              )}
              {totalVolume && (
                <div>
                  <span className="text-gray-500 dark:text-zinc-400 block mb-1">Volume 24h</span>
                  <p className="font-diatype-mono text-gray-900 dark:text-white">${formatLargeNumber(totalVolume)}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}