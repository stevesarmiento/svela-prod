'use client'

import { Card, CardContent } from "@v1/ui/card"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { cn } from "@v1/ui/cn"
import Image from "next/image"
import Link from "next/link"
import NumberFlow from '@number-flow/react'
import { LineChart, Line, YAxis } from 'recharts'
import { useMemo } from 'react'
import { 
  IconLaurelLeading, 
  IconLaurelTrailing 
} from "symbols-react"

interface PriceCardProps {
  id: number
  name: string
  symbol: string
  price: number
  change24h: number
  marketCap?: number
  volume24h?: number
  rank?: number
  historical?: {
    data?: {
      quotes?: Array<{
        timestamp: string
        quote: {
          USD: {
            price: number
          }
        }
      }>
    }
  }
}

export function PriceCard({ 
  id, 
  name, 
  symbol, 
  price, 
  change24h, 
  marketCap, 
  volume24h, 
  rank,
  historical 
}: PriceCardProps) {
  const isPositive = change24h >= 0

  const chartData = useMemo(() => {
    if (!historical?.data?.quotes?.length) {
      // Fallback data for demo purposes
      return Array.from({ length: 20 }, (_, i) => ({
        time: Date.now() - (20 - i) * 60 * 60 * 1000,
        price: price * (0.95 + Math.random() * 0.1)
      }));
    }
    
    const historicalPoints = historical.data.quotes.map(quote => ({
      time: new Date(quote.timestamp).getTime(),
      price: quote.quote.USD.price
    }));

    return historicalPoints.sort((a, b) => a.time - b.time);
  }, [historical, price]);

  return (
    <Link href={`/charts/${id}`} className="block">
      <Card className="relative w-[320px] bg-gradient-to-b from-zinc-800/50 hover:from-zinc-800/80 to-zinc-800/20 hover:to-zinc-800/50 h-auto mx-auto hover:shadow-lg shadow-md transition-colors duration-200 ease-in-out cursor-pointer overflow-hidden rounded-[20px] border-zinc-800/50">
          <div
            className="absolute inset-0 z-0 size-full opacity-40 dark:opacity-30"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='5' cy='5' r='1' fill='rgba(255,250,250,0.1)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
            }}
          />
          <div
            className={`absolute bottom-0 left-0 h-[100%] w-screen bg-gradient-to-t from-zinc-900 via-zinc-900/0 to-zinc-900 dark:from-primary-950/0 dark:via-primary-950 dark:to-primary-950`}
          />
        <CardContent className="p-4 relative">
          {/* Blurred background image */}
          <div className="absolute top-0 left-0 w-24 h-24 -translate-x-2 -translate-y-2 z-0">
            <Image
              src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`}
              alt={`${name} background`}
              className="w-full h-full object-cover blur-[60px] opacity-20"
              width={96}
              height={96}
            />
          </div>
          
          {/* Main content */}
          <div className="relative z-10">
            {/* Header with coin info and ranking */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Image
                  src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`}
                  alt={name}
                  className="w-10 h-10 rounded-full"
                  width={32}
                  height={32}
                />
                <div>
                  <h3 className="font-semibold text-lg mb-0">{name}</h3>
                  <p className="text-sm text-muted-foreground mt-[-5px]">
                    {symbol.toUpperCase()}
                  </p>
                </div>
              </div>

            {/* Price and change */}
            <div className="flex flex-col items-end justify-between mb-4">
              <span className="text-lg font-mono font-semibold">
                <NumberFlow
                  value={price}
                  format={{
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: price >= 1 ? 2 : 6
                  }}
                  transformTiming={{ duration: 400, easing: 'ease-out' }}
                />
              </span>
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                isPositive ? "text-emerald-500" : "text-rose-500"
              )}>
                <span>{isPositive ? "↗" : "↘"}</span>
                <NumberFlow
                  value={Math.abs(change24h)}
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

            {/* Larger Chart */}
            <div className="w-full h-16 mb-4">
              <LineChart data={chartData} width={288} height={64}>
                <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                <Line
                  type="monotone"
                  dataKey="price"
                  dot={false}
                  strokeWidth={2}
                  stroke={isPositive ? "hsl(var(--success, 22 163 74))" : "hsl(var(--destructive, 239 68 68))"}
                />
              </LineChart>
            </div>
            
            {(marketCap || volume24h) && (
              <div className="flex flex-row items-center justify-between gap-2 text-xs">
                {marketCap && (
                  <div>
                    <span className="text-zinc-700 text-xs">Market Cap</span>
                    <p className="font-mono text-md">${formatLargeNumber(marketCap)}</p>
                  </div>
                )}
                {volume24h && (
                  <div>
                    <span className="text-zinc-700 text-xs">Volume 24h</span>
                    <p className="font-mono text-md">${formatLargeNumber(volume24h)}</p>
                  </div>
                )}
                {rank && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <IconLaurelLeading className="w-5 h-5 fill-zinc-700" />
                    <span className="font-medium text-white text-lg">{rank}</span>
                    <IconLaurelTrailing className="w-5 h-5 fill-zinc-700" />
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}