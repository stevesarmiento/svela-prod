'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import type { LiquidationData } from '@/types/coins'
import { Skeleton } from "@v1/ui/skeleton"
import { cn } from "@v1/ui/cn"
import { useQuery } from '@tanstack/react-query'

interface LiquidationsProps {
  symbols: string[]
}

export function Liquidations({ symbols }: LiquidationsProps) {
  const symbolsKey = useMemo(() => {
    if (!symbols.length) return ''
    return symbols.slice().sort().join(',')
  }, [symbols])

  const { data: liquidations = [], isLoading } = useQuery({
    queryKey: ['liquidations', symbolsKey],
    enabled: symbols.length > 0,
    queryFn: async (): Promise<LiquidationData[]> => {
      const now = Math.floor(Date.now() / 1000)
      const oneDayAgo = now - 24 * 60 * 60

      const response = await fetch(`/api/liquidations?${new URLSearchParams({
        symbols: symbolsKey,
        interval: '1hour',
        from: oneDayAgo.toString(),
        to: now.toString(),
        convert_to_usd: 'true'
      })}`)

      if (!response.ok) throw new Error('Failed to fetch liquidations')
      
      const json: { data?: LiquidationData[] } = await response.json()
      return json.data ?? []
    },
    // Keep this query fresh without per-component intervals
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const totalLiquidations = liquidations.reduce((sum, liq) => sum + (liq.usd_value || 0), 0)
  const longLiquidations = liquidations.filter(liq => liq.side === 'long')
  const shortLiquidations = liquidations.filter(liq => liq.side === 'short')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium font-diatype-mono">24h Liquidations</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">Total</div>
                <div className="text-2xl font-diatype-mono font-semibold">
                  ${formatLargeNumber(totalLiquidations)}
                </div>
              </div>
              
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">Longs</div>
                <div className="text-2xl font-diatype-mono font-semibold text-rose-500">
                  ${formatLargeNumber(longLiquidations.reduce((sum, liq) => sum + (liq.usd_value || 0), 0))}
                </div>
              </div>
              
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">Shorts</div>
                <div className="text-2xl font-diatype-mono font-semibold text-emerald-500">
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
                    <span className="font-diatype-mono">{liq.symbol}</span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      liq.side === 'long' ? 'bg-red-500/10 text-rose-500' : 'bg-green-500/10 text-emerald-500'
                    )}>
                      {liq.side.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-diatype-mono">${formatLargeNumber(liq.usd_value || 0)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(liq.time * 1000).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}