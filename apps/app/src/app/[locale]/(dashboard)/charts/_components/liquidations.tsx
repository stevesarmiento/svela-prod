'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import type { LiquidationData } from '@/types/coins'
import { Skeleton } from "@v1/ui/skeleton"
import { cn } from "@v1/ui/cn"

interface LiquidationsProps {
  symbols: string[]
}

export function Liquidations({ symbols }: LiquidationsProps) {
  const [liquidations, setLiquidations] = useState<LiquidationData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchLiquidations() {
      if (!symbols.length) return

      const now = Math.floor(Date.now() / 1000)
      const oneDayAgo = now - 24 * 60 * 60

      try {
        const response = await fetch(`/api/liquidations?` + new URLSearchParams({
          symbols: symbols.join(','),
          interval: '1hour',
          from: oneDayAgo.toString(),
          to: now.toString(),
          convert_to_usd: 'true'
        }))

        if (!response.ok) throw new Error('Failed to fetch liquidations')
        
        const data = await response.json()
        setLiquidations(data.data)
      } catch (error) {
        console.error('Error fetching liquidations:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLiquidations()
    const interval = setInterval(fetchLiquidations, 60000) // Refresh every minute

    return () => clearInterval(interval)
  }, [symbols])

  const totalLiquidations = liquidations.reduce((sum, liq) => sum + (liq.usd_value || 0), 0)
  const longLiquidations = liquidations.filter(liq => liq.side === 'long')
  const shortLiquidations = liquidations.filter(liq => liq.side === 'short')

  return (
      <Card>
      <CardHeader>
        <CardTitle className="font-medium font-mono">24h Liquidations</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
            <Card>
            <CardHeader>
              <CardTitle className="font-medium font-mono">24h Liquidations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground">Total</div>
                  <div className="text-2xl font-mono font-semibold">
                    ${formatLargeNumber(totalLiquidations)}
                  </div>
                </div>
                
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground">Longs</div>
                  <div className="text-2xl font-mono font-semibold text-red-500">
                    ${formatLargeNumber(longLiquidations.reduce((sum, liq) => sum + (liq.usd_value || 0), 0))}
                  </div>
                </div>
                
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground">Shorts</div>
                  <div className="text-2xl font-mono font-semibold text-green-500">
                    ${formatLargeNumber(shortLiquidations.reduce((sum, liq) => sum + (liq.usd_value || 0), 0))}
                  </div>
                </div>
              </div>
      
              <div className="mt-4 space-y-2">
                {liquidations.slice(0, 5).map((liq, index) => (
                  <div 
                    key={`${liq.symbol}-${liq.time}-${index}`}
                    className="flex justify-between items-center p-2 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{liq.symbol}</span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        liq.side === 'long' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
                      )}>
                        {liq.side.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">${formatLargeNumber(liq.usd_value || 0)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(liq.time * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}