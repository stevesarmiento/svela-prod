'use client'

import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { cn } from "@v1/ui/cn"
import Image from "next/image"
import Link from "next/link"
import NumberFlow from '@number-flow/react'
import { useMemo, useEffect, useRef } from 'react'
import { 
  IconLaurelLeading, 
  IconLaurelTrailing 
} from "symbols-react"
import { buildWatchlistUrl } from '@/lib/navigation-utils'
import { useQueryState } from 'nuqs'
import {
  createChart,
  ColorType,
  Time,
  LastPriceAnimationMode,
  LineSeries,
} from 'lightweight-charts'

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
  const [selectedGroupSlug] = useQueryState('wg', { defaultValue: '' })
  const isPositive = change24h >= 0
  const chartContainerRef = useRef<HTMLDivElement>(null)

  const chartData = useMemo(() => {
    if (!historical?.data?.quotes?.length) {
      // Fallback data for demo purposes
      return Array.from({ length: 20 }, (_, i) => ({
        time: (Date.now() - (20 - i) * 60 * 60 * 1000) / 1000 as Time,
        value: price * (0.95 + Math.random() * 0.1)
      }));
    }
    
    const historicalPoints = historical.data.quotes.map(quote => ({
      time: (new Date(quote.timestamp).getTime() / 1000) as Time,
      value: quote.quote.USD.price
    }));

    return historicalPoints.sort((a, b) => (a.time as number) - (b.time as number));
  }, [historical, price]);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return

    const chart = createChart(chartContainerRef.current, {
      handleScale: false,
      handleScroll: false,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        borderVisible: false,
        visible: false,
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
    })

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

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: 60,
        })
      }
    }

    window.addEventListener("resize", handleResize)
    handleResize()

    return () => {
      window.removeEventListener("resize", handleResize)
      chart.remove()
    }
  }, [chartData, isPositive]);

  return (
    <Link href={buildWatchlistUrl(`/charts/${id}`, selectedGroupSlug)} className="block">
      <Card className="w-[600px] bg-zinc-950/30 border-zinc-800/30 hover:bg-zinc-950/50 hover:border-zinc-700/50 transition-all duration-200 group relative overflow-hidden">
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
            <div className="flex items-center gap-3">
              <div className="relative">
                <Image
                  src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`}
                  alt={name}
                  className="w-8 h-8 rounded-full ring-1 ring-zinc-700/30"
                  width={32}
                  height={32}
                />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white group-hover:text-zinc-100 transition-colors">{name}</h3>
                <p className="text-xs text-zinc-400">{symbol.toUpperCase()}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <span className="text-sm font-mono font-semibold text-white">
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
                "flex items-center gap-1 text-xs font-medium",
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

          {rank && (
            <div className="flex items-center gap-1 text-xs text-zinc-400 mt-2">
              <IconLaurelLeading className="w-4 h-4 fill-zinc-600" />
              <span className="font-medium text-zinc-300">Rank #{rank}</span>
              <IconLaurelTrailing className="w-4 h-4 fill-zinc-600" />
            </div>
          )}
        </CardHeader>
        
        <CardContent className="pt-0 relative">
          {/* Lightweight Chart */}
          <div className="w-full h-[60px] mb-4 rounded-lg overflow-hidden bg-zinc-900/20">
            <div ref={chartContainerRef} className="w-full h-full" />
          </div>
          
          {/* Stats */}
          {(marketCap || volume24h) && (
            <div className="flex justify-between gap-4 text-xs">
              {marketCap && (
                <div>
                  <span className="text-zinc-400 block mb-1">Market Cap</span>
                  <p className="font-mono text-white">${formatLargeNumber(marketCap)}</p>
                </div>
              )}
              {volume24h && (
                <div>
                  <span className="text-zinc-400 block mb-1">Volume 24h</span>
                  <p className="font-mono text-white">${formatLargeNumber(volume24h)}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}