'use client'

import { Card, CardContent } from "@v1/ui/card"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { cn } from "@v1/ui/cn"
import Image from "next/image"
import Link from "next/link"
import NumberFlow from '@/components/number-flow'
import { LineChart, Line, YAxis, XAxis, CartesianGrid } from 'recharts'
import { useMemo } from 'react'
import { buildWatchlistUrl } from '@/lib/navigation-utils'
import { useQueryState } from 'nuqs'

interface ComparisonCoin {
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

interface ComparisonCardProps {
  coins: ComparisonCoin[]
  title?: string
}

interface ChartDataPoint {
  time: number;
  [key: string]: number;
}

export function ComparisonCard({ 
  coins, 
  title = "Comparison" 
}: ComparisonCardProps) {
  const [selectedGroupSlug] = useQueryState('wg', { defaultValue: '' })
  
  const chartData = useMemo(() => {
    if (!coins.length) return []

    const timePoints = new Set<number>()
    const priceMap: Record<string, Record<number, number>> = {}

    // Collect all timestamps and organize prices by coin
    coins.forEach(coin => {
      if (coin.historical?.data?.prices) {
        coin.historical.data.prices.forEach(([timestamp, priceValue]) => {
          // Validate timestamp and price values
          if (typeof timestamp === 'number' && 
              typeof priceValue === 'number' && 
              !Number.isNaN(timestamp) && 
              !Number.isNaN(priceValue) && 
              priceValue > 0) {
            // CoinGecko timestamps are in milliseconds, convert to consistent format
            const timeMs = timestamp
            timePoints.add(timeMs)
            
            const coinId = coin.coingeckoId
            if (!priceMap[coinId]) priceMap[coinId] = {}
            priceMap[coinId][timeMs] = priceValue
          }
        })
      }
    })

    // Convert to array and sort timestamps
    const sortedTimePoints = Array.from(timePoints).sort()

    // Create data points with percentage changes
    return sortedTimePoints.map(time => {
      const dataPoint: ChartDataPoint = { time }
      
      coins.forEach(coin => {
        const coinId = coin.coingeckoId
        const firstTimestamp = sortedTimePoints[0] ?? time
        const initialPrice = priceMap[coinId]?.[firstTimestamp] || coin.currentPrice
        const currentPrice = priceMap[coinId]?.[time] || coin.currentPrice
        
        // Validate prices before calculating percentage
        if (typeof initialPrice === 'number' && 
            typeof currentPrice === 'number' && 
            !Number.isNaN(initialPrice) && 
            !Number.isNaN(currentPrice) && 
            initialPrice > 0) {
          dataPoint[coinId] = ((currentPrice - initialPrice) / initialPrice) * 100
        } else {
          dataPoint[coinId] = 0 // Default to 0% change if invalid data
        }
      })

      return dataPoint
    })
  }, [coins])

  const getRandomColor = (index: number) => {
    const colors = [
      'hsl(35, 91%, 65%)',   // Bitcoin orange
      'hsl(230, 100%, 67%)',  // Ethereum blue
      'hsl(260, 100%, 67%)',  // Purple
      'hsl(120, 61%, 50%)',   // Green
      'hsl(0, 100%, 67%)',    // Red
    ]
    return colors[index % colors.length]
  }

  return (
    <Link href={buildWatchlistUrl("/watchlist?wt=chart", selectedGroupSlug)} className="block">
      <Card className="relative w-[400px] bg-gradient-to-b from-zinc-800/50 hover:from-zinc-800/80 to-zinc-800/20 hover:to-zinc-800/50 h-auto mx-auto hover:shadow-lg shadow-md transition-colors duration-200 ease-in-out cursor-pointer overflow-hidden rounded-[20px] border-zinc-800/50">
        <div
          className="absolute inset-0 z-0 size-full opacity-40 dark:opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='5' cy='5' r='1' fill='rgba(255,250,250,0.1)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />
        
        <CardContent className="p-4 relative">
          {/* Main content */}
          <div className="relative z-10">
            {/* Header with coins */}
            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-3">{title}</h3>
              <div className="flex items-center gap-3 overflow-x-auto">
                {coins.map((coin) => (
                  <div key={coin.coingeckoId} className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
                    <Image
                          src={coin.image || "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png"}
                      alt={coin.name}
                          fill
                          className="object-cover"
                          sizes="32px"
                          onError={(e) => {
                            // Fallback to a default CoinGecko image if the primary image fails
                            e.currentTarget.src = "https://coin-images.coingecko.com/coins/images/1/thumb/bitcoin.png"
                          }}
                    />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{coin.symbol.toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground truncate">{coin.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-line Chart */}
            <div className="w-full h-24 mb-4">
              <LineChart data={chartData} width={368} height={96}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis 
                  dataKey="time"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  scale="time"
                  hide={true}
                />
                <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                {coins.map((coin, index) => {
                  const isPositive = coin.priceChangePercentage24h >= 0
                  return (
                    <Line
                      key={coin.coingeckoId}
                      type="monotone"
                      dataKey={coin.coingeckoId}
                      dot={false}
                      strokeWidth={2}
                      stroke={isPositive ? getRandomColor(index) : 'hsl(0, 100%, 67%)'}
                    />
                  )
                })}
              </LineChart>
            </div>

            {/* Price comparison grid */}
            <div className="grid grid-cols-1 gap-3">
              {coins.map((coin) => {
                const isPositive = coin.priceChangePercentage24h >= 0
                return (
                  <div key={coin.coingeckoId} className="flex items-center justify-between py-2 border-b border-zinc-700/30 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getRandomColor(coins.indexOf(coin)) }}
                      />
                      <span className="text-sm font-medium">{coin.symbol.toUpperCase()}</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-berkeley-mono">
                        <NumberFlow
                          value={coin.currentPrice}
                          format={{
                            style: 'currency',
                            currency: 'USD',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: coin.currentPrice >= 1 ? 2 : 6
                          }}
                          transformTiming={{ duration: 400, easing: 'ease-out' }}
                        />
                      </span>
                      
                      <div className={cn(
                        "flex items-center gap-1 text-xs font-medium min-w-0",
                        isPositive ? "text-emerald-500" : "text-rose-500"
                      )}>
                        <span>{isPositive ? "↗" : "↘"}</span>
                        <NumberFlow
                          value={Math.abs(coin.priceChangePercentage24h)}
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
                )
              })}
            </div>

            {/* Summary stats */}
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-zinc-700">Total Market Cap</span>
                <p className="font-berkeley-mono text-sm">
                  ${formatLargeNumber(coins.reduce((sum, coin) => sum + (coin.marketCap || 0), 0))}
                </p>
              </div>
              <div>
                <span className="text-zinc-700">Total Volume 24h</span>
                <p className="font-berkeley-mono text-sm">
                  ${formatLargeNumber(coins.reduce((sum, coin) => sum + (coin.totalVolume || 0), 0))}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}