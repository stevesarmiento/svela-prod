'use client'

import { Card, CardContent } from "@v1/ui/card"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { cn } from "@v1/ui/cn"
import Image from "next/image"
import NumberFlow from '@number-flow/react'

interface PriceCardProps {
  id: number
  name: string
  symbol: string
  price: number
  change24h: number
  marketCap?: number
  volume24h?: number
  rank?: number
}

export function PriceCard({ 
  id, 
  name, 
  symbol, 
  price, 
  change24h, 
  marketCap, 
  volume24h, 
  rank 
}: PriceCardProps) {
  const isPositive = change24h >= 0

  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Image
            src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`}
            alt={name}
            className="w-8 h-8 rounded-full"
            width={32}
            height={32}
          />
          <div>
            <h3 className="font-semibold text-sm">{name}</h3>
            <p className="text-xs text-muted-foreground">
              {symbol.toUpperCase()} {rank && `#${rank}`}
            </p>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
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
              isPositive ? "text-green-500" : "text-red-500"
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
          
          {(marketCap || volume24h) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {marketCap && (
                <div>
                  <span className="text-muted-foreground">Market Cap</span>
                  <p className="font-mono">${formatLargeNumber(marketCap)}</p>
                </div>
              )}
              {volume24h && (
                <div>
                  <span className="text-muted-foreground">Volume 24h</span>
                  <p className="font-mono">${formatLargeNumber(volume24h)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}